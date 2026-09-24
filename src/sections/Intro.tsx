import { profile } from '../content/profile'
import { TEXT_SIDE } from '../flight/profile'
import { useSectionReveal } from '../hooks/useSectionReveal'
import './Section.css'
import './Intro.css'

/**
 * INTRO. The shared `.section` scaffolding — reveal band, text side — and
 * nothing else: the console-style boot line that used to open the page is gone,
 * because the takeoff loader now does that job properly, with instruments that
 * mean something and a flight the rest of the page continues.
 */
export function Intro({ number }: { number: string }) {
  const revealed = useSectionReveal(0)

  return (
    <section
      id="intro"
      className="section section--intro"
      data-side={TEXT_SIDE.intro}
      data-revealed={revealed ? 'true' : 'false'}
      aria-label="Intro"
    >
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
