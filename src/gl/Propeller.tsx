import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  type Material,
  Shape,
  ShaderMaterial,
  type ShaderMaterialParameters,
} from 'three'
import { state } from '../flight/store'
import { clamp } from './spring'
import {
  PROP_BLADES,
  PROP_BLADE_TWIST,
  PROP_BLADE_WIDTH,
  PROP_BLUR_FROM,
  PROP_BLUR_TO,
  PROP_HUB_RADIUS,
  PROP_IDLE_RPS,
  PROP_INK,
  PROP_MAX_RPS,
} from './config'

/**
 * A real propeller, built here rather than taken from the model.
 *
 * The glTF's own propeller is fused into the airframe mesh, so it cannot turn —
 * which was survivable while the aircraft was seen from behind and is not now
 * that it crosses the screen side-on and, in the finale, flies straight at the
 * viewer. So the blades are generated: `PROP_BLADES` tapered, twisted planforms
 * on a hub, plus the translucent disc a turning propeller actually reads as.
 *
 * Blades and disc cross-fade on rpm. Below `PROP_BLUR_FROM` you see blades;
 * above `PROP_BLUR_TO` you see a disc with a faint three-lobed smear turning
 * inside it; in between, both. The visible rotation rate is capped well under
 * the real one — past about twelve revolutions a second a 60Hz display only
 * shows you strobing, and the disc is already carrying the speed.
 *
 * Every material is declared in the tree rather than constructed beside it, so
 * the frame loop reaches them through refs and R3F owns their disposal.
 */

/** One blade: root at the origin, tip at +Y, thin in Z. */
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
 * The blur disc. Alpha falls off at the rim and at the hub, and three faint
 * lobes rotate inside it — the ghost of the blades, which is what stops it
 * reading as a flat sheet of plastic when it fills the screen in the finale.
 */
const DISC_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;

    float lobes = 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 + uTime * 26.0);
    float rim = smoothstep(1.0, 0.82, r);
    float hub = smoothstep(0.05, 0.22, r);
    float alpha = uOpacity * rim * hub * (0.42 + 0.58 * lobes) * (0.45 + 0.55 * r);

    gl_FragColor = vec4(uColor, alpha);
  }
`

export type FinaleRef = MutableRefObject<{ boost: number; grow: number }>

export function Propeller({ radius, z, finale }: { radius: number; z: number; finale: FinaleRef }) {
  const spinner = useRef<Group>(null)
  const scaler = useRef<Group>(null)
  const blades = useRef<Group>(null)
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
          uColor: { value: new Color('#ffeacf') },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      },
    ],
    [],
  )

  useFrame((_, delta) => {
    const dt = clamp(delta, 1 / 240, 1 / 20)
    const drive = Math.max(state.throttle, finale.current.boost)
    const rps = PROP_IDLE_RPS + (PROP_MAX_RPS - PROP_IDLE_RPS) * drive

    // strobe guard: turn the blades at a speed a display can actually show, and
    // let the disc carry everything above it
    if (spinner.current) spinner.current.rotation.z += Math.min(rps, 12) * Math.PI * 2 * dt

    // the blades, the hub and the spinner all fade together as the disc takes
    // over. Walking the group beats collecting material refs: there are five
    // nodes under it, and nothing has to be kept in sync as the tree changes.
    const blur = clamp((rps - PROP_BLUR_FROM) / (PROP_BLUR_TO - PROP_BLUR_FROM), 0, 1)
    const opacity = 1 - 0.68 * blur
    spinner.current?.traverse((child) => {
      const material = (child as Mesh).material as Material | Material[] | undefined
      if (material && !Array.isArray(material)) material.opacity = opacity
    })
    if (blades.current) blades.current.visible = opacity > 0.02

    if (disc.current) {
      const uniforms = disc.current.uniforms
      uniforms.uTime.value += dt
      // the finale opens the disc all the way: it is the last thing on screen
      const base = 0.05 + 0.45 * blur
      uniforms.uOpacity.value = base + (0.95 - base) * finale.current.boost
    }

    scaler.current?.scale.setScalar(finale.current.grow)
  })

  return (
    <group position={[0, 0, z]}>
      <group ref={scaler}>
        <group ref={spinner}>
          <group ref={blades}>
            {angles.map((angle, i) => (
              <group key={i} rotation={[0, 0, angle]}>
                <mesh geometry={geometry} rotation={[0, PROP_BLADE_TWIST, 0]}>
                  <meshStandardMaterial
                    color={PROP_INK}
                    metalness={0.35}
                    roughness={0.52}
                    transparent
                    side={DoubleSide}
                  />
                </mesh>
              </group>
            ))}
          </group>
          {/* hub and spinner cone, so the blades have something to come out of */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[radius * PROP_HUB_RADIUS, radius * PROP_HUB_RADIUS * 1.15, radius * 0.2, 14]}
            />
            <meshStandardMaterial
              color={PROP_INK}
              metalness={0.35}
              roughness={0.52}
              transparent
            />
          </mesh>
          <mesh position={[0, 0, -radius * 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[radius * PROP_HUB_RADIUS, radius * 0.22, 14]} />
            <meshStandardMaterial
              color={PROP_INK}
              metalness={0.5}
              roughness={0.35}
              transparent
            />
          </mesh>
        </group>
        {/* the disc does not turn — its smear does, in the shader */}
        <mesh position={[0, 0, -radius * 0.04]}>
          <circleGeometry args={[radius, 56]} />
          <shaderMaterial ref={disc} args={discArgs} />
        </mesh>
      </group>
    </group>
  )
}
