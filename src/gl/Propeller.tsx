import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  type Material,
  Quaternion,
  Shape,
  ShaderMaterial,
  type ShaderMaterialParameters,
  Vector2,
  Vector3,
} from 'three'
import { state } from '../flight/store'
import { clamp } from './spring'
import {
  FINALE_DISC_OPACITY,
  PROP_BLADES,
  PROP_BLADE_TWIST,
  PROP_BLADE_TWIST_TIP_DEG,
  PROP_BLADE_WIDTH,
  PROP_BLUR_FROM,
  PROP_BLUR_TO,
  PROP_DISC_COLOR,
  PROP_DISC_OPACITY,
  PROP_ENV_INTENSITY,
  PROP_HUB_RADIUS,
  PROP_IDLE_RPS,
  PROP_INK,
  PROP_MAX_RPS,
  PROP_METALNESS,
  PROP_ROUGHNESS,
  PROP_TIP_COLOR,
  PROP_TIP_FRACTION,
  SUN_DIRECTION,
} from './config'

/**
 * The turning parts of the propeller, built here rather than taken from the
 * model.
 *
 * The glTF's own blades are fused into the airframe mesh, so they cannot turn.
 * `Plane.tsx` measures where they are, cuts them out of that mesh and mounts
 * this in their place — so the spinner and the cowling you see are still the
 * model's, and only the blades and the disc are generated.
 *
 * Blades and disc cross-fade on rpm. Below `PROP_BLUR_FROM` you see blades;
 * above `PROP_BLUR_TO` you see the disc; in between, both, each carrying
 * exactly the share of the other it is taking over, so nothing pops. The
 * visible rotation rate is capped well under the real one — past about twelve
 * revolutions a second a 60Hz display only shows you strobing, and the disc is
 * already carrying the speed.
 *
 * Every material is declared in the tree rather than constructed beside it, so
 * the frame loop reaches them through refs and R3F owns their disposal.
 */

/**
 * One blade: root at the origin, tip at +Y, thin in Z, and twisted.
 *
 * The twist is baked per vertex rather than applied as a rotation on the mesh,
 * because a real blade is not a flat plank set at an angle: it is steep at the
 * root, where the air arrives slowly, and progressively flatter out toward the
 * tip, which is travelling several times faster. Rotating the whole blade gives
 * you the angle but not the wind-up along it, and the wind-up is what catches
 * the light differently down the span.
 *
 * The outer `PROP_TIP_FRACTION` is painted in the tip warning colour, carried
 * in vertex colours so the whole blade is still one draw call.
 */
function bladeGeometry(radius: number): ExtrudeGeometry {
  const w = radius * PROP_BLADE_WIDTH
  const l = radius
  const shape = new Shape()
  shape.moveTo(-w * 0.5, 0)
  shape.quadraticCurveTo(-w * 0.62, l * 0.45, -w * 0.3, l * 0.94)
  shape.quadraticCurveTo(0, l * 1.02, w * 0.3, l * 0.94)
  shape.quadraticCurveTo(w * 0.55, l * 0.45, w * 0.5, 0)
  shape.closePath()

  const geometry = new ExtrudeGeometry(shape, {
    depth: radius * 0.02,
    bevelEnabled: false,
    curveSegments: 6,
  })
  geometry.translate(0, 0, radius * -0.01)

  const position = geometry.getAttribute('position')
  const tipTwist = PROP_BLADE_TWIST - (PROP_BLADE_TWIST_TIP_DEG * Math.PI) / 180
  const ink = new Color(PROP_INK)
  const tipColor = new Color(PROP_TIP_COLOR)
  const colors = new Float32Array(position.count * 3)

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)

    // span fraction, 0 at the root and 1 at the tip
    const u = clamp(y / Math.max(l, 1e-6), 0, 1)
    const angle = PROP_BLADE_TWIST + (tipTwist - PROP_BLADE_TWIST) * u
    const c = Math.cos(angle)
    const sn = Math.sin(angle)
    // rotate about the blade's own spanwise (Y) axis
    position.setXYZ(i, x * c + z * sn, y, -x * sn + z * c)

    const paint = u > 1 - PROP_TIP_FRACTION ? tipColor : ink
    colors[i * 3] = paint.r
    colors[i * 3 + 1] = paint.g
    colors[i * 3 + 2] = paint.b
  }
  position.needsUpdate = true
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

const DISC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * The blur disc.
 *
 * It is a disc of *air* with blades somewhere inside it, so it is dark and it
 * is faint: it darkens what is behind it rather than painting over it. Three
 * things keep it from reading as a sheet of plastic when it fills the screen in
 * the finale — a radial falloff at the rim and the hub, the faint concentric
 * banding a camera picks up off a turning propeller, and a thin painted tip
 * ring at the edge, which is the one part of a spinning propeller a real eye
 * actually resolves. The sun side is a touch brighter, because the blades there
 * are catching the light on their way past.
 */
const DISC_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec3 uTip;
  uniform vec2 uSun;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;

    // the ghost of the blades, and the banding a turning disc shows
    float lobes = 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 + uTime * 26.0);
    float bands = 0.92 + 0.08 * sin(r * 46.0 - uTime * 8.0);

    float rim = smoothstep(1.0, 0.62, r);
    float hub = smoothstep(0.05, 0.22, r);

    // the painted tips, smeared into a ring by the rotation
    float ring = smoothstep(0.90, 0.955, r) * (1.0 - smoothstep(0.975, 1.0, r));

    // blades on the sun side are lit as they pass; the far side is in shadow
    float sun = 0.5 + 0.5 * dot(normalize(p + 1e-5), uSun);
    float lit = 0.86 + 0.28 * sun;

    float alpha = uOpacity * rim * hub * bands * (0.42 + 0.58 * lobes) * (0.45 + 0.55 * r);
    alpha = mix(alpha, max(alpha, uOpacity * 1.35), ring);

    vec3 color = mix(uColor * lit, uTip, ring * 0.85);
    gl_FragColor = vec4(color, alpha);
  }
`

export type FinaleRef = MutableRefObject<{ boost: number; grow: number }>

const smoothstep01 = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function Propeller({
  radius,
  position,
  hub,
  finale,
}: {
  radius: number
  /** the mounting point, in the model's own normalized space */
  position: [number, number, number]
  /** draw the procedural hub and cone — only when the model has no spinner */
  hub: boolean
  finale: FinaleRef
}) {
  const spinner = useRef<Group>(null)
  const scaler = useRef<Group>(null)
  const blades = useRef<Group>(null)
  const discMesh = useRef<Mesh>(null)
  const disc = useRef<ShaderMaterial>(null)

  const geometry = useMemo(() => bladeGeometry(radius), [radius])
  // the one thing here R3F did not create, so the one thing it will not free
  useEffect(() => () => geometry.dispose(), [geometry])

  const angles = useMemo(
    () => Array.from({ length: PROP_BLADES }, (_, i) => (i * Math.PI * 2) / PROP_BLADES),
    [],
  )
  const discArgs = useMemo<[ShaderMaterialParameters]>(
    () => [
      {
        vertexShader: DISC_VERT,
        fragmentShader: DISC_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: new Color(PROP_DISC_COLOR) },
          uTip: { value: new Color(PROP_TIP_COLOR) },
          uSun: { value: new Vector2(1, 0) },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      },
    ],
    [],
  )

  const sunLocal = useRef(new Vector3())
  const worldQuaternion = useRef(new Quaternion())

  useFrame((_, delta) => {
    const dt = clamp(delta, 1 / 240, 1 / 20)
    const drive = Math.max(state.throttle, finale.current.boost)
    // idle is a floor, not a starting point: the engine is running the whole
    // way down the page, so the propeller never stops
    const rps = Math.max(PROP_IDLE_RPS + (PROP_MAX_RPS - PROP_IDLE_RPS) * drive, PROP_IDLE_RPS)

    // strobe guard: turn the blades at a speed a display can actually show, and
    // let the disc carry everything above it
    if (spinner.current) spinner.current.rotation.z += Math.min(rps, 12) * Math.PI * 2 * dt

    // The cross-fade is one number and its complement: the blades give up
    // exactly the opacity the disc takes on, both eased at the ends, so neither
    // appears or vanishes at a step. Walking the group beats collecting
    // material refs — nothing has to be kept in sync as the tree changes.
    const blur = smoothstep01((rps - PROP_BLUR_FROM) / (PROP_BLUR_TO - PROP_BLUR_FROM))
    const opacity = 1 - blur
    spinner.current?.traverse((child) => {
      const material = (child as Mesh).material as Material | Material[] | undefined
      if (material && !Array.isArray(material)) material.opacity = opacity
    })
    if (blades.current) blades.current.visible = opacity > 0.004

    if (disc.current) {
      const uniforms = disc.current.uniforms
      uniforms.uTime.value += dt

      // the sun, in the disc's own space, so the lit side stays lit as the
      // aircraft turns rather than being baked into the texture
      if (discMesh.current) {
        discMesh.current.getWorldQuaternion(worldQuaternion.current)
        const local = sunLocal.current
          .set(SUN_DIRECTION[0], SUN_DIRECTION[1], SUN_DIRECTION[2])
          .applyQuaternion(worldQuaternion.current.invert())
        const length = Math.hypot(local.x, local.y)
        if (length > 1e-4) uniforms.uSun.value.set(local.x / length, local.y / length)
      }

      // the finale opens the disc all the way: it is the last thing on screen
      const base = PROP_DISC_OPACITY * blur
      uniforms.uOpacity.value = base + (FINALE_DISC_OPACITY - base) * finale.current.boost
    }

    scaler.current?.scale.setScalar(finale.current.grow)
  })

  return (
    <group position={position}>
      <group ref={scaler}>
        <group ref={spinner}>
          <group ref={blades}>
            {angles.map((angle, i) => (
              <group key={i} rotation={[0, 0, angle]}>
                <mesh geometry={geometry}>
                  <meshStandardMaterial
                    vertexColors
                    metalness={PROP_METALNESS}
                    roughness={PROP_ROUGHNESS}
                    envMapIntensity={PROP_ENV_INTENSITY}
                    transparent
                    side={DoubleSide}
                  />
                </mesh>
              </group>
            ))}
          </group>
          {/* hub and spinner cone, for the case where the model has none of
              its own — with a measured spinner these sit inside it */}
          {hub && (
            <>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry
                  args={[
                    radius * PROP_HUB_RADIUS,
                    radius * PROP_HUB_RADIUS * 1.15,
                    radius * 0.2,
                    14,
                  ]}
                />
                <meshStandardMaterial
                  color={PROP_INK}
                  metalness={PROP_METALNESS}
                  roughness={PROP_ROUGHNESS}
                  envMapIntensity={PROP_ENV_INTENSITY}
                  transparent
                />
              </mesh>
              <mesh position={[0, 0, -radius * 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[radius * PROP_HUB_RADIUS, radius * 0.22, 14]} />
                <meshStandardMaterial
                  color={PROP_INK}
                  metalness={PROP_METALNESS}
                  roughness={PROP_ROUGHNESS * 0.7}
                  envMapIntensity={PROP_ENV_INTENSITY}
                  transparent
                />
              </mesh>
            </>
          )}
        </group>
        {/* the disc does not turn — its smear does, in the shader */}
        <mesh ref={discMesh} position={[0, 0, -radius * 0.04]}>
          <circleGeometry args={[radius, 64]} />
          <shaderMaterial ref={disc} args={discArgs} />
        </mesh>
      </group>
    </group>
  )
}
