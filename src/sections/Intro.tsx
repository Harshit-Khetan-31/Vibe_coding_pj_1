import { useEffect, useState } from 'react'
import { boot } from '../content/intro'
import { profile } from '../content/profile'
import { TEXT_SIDE } from '../flight/profile'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useSectionReveal } from '../hooks/useSectionReveal'
import './Section.css'
import './Intro.css'

const BOOT_SEEN_KEY = 'intro-boot-seen'
const BOOT_MAX_MS = 1500

/**
 * The boot line's own lifecycle: type on, hold, then fade — or skip straight
 * to "done" on a repeat visit, under reduced motion, or on the first scroll,
 * click or keypress, matching CLAUDE.md ("skippable"). `sessionStorage` is
 * read defensively since it can throw in some privacy modes; failing that
 * read just means the boot line plays every time instead of once.
 */
function useBootLine(reduced: boolean): { visible: boolean; exiting: boolean; onExited: () => void } {
  const [phase, setPhase] = useState<'boot' | 'exit' | 'done'>(() => {
    if (reduced) return 'done'
    try {
      return sessionStorage.getItem(BOOT_SEEN_KEY) === '1' ? 'done' : 'boot'
    } catch {
      return 'boot'
    }
  })

  useEffect(() => {
    if (phase !== 'boot') return

    const markSeen = () => {
      try {
        sessionStorage.setItem(BOOT_SEEN_KEY, '1')
      } catch {
        // best-effort only — replaying the boot line once more is harmless
      }
    }

    const skip = () => {
      markSeen()
      setPhase('exit')
    }

    const timer = setTimeout(skip, BOOT_MAX_MS)
    window.addEventListener('keydown', skip, { once: true })
    window.addEventListener('pointerdown', skip, { once: true })
    window.addEventListener('wheel', skip, { once: true, passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('wheel', skip)
    }
  }, [phase])

  return {
    visible: phase !== 'done',
    exiting: phase === 'exit',
    onExited: () => setPhase('done'),
  }
}

/**
 * INTRO. Reuses the shared `.section` scaffolding (reveal band, text side)
 * like every other section, then adds one thing unique to this one: the
 * boot line.
 */
export function Intro({ number }: { number: string }) {
  const revealed = useSectionReveal(0)
  const reducedMotion = useReducedMotion()
  const boot_ = useBootLine(reducedMotion)

  return (
    <section
      id="intro"
      className="section section--intro"
      data-side={TEXT_SIDE.intro}
      data-revealed={revealed ? 'true' : 'false'}
      aria-label="Intro"
    >
      {boot_.visible && (
        <div
          className="intro__boot mono"
          data-exiting={boot_.exiting ? 'true' : 'false'}
          aria-hidden="true"
          onTransitionEnd={(e) => {
            // only the fade (the exit state) should unmount it — the type-on
            // has its own transition on the same element and fires first
            if (boot_.exiting && e.propertyName === 'opacity') boot_.onExited()
          }}
        >
          {boot.line}
        </div>
      )}

      <div className="section__inner">
        <div className="reveal" style={{ '--reveal-delay': '0ms' } as React.CSSProperties}>
          <div className="section__eyebrow">{number}</div>
        </div>
        <div className="reveal" style={{ '--reveal-delay': '70ms' } as React.CSSProperties}>
          <h1 className="section__title intro__name">{profile.displayName}</h1>
        </div>
        <div className="reveal" style={{ '--reveal-delay': '160ms' } as React.CSSProperties}>
          <p className="section__body">{profile.statement}</p>
        </div>
      </div>
    </section>
  )
}
