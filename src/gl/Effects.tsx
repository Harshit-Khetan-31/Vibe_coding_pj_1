import { useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, GodRays, Vignette } from '@react-three/postprocessing'
import { BlendFunction, KernelSize, Resolution } from 'postprocessing'
import type { Mesh } from 'three'
import {
  BLOOM_INTENSITY,
  BLOOM_SMOOTHING,
  BLOOM_THRESHOLD,
  GODRAYS_DECAY,
  GODRAYS_DENSITY,
  GODRAYS_EXPOSURE,
  GODRAYS_WEIGHT,
  MOBILE_MAX_WIDTH,
  VIGNETTE_DARKNESS,
  VIGNETTE_OFFSET,
} from './config'

/**
 * The grade. Three effects, in the order light actually behaves: the sun's
 * shafts are cast, the bright edges bloom, and the frame falls off at the
 * corners so the text has somewhere dark to sit.
 *
 * Tone mapping is *not* an effect here — the renderer is left on ACES Filmic
 * (see Scene.tsx), which applies during the render pass. Adding a ToneMapping
 * effect on top of it would grade the image twice.
 *
 * A phone gets bloom and nothing else: god rays are a second full-screen pass
 * over a depth-sampled radial blur, and that is the first thing to go.
 */

export function Effects({ sun }: { sun: Mesh | null }) {
  const width = useThree((s) => s.size.width)
  const desktop = width > MOBILE_MAX_WIDTH

  return (
    <EffectComposer multisampling={desktop ? 4 : 0} enableNormalPass={false}>
      {desktop && sun ? (
        <GodRays
          sun={sun}
          blendFunction={BlendFunction.SCREEN}
          samples={50}
          density={GODRAYS_DENSITY}
          decay={GODRAYS_DECAY}
          weight={GODRAYS_WEIGHT}
          exposure={GODRAYS_EXPOSURE}
          clampMax={1}
          // half-res: the shafts are low frequency, nobody can tell
          resolutionScale={0.5}
          kernelSize={KernelSize.SMALL}
          blur
        />
      ) : (
        <></>
      )}
      <Bloom
        intensity={BLOOM_INTENSITY}
        luminanceThreshold={BLOOM_THRESHOLD}
        luminanceSmoothing={BLOOM_SMOOTHING}
        mipmapBlur
        resolutionX={Resolution.AUTO_SIZE}
        resolutionY={Resolution.AUTO_SIZE}
      />
      {desktop ? (
        <Vignette
          eskil={false}
          offset={VIGNETTE_OFFSET}
          darkness={VIGNETTE_DARKNESS}
          blendFunction={BlendFunction.NORMAL}
        />
      ) : (
        <></>
      )}
    </EffectComposer>
  )
}
