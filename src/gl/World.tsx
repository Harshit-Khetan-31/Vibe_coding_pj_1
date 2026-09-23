import { Suspense, lazy, useEffect, useState } from 'react'
import { measureLayout } from '../flight/layout'
import { buildTrack } from '../flight/track'
import { setPointer, setTrack } from '../flight/store'
import { SkyFallback } from './SkyFallback'
import { hasWebGL } from './webgl'
import './World.css'

/**
 * The one world layer, and the decision of which world to show.
 *
 * three.js is never in the initial bundle: the canvas is a lazy chunk that is
 * only requested once we know the machine can draw it and the visitor has not
 * asked for stillness. Until then — and permanently, in the fallback cases —
 * the page shows the painted dusk instead, which is a complete picture rather
 * than an apology for a missing one.
 *
 * This component also owns the track: it measures the DOM, rebuilds on real
 * layout changes only, and feeds the store. That happens in every case,
 * fallback included, so the HUD works with no WebGL at all.
 */

const Scene = lazy(() => import('./Scene'))

export function World() {
  const [enabled, setEnabled] = useState(false)
  const [frameloop, setFrameloop] = useState<'always' | 'never'>('always')

  /* track: measured from the DOM, rebuilt only when the layout really moves -- */
  useEffect(() => {
    let signature = ''
    let frame = 0
    let timer = 0

    const rebuild = () => {
      const layout = measureLayout()
      if (layout.signature === signature) return
      signature = layout.signature
      setTrack(buildTrack(layout))
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        frame = requestAnimationFrame(rebuild)
      }, 120)
    }

    rebuild()

    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    window.addEventListener('resize', schedule)
    // web fonts change section heights, which moves every anchor
    document.fonts?.ready.then(schedule).catch(() => {})

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [])

  /* capability + preference gate ------------------------------------------- */
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setEnabled(!motion.matches && hasWebGL())
    apply()
    motion.addEventListener('change', apply)
    return () => motion.removeEventListener('change', apply)
  }, [])

  /* a hidden tab renders nothing at all ------------------------------------ */
  useEffect(() => {
    const onVisibility = () => setFrameloop(document.hidden ? 'never' : 'always')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /* cursor — the aircraft leans toward the side the pointer is on ----------- */
  useEffect(() => {
    if (!enabled || !window.matchMedia('(hover: hover)').matches) return
    const onMove = (event: PointerEvent) => {
      setPointer(
        (event.clientX / window.innerWidth - 0.5) * 2,
        (event.clientY / window.innerHeight - 0.5) * 2,
      )
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled])

  if (!enabled) return <SkyFallback />

  return (
    <div className="world" aria-hidden="true">
      <Suspense fallback={<SkyFallback />}>
        <Scene frameloop={frameloop} />
      </Suspense>
    </div>
  )
}
