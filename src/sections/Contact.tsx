import { useEffect, useRef, useState } from 'react'
import { contact } from '../content/contact'
import { credits } from '../content/credits'
import { TEXT_SIDE } from '../flight/profile'
import { useSectionReveal } from '../hooks/useSectionReveal'
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
export function Contact({ index, number }: { index: number; number: string }) {
  const revealed = useSectionReveal(index)
  const [copied, setCopied] = useState(false)
  const [time, setTime] = useState(() => localTime(contact.timeZone))
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const id = setInterval(() => setTime(localTime(contact.timeZone)), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => () => clearTimeout(copyTimeout.current), [])

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
      className="section section--contact"
      data-side={TEXT_SIDE.contact}
      data-revealed={revealed ? 'true' : 'false'}
      aria-label="Contact"
    >
      <div className="section__inner contact__inner">
        <div className="reveal" style={{ '--reveal-delay': '0ms' } as React.CSSProperties}>
          <div className="section__eyebrow">{number}</div>
        </div>
        <div className="reveal" style={{ '--reveal-delay': '70ms' } as React.CSSProperties}>
          <h2 className="section__title contact__heading">{contact.heading}</h2>
        </div>
        <div className="reveal" style={{ '--reveal-delay': '180ms' } as React.CSSProperties}>
          <button type="button" className="contact__email" onClick={copyEmail}>
            {contact.email}
            <span className="contact__copied mono" aria-live="polite">
              {copied ? 'Copied' : ''}
            </span>
          </button>
        </div>
        <div className="reveal" style={{ '--reveal-delay': '260ms' } as React.CSSProperties}>
          <ul className="contact__socials">
            {contact.socials.map((s) => (
              <li key={s.label}>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="reveal" style={{ '--reveal-delay': '320ms' } as React.CSSProperties}>
          <div className="contact__clock mono">
            {time} · {contact.timeZone.replace('_', ' ')}
          </div>
        </div>
      </div>

      <footer className="contact__footer mono">
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
