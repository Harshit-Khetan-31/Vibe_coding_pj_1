import { useEffect, useRef } from 'react'
import { profile } from '../content/profile'
import { revealSection, state, subscribeFrame, subscribeGeometry } from '../flight/store'
import { useActiveSection } from '../hooks/useActiveSection'
import './Header.css'

/**
 * Top bar. The rail still owns section-to-section navigation and the scroll
 * position; this is the masthead — identity, the three content sections, and
 * the one call to action. CONTACT is the pill rather than a fourth link, so
 * nothing in the bar points at the same place twice.
 *
 * The attitude readout is written by the frame loop into text nodes, never
 * through React, so a per-frame value cannot trigger a re-render.
 *
 * The bar also gets out of the way: it dissolves on the way down and comes
 * back on the way up. That decision is made in the same frame callback, off
 * the store's scroll position — no scroll listener, no React state per frame,
 * and the only thing written to the DOM is one `data-hidden` attribute.
 */

/** Below this the bar is always shown: the top of the page is not "scrolled". */
const ALWAYS_SHOWN_ABOVE = 80
/** Continuous downward travel that hides it… */
const HIDE_AFTER = 24
/** …and upward travel that brings it back. The gap is the anti-flicker band. */
const SHOW_AFTER = 12
/** Sub-pixel drift while the eased progress settles is not a direction. */
const NOISE_FLOOR = 0.05

const sectionIds = profile.sections.map((s) => s.id)

// Everything except INTRO (the wordmark goes there) and CONTACT (the pill does).
const links = profile.sections
  .map((s, index) => ({ ...s, index }))
  .filter((s) => s.id !== 'intro' && s.id !== 'contact')

const contact = profile.sections.findIndex((s) => s.id === 'contact')

const signed = (value: number, digits: number, pad: number) => {
  const body = Math.abs(value).toFixed(digits).padStart(pad, '0')
  return `${value < 0 ? '-' : '+'}${body}`
}

export function Header() {
  const activeId = useActiveSection(sectionIds)
  const root = useRef<HTMLElement>(null)
  const bank = useRef<HTMLSpanElement>(null)
  const drift = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const write = () => {
      // bank is radians in the store; degrees is what an instrument shows
      if (bank.current) bank.current.textContent = signed((state.bank * 180) / Math.PI, 1, 4)
      if (drift.current) drift.current.textContent = signed(state.driftX, 2, 4)
    }
    write()
    return subscribeFrame(write)
  }, [])

  /**
   * Hide on the way down, show on the way up.
   *
   * The store keeps scroll as eased 0–1 progress, so pixels come back from
   * `progress x limit`. The limit is measured once and re-measured only when
   * the track is rebuilt (resize) — never per frame, so nothing here reads
   * layout inside the frame loop.
   */
  useEffect(() => {
    const el = root.current
    if (!el) return

    let limit = 1
    const measure = () => {
      limit = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    }
    measure()

    let hidden = false
    let direction = 0 // -1 up, +1 down, 0 undecided
    let anchor = state.progress * limit // where the current run of travel began
    let previous = anchor
    let focused = false

    const set = (next: boolean) => {
      if (next === hidden) return
      hidden = next
      // One attribute; the stylesheet owns everything else. aria-hidden is
      // deliberately never set — the bar stays reachable by Tab while hidden.
      el.dataset.hidden = next ? 'true' : 'false'
    }

    const frame = () => {
      const y = state.progress * limit
      const delta = y - previous
      previous = y

      // Keyboard focus inside the bar outranks the scroll entirely.
      if (focused || y < ALWAYS_SHOWN_ABOVE) {
        anchor = y
        direction = 0
        set(false)
        return
      }

      if (Math.abs(delta) < NOISE_FLOOR) return

      // A reversal restarts the measurement, so the thresholds below are
      // always "travel since the scroll last changed its mind".
      const next = delta > 0 ? 1 : -1
      if (next !== direction) {
        direction = next
        anchor = y
      }

      const travel = y - anchor
      if (travel > HIDE_AFTER) set(true)
      else if (travel < -SHOW_AFTER) set(false)
    }

    const onFocusIn = () => {
      focused = true
      frame()
    }
    const onFocusOut = (event: FocusEvent) => {
      if (el.contains(event.relatedTarget as Node | null)) return
      focused = false
      anchor = state.progress * limit
      direction = 0
    }

    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    window.addEventListener('resize', measure)
    const unsubscribeGeometry = subscribeGeometry(measure)
    const unsubscribeFrame = subscribeFrame(frame)

    return () => {
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('resize', measure)
      unsubscribeGeometry()
      unsubscribeFrame()
    }
  }, [])

  const go = (index: number) => () => revealSection(index)

  return (
    <header className="header" ref={root} data-hidden="false">
      <a className="header__mark" href="#intro" onClick={go(0)} aria-label="Harshit — back to top">
        <svg className="header__glyph" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5 L14 14.5 L8 11.4 L2 14.5 Z" />
        </svg>
        <span className="header__word">{profile.displayName}</span>
      </a>

      <nav className="header__nav" aria-label="Sections">
        {links.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`header__link${s.id === activeId ? ' header__link--active' : ''}`}
            onClick={go(s.index)}
            aria-current={s.id === activeId ? 'true' : undefined}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="header__right">
        <div className="header__att" aria-hidden="true">
          <span className="header__att-key">BNK</span>
          <span className="header__att-val" ref={bank}>
            +00.0
          </span>
          <span className="header__att-key">DFT</span>
          <span className="header__att-val" ref={drift}>
            +0.00
          </span>
        </div>

        <a className="header__cta" href="#contact" onClick={go(contact)}>
          Get in touch
        </a>
      </div>
    </header>
  )
}
