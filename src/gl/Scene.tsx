import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Preload, useProgress } from '@react-three/drei'
import { ACESFilmicToneMapping, Mesh, Vector3 } from 'three'
import { failLoader, setLoadPart } from '../flight/store'
import { CloudField } from './CloudField'
import { Effects } from './Effects'
import { Plane } from './Plane'
import { SkyDome, SunDisc } from './Sky'
import {
  CAMERA_Z,
  FOG_COLOR,
  FOG_FAR,
  FOG_NEAR,
  FOV,
  SUN_DIRECTION,
} from './config'

/**
 * The world. One canvas, fixed behind the DOM, never interactive.
 *
 * The camera is stationary by design — every sense of speed comes from the
 * cloud field moving past it (see CloudField.tsx). The same golden-hour dome is
 * used twice: once as the background, and once baked into an environment map so
 * the aircraft is lit by the sky it is actually flying in rather than by studio
 * lights that happen to look similar.
 *
 * Tone mapping is ACES Filmic on the renderer itself, not in the effect chain —
 * see Effects.tsx for why.
 */

const SUN_VECTOR = new Vector3(...SUN_DIRECTION)

/**
 * The loader's two remaining signals, reported from inside the chunk that
 * actually knows them.
 *
 * `useProgress` is drei's view of three's loading manager, so it covers the
 * glTF and every texture it pulls in — and it lives here rather than in the
 * loader because importing it there would drag drei, and three behind it, into
 * the initial bundle that the whole lazy-chunk arrangement exists to keep small.
 */
function LoadProgress() {
  const { progress, errors } = useProgress()

  useEffect(() => {
    setLoadPart('assets', progress / 100)
  }, [progress])

  useEffect(() => {
    if (errors.length > 0) failLoader()
  }, [errors])

  return null
}

/**
 * Ready means drawn, not mounted. Compiling the shaders up front moves the
 * first-frame hitch to where it cannot be seen, and two rendered frames past
 * that is the earliest moment the world is genuinely on screen rather than
 * merely about to be.
 */
function WorldReady() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const frames = useRef(0)

  useEffect(() => {
    gl.compile(scene, camera)
  }, [gl, scene, camera])

  useFrame(() => {
    if (frames.current > 2) return
    frames.current += 1
    if (frames.current === 2) setLoadPart('world', 1)
  })

  return null
}

export default function Scene({ frameloop }: { frameloop: 'always' | 'never' }) {
  // GodRays needs the sun mesh, and the sun mesh only exists after the first
  // commit — so the chain waits a frame for it rather than guessing
  const [sun, setSun] = useState<Mesh | null>(null)

  return (
    <>
      <LoadProgress />
      <Canvas
      frameloop={frameloop}
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1,
      }}
      camera={{ fov: FOV, near: 0.1, far: 500, position: [0, 0, CAMERA_Z] }}
    >
      <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
      <SkyDome />
      <SunDisc ref={setSun} />

      {/* low, warm key plus the sky's own bounce — no fill light. The ground
          half of the hemisphere is lavender-slate, which is what keeps the
          shadowed side of every cloud violet instead of brown. */}
      <directionalLight
        position={SUN_VECTOR.clone().multiplyScalar(60)}
        intensity={2.4}
        color="#ffd2a4"
      />
      <hemisphereLight args={['#ffc894', '#95808f', 0.62]} />

      <Suspense fallback={null}>
        {/* frames={1}: the sky never changes, so bake it once and stop */}
        <Environment frames={1} resolution={128} background={false} environmentIntensity={0.95}>
          <SkyDome />
        </Environment>
        <Plane />
        <Preload all />
        <WorldReady />
      </Suspense>

      <CloudField />

      <Effects sun={sun} />
      </Canvas>
    </>
  )
}
