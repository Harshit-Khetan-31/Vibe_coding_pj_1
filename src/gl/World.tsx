import { Suspense, lazy, useEffect, useState } from 'react'
import { measureLayout } from '../flight/layout'
import { buildTrack } from '../flight/track'
import { setLoadPart, setPointer, setTrack } from '../flight/store'
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

/**
 * The Scene chunk is a quarter of the loader's progress bar, so the import is
 * where that quarter is reported from — the promise resolving is exactly the
 * event being counted, and nothing has to guess at it from outside.
 */
const Scene = lazy(() =>
  import('./Scene').then((module) => {
    setLoadPart('chunk', 1)
    return module
  }),
)

export function World() {
  // null while the capability check has not run yet: "we don't know" and "no"
  // are different answers, and the loader's counter depends on the difference
  const [enabled, setEnabled] = useState<boolean | null>(null)
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

  /**
   * No WebGL, or stillness asked for: there is no chunk to fetch, no glTF to
   * decode and no first frame to wait on, so the three parts of the loader's
   * count that belong to the world are satisfied at once. Without this the
   * counter would sit at 10% forever on exactly the machines least able to
   * wait for it.
   */
  useEffect(() => {
    if (enabled !== false) return
    setLoadPart('chunk', 1)
    setLoadPart('assets', 1)
    setLoadPart('world', 1)
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
