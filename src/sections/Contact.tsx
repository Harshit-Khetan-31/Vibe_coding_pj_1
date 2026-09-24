import { useEffect, useRef, useState } from 'react'
import { contact } from '../content/contact'
import { credits } from '../content/credits'
import { TEXT_SIDE } from '../flight/profile'
import { useContactReveal } from '../hooks/useContactReveal'
import './Section.css'
import './Contact.css'

const plane = credits.find((c) => c.what === 'Aircraft model')

function localTime(timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

/**
 * CONTACT. Reuses the shared `.section` scaffolding (reveal, side, the
 * readability band) but not `Placeholder`'s layout — the deliberate-ending
 * brief calls for a distinct shape: big heading, a copy-to-clipboard email,
 * a social list and a minimal footer, all bottom-anchored so they sit in the
 * viewport exactly when the scroll runway runs out. See `Contact.css` for
 * the extra section height that runway needs.
 */
export function Contact({ number }: { index: number; number: string }) {
  const revealed = useContactReveal()
  const [copied, setCopied] = useState(false)
  // A header jump lands past the propeller close-up that normally cues the
  // reveal, so the jump asks for it to be completed outright. `settled` is the
  // forced state; `instant` kills the transition for the frame it flips in, so
  // the text is simply already there rather than animating in behind the
  // arriving scroll. See CONTACT_JUMP_EVENT in Header.tsx.
  const [settled, setSettled] = useState(false)
  const [instant, setInstant] = useState(false)
  const [time, setTime] = useState(() => localTime(contact.timeZone))
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>()
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const id = setInterval(() => setTime(localTime(contact.timeZone)), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => () => clearTimeout(copyTimeout.current), [])

  useEffect(() => {
    const onJump = () => {
      setSettled(true)
      setInstant(true)
      // Two frames: one for React to paint the snapped state with transitions
      // off, one before turning them back on — a single frame can land in the
      // same style recalculation and animate after all.
      requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)))
    }
    window.addEventListener('contact:jump', onJump)
    return () => window.removeEventListener('contact:jump', onJump)
  }, [])

  /**
   * Hand the reveal back. While CONTACT is on screen the forced state has to
   * hold — the propeller's own signal only turns on during the close-up, and
   * dropping the force before then would fade out text the visitor is reading.
   * Once the section has left the viewport there is nothing to protect, so it
   * is released and the reveal plays properly the next time it is scrolled to.
   */
  useEffect(() => {
    if (!settled) return
    const el = root.current
    if (!el) return
    // Only a leave counts. An observer reports its first state as soon as it
    // is attached, and the jump is fired from the top of the page where
    // CONTACT is nowhere near the viewport — releasing on that first callback
    // would undo the force in the same tick it was asked for, which is exactly
    // what left the arrival half-faded.
    let seen = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) seen = true
        else if (seen) setSettled(false)
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [settled])

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(contact.email)
      setCopied(true)
      clearTimeout(copyTimeout.current)
      copyTimeout.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard permission denied or unavailable — the email is still
      // selectable text, so nothing else to fall back to
    }
  }

  return (
    <section
      id="contact"
      ref={root}
      className="section section--contact"
      data-side={TEXT_SIDE.contact}
      data-contact-revealed={revealed || settled ? 'true' : 'false'}
      data-contact-instant={instant ? 'true' : 'false'}
      aria-label="Contact"
    >
      <div className="section__inner contact__inner">
        <div className="contact-rise" style={{ '--reveal-delay': '0ms' } as React.CSSProperties}>
          <div className="section__eyebrow">{number}</div>
          <h2 className="section__title contact__heading" tabIndex={-1}>
            {contact.heading}
          </h2>
        </div>
        <div className="contact-rise" style={{ '--reveal-delay': '80ms' } as React.CSSProperties}>
          <button type="button" className="contact__email" onClick={copyEmail}>
            {contact.email}
            <span className="contact__copied mono" aria-live="polite">
              {copied ? 'Copied' : ''}
            </span>
          </button>
        </div>
        <div className="contact-rise" style={{ '--reveal-delay': '160ms' } as React.CSSProperties}>
          <ul className="contact__socials">
            {contact.socials.map((s) => (
              <li key={s.label}>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="contact__clock mono">
            {time} · {contact.timeZone.replace('_', ' ')}
          </div>
        </div>
      </div>

      <footer
        className="contact-rise contact__footer mono"
        style={{ '--reveal-delay': '240ms' } as React.CSSProperties}
      >
        <span>© Harshit {new Date().getFullYear()}</span>
        {plane && (
          <span>
            <a href={plane.sourceUrl} target="_blank" rel="noreferrer noopener">
              {plane.title}
            </a>{' '}
            by{' '}
            <a href={plane.authorUrl} target="_blank" rel="noreferrer noopener">
              {plane.author}
            </a>{' '}
            —{' '}
            <a href={plane.licenseUrl} target="_blank" rel="noreferrer noopener">
              {plane.license}
            </a>
          </span>
        )}
      </footer>
    </section>
  )
}
