import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Cloud, Clouds } from '@react-three/drei'
import { Group, MeshLambertMaterial } from 'three'
import { state } from '../flight/store'
import { CLOUD_LAYERS, CLOUD_TEXTURE, type CloudLayer } from './config'
import { clamp } from './spring'

/**
 * Four parallax cloud layers: three of billowing cumulus, plus a thin stratus
 * sheet parked low and far back to give the horizon a floor.
 *
 * The camera never moves: the world streams past it. Each cloud drifts toward
 * the viewer at its layer's cruise speed plus whatever the scroll is adding, so
 * scrolling faster genuinely *is* flying faster, and recycles to the back of
 * its layer once it has passed behind the camera. Depth alone would give some
 * parallax; the per-layer speeds exaggerate it until you can feel it.
 */

/** Deterministic per-cloud placement, so a remount looks identical. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

type Seeded = { x: number; y: number; z: number; seed: number }

function seedLayer(layer: CloudLayer, index: number): Seeded[] {
  const out: Seeded[] = []
  const depth = layer.far - layer.near
  for (let i = 0; i < layer.count; i++) {
    const n = index * 97 + i * 13
    out.push({
      x: (hash(n) - 0.5) * 2 * layer.spreadX,
      y: layer.offsetY + (hash(n + 1) - 0.5) * 2 * layer.spreadY,
      // evenly spaced down the layer, jittered — no visible conga line
      z: -(layer.near + (i / layer.count) * depth + hash(n + 2) * (depth / layer.count)),
      seed: n,
    })
  }
  return out
}

function Layer({ layer, index }: { layer: CloudLayer; index: number }) {
  const seeds = useMemo(() => seedLayer(layer, index), [layer, index])
  const refs = useRef<Array<Group | null>>([])

  useFrame((_, delta) => {
    const dt = clamp(delta, 1 / 240, 1 / 20)
    // scroll down (positive velocity) = flying forward = clouds come at you
    const speed = layer.baseSpeed + state.velocity * layer.scrollSpeed
    const depth = layer.far - layer.near

    for (let i = 0; i < refs.current.length; i++) {
      const group = refs.current[i]
      if (!group) continue
      group.position.z += speed * dt

      // recycle: wrap in whichever direction it left, so reversing the scroll
      // refills the layer from the front instead of emptying it
      if (group.position.z > -layer.near + depth * 0.15) {
        group.position.z -= depth
        group.position.x = (hash(group.id * 7 + group.position.z) - 0.5) * 2 * layer.spreadX
      } else if (group.position.z < -layer.far - depth * 0.15) {
        group.position.z += depth
        group.position.x = (hash(group.id * 11 - group.position.z) - 0.5) * 2 * layer.spreadX
      }
    }
  })

  return (
    <Clouds
      material={MeshLambertMaterial}
      texture={CLOUD_TEXTURE}
      limit={layer.count * layer.segments + 8}
      frustumCulled={false}
    >
      {seeds.map((seed, i) => (
        <group
          key={seed.seed}
          position={[seed.x, seed.y, seed.z]}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Cloud
            seed={seed.seed}
            segments={layer.segments}
            bounds={[
              layer.volume * 1.6,
              layer.volume * 0.45 * layer.flatten,
              layer.volume * (layer.flatten < 0.5 ? 0.5 : 1),
            ]}
            volume={layer.volume}
            growth={layer.growth}
            opacity={layer.opacity}
            color={layer.color}
            // drei's own drift is off: this field's motion is the world's, and
            // two independent motions read as mush
            speed={0}
            fade={layer.far}
          />
        </group>
      ))}
    </Clouds>
  )
}

export function CloudField() {
  return (
    <>
      {CLOUD_LAYERS.map((layer, i) => (
        <Layer key={i} layer={layer} index={i} />
      ))}
    </>
  )
}
