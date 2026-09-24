import { useEffect, useRef } from 'react'
import { profile } from '../content/profile'
import {
  isLoaderActive,
  isReducedMotion,
  revealSection,
  state,
  subscribeFrame,
  subscribeGeometry,
} from '../flight/store'
import { useActiveSection } from '../hooks/useActiveSection'
import { getLenis } from '../hooks/useLenis'
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

/* ---- the CONTACT jump ------------------------------------------------- */

/** Where the headline should come to rest, as a fraction of the viewport. */
const CONTACT_HEADLINE_TOP = 0.15
/** Long enough to read as travel to the end of the flight, not a cut. */
const CONTACT_JUMP_SECONDS = 1.4
/** Cubic in-out: leaves and arrives slowly, at speed in the middle. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
/** Contact.tsx listens for this and force-completes its reveal. */
const CONTACT_JUMP_EVENT = 'contact:jump'

/**
 * How far past the top of CONTACT the scroll has to land for the headline to
 * sit `CONTACT_HEADLINE_TOP` down the viewport.
 *
 * `offsetTop` rather than a rect: the headline sits inside `.contact-rise`,
 * which is translated 60px down until the reveal has played, and a rect would
 * fold that transform into the measurement and land the jump 60px short. The
 * chain has to be walked — `.section__inner` is positioned too, so it, not the
 * section, is the headline's offset parent, and a single `offsetTop` would
 * measure from the wrong box and land the jump most of a screen short.
 *
 * The browser clamps the result at the end of the document, which is the point
 * of the scroll runway CONTACT reserves: the jump lands the headline at 15vh
 * whenever there is room below it to do so.
 */
function contactOffset(section: HTMLElement): number {
  const heading = section.querySelector<HTMLElement>('.contact__heading')
  if (!heading) return 0
  let top = 0
  let node: HTMLElement | null = heading
  while (node && node !== section) {
    top += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return top - window.innerHeight * CONTACT_HEADLINE_TOP
}

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
  const forceHide = useRef<(() => void) | null>(null)
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

    let hidden = isLoaderActive()
    let direction = 0 // -1 up, +1 down, 0 undecided
    let y = state.progress * limit
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
      y = state.progress * limit
      const delta = y - previous
      previous = y

      // The takeoff owns the screen: the bar waits it out in its hidden state
      // and comes back through its own show dissolve at the handoff, which is
      // the same moment the rail fades in. Re-anchoring each frame means the
      // wait cannot be mistaken for travel once it is over.
      if (state.loader.active) {
        anchor = y
        direction = 0
        set(true)
        return
      }

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

    /**
     * The CONTACT jump hides the bar itself rather than leaving it to the
     * scroll. Travel usually does the job, but not when the jump is instant
     * (reduced motion) or starts from CONTACT, where there is barely any
     * travel to measure — and setting `data-hidden` from outside would leave
     * `hidden` lying about the DOM, so the next upward scroll could not bring
     * the bar back. Re-anchoring keeps the arrival from counting as a reversal.
     */
    forceHide.current = () => {
      anchor = y
      previous = y
      direction = 0
      set(true)
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
      forceHide.current = null
    }
  }, [])

  const go = (index: number) => () => revealSection(index)

  /**
   * "Get in touch" is the one link that has somewhere specific to arrive: the
   * end of the flight, with the headline high in the frame rather than the
   * section's top edge pinned under the bar. So it is driven rather than left
   * to the browser's anchor jump — eased over `CONTACT_JUMP_SECONDS`, with the
   * reveal force-completed, the bar sent away and focus put on the headline so
   * the keyboard ends up where the eye does.
   */
  const goContact = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()

    const section = document.getElementById('contact')
    if (!section) return

    revealSection(contact)
    window.dispatchEvent(new Event(CONTACT_JUMP_EVENT))

    const arrive = () => {
      forceHide.current?.()
      // preventScroll: the browser would otherwise scroll the heading into
      // view its own way and undo the landing we just eased into.
      document
        .querySelector<HTMLElement>('#contact .contact__heading')
        ?.focus({ preventScroll: true })
    }

    const lenis = getLenis()
    if (isReducedMotion() || !lenis) {
      const top = section.getBoundingClientRect().top + window.scrollY + contactOffset(section)
      window.scrollTo({ top, behavior: 'auto' })
      arrive()
      return
    }

    forceHide.current?.()
    lenis.scrollTo('#contact', {
      offset: contactOffset(section),
      duration: CONTACT_JUMP_SECONDS,
      easing: easeInOut,
      onComplete: arrive,
    })
  }

  return (
    <header className="header" ref={root} data-hidden={isLoaderActive() ? 'true' : 'false'}>
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

        <a className="header__cta" href="#contact" onClick={goContact}>
          Get in touch
        </a>
      </div>
    </header>
  )
}
