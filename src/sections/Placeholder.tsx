import './Section.css'

type PlaceholderProps = {
  id: string
  number: string
  title: string
  body: string
}

export function Placeholder({ id, number, title, body }: PlaceholderProps) {
  return (
    <section id={id} className="section" aria-label={title}>
      <div className="section__eyebrow">{number}</div>
      <h2 className="section__title">{title}</h2>
      <p className="section__body">{body}</p>
    </section>
  )
}
