import { TEXT_SIDE, type SectionId } from '../flight/profile'
import './Section.css'

type PlaceholderProps = {
  id: SectionId
  number: string
  title: string
  body: string
}

/**
 * `data-side` is read straight from the flight profile rather than passed in,
 * so the text column and the aircraft's parked zone are guaranteed to be on
 * opposite sides of the viewport — there is no second copy of that decision.
 */
export function Placeholder({ id, number, title, body }: PlaceholderProps) {
  return (
    <section id={id} className="section" data-side={TEXT_SIDE[id]} aria-label={title}>
      <div className="section__inner">
        <div className="section__eyebrow">{number}</div>
        <h2 className="section__title">{title}</h2>
        <p className="section__body">{body}</p>
      </div>
    </section>
  )
}
