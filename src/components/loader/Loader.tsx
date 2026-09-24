import { useEffect, useRef } from 'react'
import {
  endLoader,
  getLoadParts,
  isLoaderFailed,
  setLoadPart,
  revealSection,
  setEntry,
  setLoaderReadout,
  state,
} from '../../flight/store'
import { RUNWAY_HEADING } from '../../flight/profile'
import { hasWebGL } from '../../gl/webgl'
import { createRunway, clamp, sstep, type Runway, type RunwayPhase } from './runway'
import './Loader.css'

/**
 * The takeoff. It is the first thing on screen and the last thing to leave.
 *
 * The whole sequence runs in one rAF loop on refs: React mounts the canvas and
 * the counter once and then hears nothing more from this file until the loader
 * is over. Nothing here reads layout per frame, and nothing here sets React
 * state per frame — a loader that stutters while it tells you the page is
 * loading is worse than no loader.
 *
 * Underneath, the real world is already mounting: `<Scene>` is requested from
 * the first frame, and the four things that have to happen before the page is
 * ready are exactly the four things the counter is counting.
 */

/* ---- what "loading" means, and what each part of it is worth ------------- */

const WEIGHTS = { fonts: 0.1, chunk: 0.25, assets: 0.5, world: 0.15 }

/** Display smoothing: the counter chases the real figure, it never jumps. */
const TAU_COUNT = 0.09

/* ---- the sequence, at the reference's timings ---------------------------- */

const HOLD_SECONDS = 0.75
const ROLL_SECONDS = 3.3
/** The last stretch of the roll, over which the real aircraft flies in. */
const ENTRY_SECONDS = 1.2
/** Ground speed at the end of the roll, and the two call-outs on the way. */
const V_LIFTOFF = 152
const V1 = 108
const V_ROTATE = 126
const ALT_HANDOFF = 1480
/** Skipping plays the rest of it at this rate. */
const SKIP_RATE = 4
/** No progress at all for this long and we stop waiting for the world. */
const STALL_SECONDS = 12

const pad = (n: number, w: number) => String(Math.max(0, Math.round(n))).padStart(w, '0')
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export function Loader({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const counter = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    const el = canvas.current
    const box = root.current
    if (!el || !box) return

    // A runway drawn over a world that will never appear is a promise the page
    // cannot keep: with no WebGL the site is the painted fallback, so the
    // loader is the counter and a fade, the same as under reduced motion.
    const reduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || !hasWebGL()
    const runway: Runway | null = reduced ? null : createRunway(el)
    // no 2D context either: there is nothing to draw, so take the plain path
    const plain = reduced || !runway

    if (plain) box.dataset.plain = 'true'
    runway?.resize()
    runway?.seed()

    /* ---- scroll lock --------------------------------------------------- */
    // the page is not scrollable until the flight is airborne. Lenis is
    // stopped in useLenis; this handles the native side and the browser's own
    // attempt to restore a scroll position from the last visit.
    const previousRestoration = history.scrollRestoration
    try {
      history.scrollRestoration = 'manual'
    } catch {
      // Safari private mode throws; the scrollTo below still does the job
    }
    window.scrollTo(0, 0)
    document.body.dataset.loader = 'active'

    /* ---- state --------------------------------------------------------- */
    let T = 0
    let p = 0
    let phase: RunwayPhase = 'load'
    let hand = 0
    let holdT = 0
    let speedup = 1
    let last = performance.now()
    let lastTarget = 0
    let stalled = 0
    let handedOff = false
    let fading = false
    let frame = 0
    const calls = new Set<string>()

    const readout = (next: Parameters<typeof setLoaderReadout>[0]) => setLoaderReadout(next)
    readout({ heading: RUNWAY_HEADING, phaseLabel: 'ON BLOCKS', callout: 'RWY 11' })

    const call = (text: string) => readout({ callout: text })

    /* ---- input --------------------------------------------------------- */
    const hover = window.matchMedia('(hover: hover)').matches
    const onPointerMove = (event: PointerEvent) => {
      runway?.setPointer((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1)
    }
    if (hover && !plain) window.addEventListener('pointermove', onPointerMove, { passive: true })

    // any key or click once the counter has arrived plays the rest at 4x
    const skip = () => {
      if (phase === 'hold' || phase === 'hand') speedup = SKIP_RATE
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') skip()
    }
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', onKey)

    // the first of the four parts the counter counts. The others are reported
    // by World and by the Scene chunk itself.
    document.fonts?.ready
      .then(() => setLoadPart('fonts', 1))
      .catch(() => setLoadPart('fonts', 1))

    const onResize = () => runway?.resize()
    window.addEventListener('resize', onResize)

    // a hidden tab gets no frames; the clock resets on the way back so the
    // sequence resumes where it was instead of jumping a whole hidden minute
    const onVisibility = () => {
      if (!document.hidden) last = performance.now()
    }
    document.addEventListener('visibilitychange', onVisibility)

    /* ---- the handoff ---------------------------------------------------- */

    /** Fade the overlay off the real sky. `seconds` 0 means "now". */
    const fadeOut = (seconds: number, delay = 0) => {
      if (fading) return
      fading = true
      box.style.transition = `opacity ${seconds}s ease ${delay}s`
      box.style.opacity = '0'
    }

    /**
     * The page takes over. The overlay is still on screen — by now it has
     * faded to nothing over the real sky — but everything underneath it stops
     * waiting: INTRO reveals, the rail and the masthead dissolve back in, the
     * instruments go back to reading the scroll and the scroll unlocks.
     */
    const handOff = () => {
      if (handedOff) return
      handedOff = true
      revealSection(0)
      document.body.dataset.loader = 'handoff'
      endLoader()
    }

    /** The end of the arrival: the overlay comes off the page for good. */
    const finish = () => {
      setEntry(1)
      handOff()
      done.current()
    }

    /* ---- the loop -------------------------------------------------------- */

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (document.hidden) {
        last = now
        return
      }
      const raw = clamp((now - last) / 1000, 0, 1 / 20)
      last = now
      // the load phase always runs in real time: only the flight can be skipped
      const dt = raw * (phase === 'load' ? 1 : speedup)
      T += raw

      if (phase === 'load') {
        const parts = getLoadParts()
        const target =
          100 *
          (parts.fonts * WEIGHTS.fonts +
            parts.chunk * WEIGHTS.chunk +
            parts.assets * WEIGHTS.assets +
            parts.world * WEIGHTS.world)

        // monotonic: the counter is a promise, and a promise that goes
        // backwards is a bug however honest the underlying number is
        const climbed = Math.max(target, lastTarget)
        stalled = climbed > lastTarget + 0.01 ? 0 : stalled + raw
        lastTarget = climbed

        p += (climbed - p) * (1 - Math.exp(-raw / TAU_COUNT))
        if (p > climbed) p = climbed

        // a glTF that will not load, or a world that never finishes: stop
        // waiting and let the page have its fallback
        if (isLoaderFailed() || stalled > STALL_SECONDS) {
          p = 100
          fadeOut(0.5)
          finish()
          phase = 'done'
        } else if (climbed >= 99.99 && p > 99.6) {
          p = 100
          phase = 'hold'
          if (plain) {
            // reduced motion, no WebGL, or no canvas: the counter was the
            // whole show
            fadeOut(0.6)
            finish()
            phase = 'done'
          } else {
            call('CLEARED FOR TAKEOFF')
          }
        }
      } else if (phase === 'hold') {
        holdT += dt
        if (holdT > 0.2 && hint.current) hint.current.dataset.on = 'true'
        if (holdT > 0.25 && counter.current) counter.current.style.opacity = '0'
        if (holdT > HOLD_SECONDS) {
          phase = 'hand'
          // the overlay dissolves onto the real sky while the aircraft is
          // still climbing through it, so the two pictures overlap
          fadeOut(1.2 / speedup, 1.6 / speedup)
        }
      } else if (phase === 'hand') {
        hand += dt / ROLL_SECONDS
        if (speedup > 1) fadeOut(0.4)
        if (hand > 0.8) {
          handOff()
          if (hint.current) hint.current.dataset.on = 'false'
        }
        if (hand >= 1) {
          hand = 1
          phase = 'done'
          finish()
          return
        }
      }

      if (counter.current) {
        counter.current.textContent = pad(p, 3)
        counter.current.setAttribute('aria-valuenow', String(Math.round(p)))
      }

      if (plain) {
        runway?.clear()
        return
      }

      runway!.clear()
      const view = runway!.draw(dt, { T, p, phase, hand, speedup })
      instruments(view.u, view.roll)
    }

    /**
     * The instruments report the same flight the canvas is drawing — the
     * reference's `instruments()`, writing into the store instead of into its
     * own DOM, so the real `<Hud>` reads it.
     */
    const instruments = (u: number, roll: number) => {
      const airborne = phase === 'hand' || phase === 'done'
      const speed = airborne ? Math.min(V_LIFTOFF, V_LIFTOFF * Math.pow(roll, 0.8)) : 0
      const altitude = airborne ? ALT_HANDOFF * easeOut(sstep(0.52, 1, u)) : 0
      readout({ speed, altitude })

      if (phase !== 'hand') return
      if (u > 0.02 && !calls.has('roll')) {
        calls.add('roll')
        readout({ phaseLabel: 'ROTATION' })
      }
      if (speed >= V1 && !calls.has('v1')) {
        calls.add('v1')
        call('V1')
      }
      if (speed >= V_ROTATE && !calls.has('vr')) {
        calls.add('vr')
        call('ROTATE')
      }
      if (u > 0.6 && !calls.has('pc')) {
        calls.add('pc')
        call('POSITIVE CLIMB')
        readout({ phaseLabel: 'CLIMB' })
      }

      // the real aircraft flies in over the last stretch of the roll
      const entryFrom = (ROLL_SECONDS - ENTRY_SECONDS) / ROLL_SECONDS
      setEntry((u - entryFrom) / (1 - entryFrom))
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      delete document.body.dataset.loader
      try {
        history.scrollRestoration = previousRestoration
      } catch {
        // as above: losing the restore mode is not worth failing a teardown
      }
      // whatever happened, the page must not be left with a dead loader on it
      if (state.loader.active) endLoader()
    }
  }, [])

  return (
    <div className="loader" ref={root}>
      <canvas className="loader__canvas" ref={canvas} aria-hidden="true" />
      <div
        className="loader__count mono"
        ref={counter}
        role="progressbar"
        aria-label="Loading"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
      >
        000
      </div>
      <div className="loader__hint" ref={hint} data-on="false" aria-hidden="true">
        Click or press any key to skip
      </div>
    </div>
  )
}
