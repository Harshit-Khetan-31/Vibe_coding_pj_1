import { Component, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Decal } from '@react-three/drei'
import type { Mesh, Texture } from 'three'
import {
  LIVERY_INK,
  LIVERY_REGISTRATION,
  LIVERY_REG_HEIGHT,
  LIVERY_REG_STATION,
  LIVERY_TITLE,
  LIVERY_TITLE_HEIGHT,
  LIVERY_TITLE_STATION,
} from './config'
import { curvedPanel, drawTextTexture, measureAirframe, type Mark } from './paint'

/**
 * The paint job: "HARSHIT" down both sides of the rear fuselage, "VT-HRS" on
 * both sides of the fin.
 *
 * Both are projected onto the airframe mesh with drei's <Decal>, so they wrap
 * whatever shape is under them and are lit by the same golden-hour key as the
 * rest of the aircraft. Where the boxes go is measured off the geometry rather
 * than hand-placed — see paint.ts, which is also where the reasoning about
 * near-skin-only projection lives.
 *
 * If a projection throws — a different model, a geometry DecalGeometry cannot
 * clip — the boundary below swaps in a bowed panel at the same spot, which is
 * worse but is still an aircraft with a name on it.
 */

/* ---- orientation --------------------------------------------------------- */

/**
 * Both sides read nose-forward. The decal's local +X is the texture's reading
 * direction and its +Z is the projection axis, so the left side is a quarter
 * turn about X (+Z → −Y) and the right side is that plus a half turn about Y,
 * which flips the reading direction to match the other viewpoint.
 */
const ROTATION_LEFT: [number, number, number] = [Math.PI / 2, 0, 0]
const ROTATION_RIGHT: [number, number, number] = [Math.PI / 2, Math.PI, 0]

function Paint({ map }: { map: Texture }) {
  return (
    <meshStandardMaterial
      map={map}
      transparent
      depthTest
      polygonOffset
      polygonOffsetFactor={-14}
      polygonOffsetUnits={-4}
      roughness={0.45}
      metalness={0}
    />
  )
}

function Marks({ mark, map }: { mark: Mark; map: Texture }) {
  const { position, scale } = mark
  const mirrored: [number, number, number] = [position[0], -position[1], position[2]]

  return (
    <>
      <Decal position={mirrored} rotation={ROTATION_LEFT} scale={scale}>
        <Paint map={map} />
      </Decal>
      <Decal position={position} rotation={ROTATION_RIGHT} scale={scale}>
        <Paint map={map} />
      </Decal>
    </>
  )
}

function Panels({ mark, map }: { mark: Mark; map: Texture }) {
  const [width, height, reach] = mark.scale
  const geometry = useMemo(() => curvedPanel(width, height, reach * 0.12), [width, height, reach])
  useEffect(() => () => geometry.dispose(), [geometry])

  const out = reach * 0.82
  const z = mark.position[2]
  return (
    <>
      <mesh geometry={geometry} position={[mark.position[0], -out, z]} rotation={ROTATION_LEFT}>
        <meshStandardMaterial map={map} transparent roughness={0.45} metalness={0} />
      </mesh>
      <mesh geometry={geometry} position={[mark.position[0], out, z]} rotation={ROTATION_RIGHT}>
        <meshStandardMaterial map={map} transparent roughness={0.45} metalness={0} />
      </mesh>
    </>
  )
}

/* ---- the boundary -------------------------------------------------------- */

class DecalBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('livery: decal projection failed, using panels instead', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/* ---- the font ------------------------------------------------------------ */

/**
 * The canvas has to be drawn *after* Big Shoulders lands, or it is drawn in the
 * fallback face and stays that way — a CanvasTexture is a snapshot, not a
 * binding.
 */
function useDisplayFont(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    const done = () => {
      if (live) setReady(true)
    }
    if (!document.fonts) {
      done()
      return
    }
    document.fonts.load('700 256px "Big Shoulders Display"').then(done).catch(done)
    return () => {
      live = false
    }
  }, [])
  return ready
}

/* ---- the component ------------------------------------------------------- */

export function Livery({ fuselage }: { fuselage: Mesh }) {
  const fontReady = useDisplayFont()

  const art = useMemo(() => {
    if (!fontReady) return null
    try {
      return {
        title: drawTextTexture(LIVERY_TITLE, LIVERY_INK, { weight: 700, tracking: 0.06 }),
        registration: drawTextTexture(LIVERY_REGISTRATION, LIVERY_INK, {
          weight: 600,
          tracking: 0.1,
        }),
      }
    } catch {
      return null
    }
  }, [fontReady])

  useEffect(() => {
    if (!art) return
    return () => {
      art.title.texture.dispose()
      art.registration.texture.dispose()
    }
  }, [art])

  const airframe = useMemo(() => {
    if (!art) return null
    return measureAirframe(fuselage.geometry, {
      titleAspect: art.title.aspect,
      titleStation: LIVERY_TITLE_STATION,
      titleHeight: LIVERY_TITLE_HEIGHT,
      registrationAspect: art.registration.aspect,
      registrationStation: LIVERY_REG_STATION,
      registrationHeight: LIVERY_REG_HEIGHT,
    })
  }, [fuselage, art])

  if (!airframe || !art) return null

  const marks = (
    <>
      <Marks mark={airframe.title} map={art.title.texture} />
      <Marks mark={airframe.registration} map={art.registration.texture} />
    </>
  )

  const panels = (
    <>
      <Panels mark={airframe.title} map={art.title.texture} />
      <Panels mark={airframe.registration} map={art.registration.texture} />
    </>
  )

  return <DecalBoundary fallback={panels}>{marks}</DecalBoundary>
}
