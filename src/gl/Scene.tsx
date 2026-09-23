import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Preload, Sky, calcPosFromAngles } from '@react-three/drei'
import { CloudField } from './CloudField'
import { Plane } from './Plane'
import {
  CAMERA_Z,
  FOG_FAR,
  FOG_NEAR,
  FOV,
  SUN_AZIMUTH,
  SUN_INCLINATION,
} from './config'

/**
 * The world. One canvas, fixed behind the DOM, never interactive.
 *
 * The camera is stationary by design — every sense of speed comes from the
 * cloud field moving past it (see CloudField.tsx). The same dusk sky is used
 * twice: once as the background, and once baked into an environment map so the
 * aircraft is lit by the sky it is actually flying in rather than by studio
 * lights that happen to look similar.
 */

const SUN = calcPosFromAngles(SUN_INCLINATION, SUN_AZIMUTH)

function DuskSky() {
  return (
    <Sky
      distance={4000}
      sunPosition={SUN}
      turbidity={7}
      rayleigh={2.6}
      mieCoefficient={0.009}
      mieDirectionalG={0.85}
    />
  )
}

export default function Scene({ frameloop }: { frameloop: 'always' | 'never' }) {
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: FOV, near: 0.1, far: 500, position: [0, 0, CAMERA_Z] }}
    >
      <fog attach="fog" args={['#c98f74', FOG_NEAR, FOG_FAR]} />
      <DuskSky />

      {/* low, warm sun plus the sky's own bounce — no fill light */}
      <directionalLight position={SUN.clone().multiplyScalar(60)} intensity={2.1} color="#ffcfa0" />
      <hemisphereLight args={['#f0b98f', '#3a2f3d', 0.5]} />

      <Suspense fallback={null}>
        {/* frames={1}: the sky never changes, so bake it once and stop */}
        <Environment frames={1} resolution={128} background={false} environmentIntensity={0.85}>
          <DuskSky />
        </Environment>
        <Plane />
        <Preload all />
      </Suspense>

      <CloudField />
    </Canvas>
  )
}
