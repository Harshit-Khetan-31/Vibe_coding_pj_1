import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  getGeometryVersion,
  getPhaseIndex,
  getTrack,
  state,
  subscribeFrame,
  subscribeGeometry,
  subscribePhase,
} from '../../flight/store'
import { SECTION_IDS, SECTION_LABELS } from '../../flight/profile'
import './Hud.css'

/**
 * The instruments. Every value is a function of scroll progress or of the path
 * tangent, so nothing here is arbitrary. React renders this component only when
 * the phase changes; the numbers are written to text nodes by the frame loop.
 */

const pad = (value: number, width: number) =>
  Math.max(0, Math.round(value)).toString().padStart(width, '0')

/* ---- the finale's ink mode ------------------------------------------------ */

/**
 * The instruments are off-white on a night sky for the whole flight, and the
 * flight ends over a golden-hour close-up where off-white stops being legible
 * — the same problem CONTACT has, and it gets the same answer: ink plus a
 * light halo. What decides it is how much of the screen CONTACT covers, since
 * that is what is actually behind the readouts. Two thresholds, so a frame of
 * scroll jitter at the boundary cannot flicker the fade — the same hysteresis
 * the propeller reveal uses in `store.ts`.
 *
 * Coverage rather than the store's `isContactRevealed`: that signal is about
 * the propeller filling the frame and is forced on by the header jump, while
 * this one has to follow the sky both ways, including back up.
 *
 * It is resolved in the frame loop off `progress`, not by an
 * IntersectionObserver. Observer callbacks are delivered on the main thread
 * and, on a machine where the scene is expensive, arrive whole seconds late —
 * measured here as the instruments still being off-white after the jump had
 * already landed on the bright sky. CONTACT's box is measured once per
 * geometry version instead, exactly as the header measures its scroll limit,
 * and the per-frame part is arithmetic that reads no layout.
 */
const HUD_INK_ON = 0.62
const HUD_INK_OFF = 0.5

export function Hud() {
  const phaseIndex = useSyncExternalStore(subscribePhase, getPhaseIndex, () => 0)
  useSyncExternalStore(subscribeGeometry, getGeometryVersion, () => 0)

  const track = getTrack()
  const phase = track?.phases[phaseIndex]

  const alt = useRef<HTMLSpanElement>(null)
  const gs = useRef<HTMLSpanElement>(null)
  const hdg = useRef<HTMLSpanElement>(null)
  const throttle = useRef<HTMLSpanElement>(null)
  const callout = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLSpanElement>(null)
  const index = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)

  /**
   * The ink crossfade. One attribute on the root; the stylesheet owns the rest.
   * Deliberately outside React — it is a per-frame decision, and re-rendering
   * the instruments for it would put the frame loop back through the reconciler.
   */
  useEffect(() => {
    const el = root.current
    if (!el) return

    let top = 0
    let height = 0
    let limit = 1
    let viewport = window.innerHeight

    const measure = () => {
      viewport = window.innerHeight
      limit = Math.max(1, document.documentElement.scrollHeight - viewport)
      const contact = document.getElementById('contact')
      if (!contact) {
        height = 0
        return
      }
      const rect = contact.getBoundingClientRect()
      top = rect.top + window.scrollY
      height = rect.height
    }
    measure()

    let ink = false
    const frame = () => {
      if (height <= 0) return
      const y = state.progress * limit
      const visible = Math.min(top + height, y + viewport) - Math.max(top, y)
      const cover = Math.max(0, visible) / viewport
      const next = ink ? cover > HUD_INK_OFF : cover >= HUD_INK_ON
      if (next === ink) return
      ink = next
      el.dataset.ink = next ? 'true' : 'false'
    }
    frame()

    window.addEventListener('resize', measure)
    const unsubscribeGeometry = subscribeGeometry(measure)
    const unsubscribeFrame = subscribeFrame(frame)
    return () => {
      window.removeEventListener('resize', measure)
      unsubscribeGeometry()
      unsubscribeFrame()
    }
  }, [])

  useEffect(() => {
    let lastWaypoint = -2
    let lastSection = -1
    let flickering = false

    const write = () => {
      if (alt.current) alt.current.textContent = pad(state.altitude, 5)
      if (gs.current) gs.current.textContent = pad(state.speed, 3)
      if (hdg.current) hdg.current.textContent = pad(state.heading % 360, 3)
      if (throttle.current) {
        throttle.current.style.transform = `scaleX(${(0.04 + state.throttle * 0.96).toFixed(3)})`
      }
      if (cursor.current) {
        const x = state.pointerX
        const y = state.pointerY
        cursor.current.textContent = `${x < 0 ? '-' : '+'}${Math.abs(x).toFixed(2)} ${
          y < 0 ? '-' : '+'
        }${Math.abs(y).toFixed(2)}`
      }

      // instruments flicker in turbulence, and only then
      if (root.current) {
        if (state.turbulence > 0.02) {
          const jitter = 1 - Math.abs(Math.sin(performance.now() * 0.021)) * 0.45 * state.turbulence
          root.current.style.opacity = jitter.toFixed(3)
          flickering = true
        } else if (flickering) {
          root.current.style.opacity = ''
          flickering = false
        }
      }

      if (state.sectionIndex !== lastSection && index.current) {
        lastSection = state.sectionIndex
        const id = SECTION_IDS[lastSection] ?? SECTION_IDS[0]
        index.current.textContent = `${pad(lastSection + 1, 2)} / ${SECTION_LABELS[id]}`
      }

      if (state.waypointIndex !== lastWaypoint && callout.current) {
        lastWaypoint = state.waypointIndex
        const waypoint =
          state.waypointIndex >= 0 ? getTrack()?.waypoints[state.waypointIndex] : null
        callout.current.textContent = waypoint ? `> ${waypoint.code} ${waypoint.label}` : ''
        callout.current.dataset.active = waypoint ? 'true' : ''
      }
    }

    write()
    return subscribeFrame(write)
  }, [])

  return (
    <div className="hud" ref={root} data-ink="false" aria-hidden="true">
      <div className="hud__stack hud__stack--top">
        <div className="hud__inst">
          <span className="hud__key">ALT</span>
          <span className="hud__val" ref={alt}>
            00000
          </span>
        </div>
        <div className="hud__inst hud__inst--wide">
          <span className="hud__key">GS</span>
          <span className="hud__val" ref={gs}>
            000
          </span>
          <span className="hud__bar">
            <span className="hud__bar-fill" ref={throttle} />
          </span>
        </div>
        <div className="hud__inst hud__inst--wide">
          <span className="hud__key">HDG</span>
          <span className="hud__val" ref={hdg}>
            000
          </span>
        </div>
      </div>

      <div className="hud__stack hud__stack--bottom">
        <div className="hud__callout" ref={callout} />
        <div className="hud__phase">{phase?.label ?? 'ON BLOCKS'}</div>
        <div className="hud__index" ref={index}>
          {pad(1, 2)} / {SECTION_LABELS[SECTION_IDS[0]]}
        </div>
        <div className="hud__inst hud__inst--wide hud__cursor">
          <span className="hud__key">XY</span>
          <span className="hud__val" ref={cursor}>
            +0.00 +0.00
          </span>
        </div>
      </div>
    </div>
  )
}
