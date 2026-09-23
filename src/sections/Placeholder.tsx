import { TEXT_SIDE, type SectionId } from '../flight/profile'
import { useSectionReveal } from '../hooks/useSectionReveal'
import './Section.css'

type PlaceholderProps = {
  id: SectionId
  index: number
  number: string
  title: string
  body: string
}

/**
 * `data-side` is read straight from the flight profile rather than passed in,
 * so the text column and the aircraft's parked zone are guaranteed to be on
 * opposite sides of the viewport — there is no second copy of that decision.
 *
 * `data-revealed` is the other half of the same idea: the content is written
 * onto the page by the aircraft passing it, not by an observer that happens to
 * fire around the same time, so the two can never disagree about when a section
 * has been reached. Each line sits in its own mask and they stagger.
 */
export function Placeholder({ id, index, number, title, body }: PlaceholderProps) {
  const revealed = useSectionReveal(index)

  return (
    <section
      id={id}
      className="section"
      data-side={TEXT_SIDE[id]}
      data-revealed={revealed ? 'true' : 'false'}
      aria-label={title}
    >
      <div className="section__inner">
        <div className="reveal" style={{ '--reveal-delay': '0ms' } as React.CSSProperties}>
          <div className="section__eyebrow">{number}</div>
        </div>
        <div className="reveal" style={{ '--reveal-delay': '70ms' } as React.CSSProperties}>
          <h2 className="section__title">{title}</h2>
        </div>
        <div className="reveal" style={{ '--reveal-delay': '160ms' } as React.CSSProperties}>
          <p className="section__body">{body}</p>
        </div>
      </div>
    </section>
  )
}
