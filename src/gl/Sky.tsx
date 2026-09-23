import { forwardRef, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, Color, Mesh, ShaderMaterial, Vector3 } from 'three'
import { state } from '../flight/store'
import {
  SEA_DRIFT,
  SEA_LIT,
  SEA_SCALE,
  SEA_SHADE,
  SKY_HAZE,
  SKY_HIGH,
  SKY_HORIZON,
  SKY_MID,
  SKY_ZENITH,
  SUN_DIRECTION,
  SUN_DISTANCE,
  SUN_GLOW,
  SUN_RADIUS,
} from './config'

/**
 * Golden hour, as one shader.
 *
 * Everything the sky is made of lives in a single dome: the vertical gradient
 * (deep indigo overhead, peach through the middle, amber at eye level), the
 * sun's atmospheric glow, and — below eye level — a sea of cloud tops seen from
 * above rather than a ground plane.
 *
 * The sea is raymarched trivially: for a ray pointing down, the distance to an
 * imagined deck is 1/|d.y|, which compresses the noise toward eye level exactly
 * the way perspective would. It is then dissolved into the horizon haze as it
 * approaches eye level, which is the whole point — there is no horizon *line*
 * anywhere in this scene, just a sea that stops being legible.
 *
 * The sun disc is a separate mesh rather than part of the dome, because
 * GodRays needs something it can occlude.
 */

const VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vDir;

  uniform vec3 uSun;
  uniform vec3 uZenith;
  uniform vec3 uHigh;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uGlow;
  uniform vec3 uSeaLit;
  uniform vec3 uSeaShade;
  uniform float uSeaScale;
  uniform float uSeaOffset;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  /* Detail fades the small octaves out near the horizon, where one pixel covers
     several kilometres of sea and the high frequencies would only alias.

     Each octave is also rotated as well as scaled. Without the rotation every
     octave shares the same axes, the value-noise lattice lines up with itself
     and the sea shows a faint square grid — the "tiling" you can see once you
     have noticed it. An irrational-ish angle per octave means the lattices
     never agree again. */
  float fbm(vec2 p, float detail) {
    const mat2 rot = mat2(0.8384, 0.545, -0.545, 0.8384);
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      float k = i < 2 ? 1.0 : detail;
      v += a * k * vnoise(p);
      p = rot * p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);

    /* ---- the gradient --------------------------------------------------- */
    // the visible band is only ±21° (FOV 42), so the whole gradient has to
    // resolve inside d.y ∈ [-0.36, 0.36] — ramps tuned for a dome would leave
    // the top of the frame stuck in the peach
    float up = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.05, up));
    col = mix(col, uHigh, smoothstep(0.035, 0.15, up));
    col = mix(col, uZenith, smoothstep(0.12, 0.34, up));

    /* ---- the sun's glow (the disc itself is a mesh) --------------------- */
    float c = max(dot(d, uSun), 0.0);
    float inner = pow(c, 320.0);
    float halo = pow(c, 40.0);
    float wash = pow(c, 6.0) * smoothstep(0.30, -0.04, abs(d.y));
    col += uGlow * (inner * 1.5 + halo * 0.34 + wash * 0.14);

    /* ---- the sea of clouds ---------------------------------------------- */
    float below = max(-d.y, 0.0);
    if (below > 0.0) {
      float t = 1.0 / max(below, 0.0035);
      vec2 p = vec2(d.x, d.z) * t * uSeaScale + vec2(0.0, uSeaOffset);
      float detail = smoothstep(0.02, 0.20, below);

      float f = fbm(p, detail);
      // a wide ramp: a tight one turns the sea into hard-edged islands, and it
      // is meant to be a soft deck seen from a long way up
      float tops = smoothstep(0.30, 0.80, f);
      float rim = smoothstep(0.44, 0.70, f) - smoothstep(0.62, 0.92, f);
      float sunward = 0.5 + 0.5 * dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(uSun.xz));

      vec3 sea = mix(uSeaShade, uSeaLit, tops);
      // the golden rims are what makes it read as lit from the side rather than
      // as a texture, so they carry more of the colour than the tops do
      sea += uGlow * rim * (0.08 + 0.3 * sunward);
      // the sea loses its contrast well before it reaches eye level, so the two
      // halves of the frame meet in haze instead of along an edge — and the
      // far field, where any repeat would show, is haze rather than sea
      sea = mix(uHaze, sea, smoothstep(0.03, 0.40, below));
      col = mix(col, sea, smoothstep(0.0, 0.26, below));
    }

    // ACES rolls the highlights off hard, so the palette is pushed a little
    // before it rather than repainted after it
    col *= 1.06;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** The dome. No interaction — it is also what the env map is baked from. */
export function SkyDome() {
  const mesh = useRef<Mesh>(null)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uSun: { value: new Vector3(...SUN_DIRECTION) },
          uZenith: { value: new Color(SKY_ZENITH) },
          uHigh: { value: new Color(SKY_HIGH) },
          uMid: { value: new Color(SKY_MID) },
          uHorizon: { value: new Color(SKY_HORIZON) },
          uHaze: { value: new Color(SKY_HAZE) },
          uGlow: { value: new Color(SUN_GLOW) },
          uSeaLit: { value: new Color(SEA_LIT) },
          uSeaShade: { value: new Color(SEA_SHADE) },
          uSeaScale: { value: SEA_SCALE },
          uSeaOffset: { value: 0 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    [],
  )

  // the sea slides forward with the flight, slowly — it is meant to be a long
  // way down, so it can only ever creep. The uniform is reached through the
  // mesh at frame time rather than through the memo, which is not ours to write
  useFrame((_, delta) => {
    const live = mesh.current?.material as ShaderMaterial | undefined
    if (!live) return
    const dt = delta > 0.05 ? 0.05 : delta
    live.uniforms.uSeaOffset.value -= (SEA_DRIFT + state.velocity * SEA_DRIFT * 6) * dt
  })

  return (
    <mesh ref={mesh} material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 24]} />
    </mesh>
  )
}

/**
 * The disc itself: bright, unlit, un-tone-mapped so bloom has something well
 * above threshold to catch, and handed to GodRays as the light source.
 */
export const SunDisc = forwardRef<Mesh>(function SunDisc(_props, ref) {
  const position = useMemo(
    () => new Vector3(...SUN_DIRECTION).multiplyScalar(SUN_DISTANCE),
    [],
  )

  return (
    <group position={position}>
      <mesh ref={ref} renderOrder={-900}>
        <sphereGeometry args={[SUN_RADIUS, 24, 16]} />
        <meshBasicMaterial color="#fff3de" toneMapped={false} fog={false} depthWrite={false} />
      </mesh>
      {/* a soft corona so the disc does not end on a hard circle */}
      <mesh renderOrder={-899}>
        <sphereGeometry args={[SUN_RADIUS * 2.6, 20, 14]} />
        <meshBasicMaterial
          color={SUN_GLOW}
          toneMapped={false}
          fog={false}
          transparent
          opacity={0.2}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  )
})
