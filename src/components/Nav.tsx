import { profile } from '../content/profile'
import { revealSection } from '../flight/store'
import { useActiveSection } from '../hooks/useActiveSection'
import './Nav.css'

const sectionIds = profile.sections.map((s) => s.id)

export function Nav() {
  const activeId = useActiveSection(sectionIds)
  const count = profile.sections.length

  return (
    <nav className="nav" aria-label="Section navigation">
      <div className="nav__rail">
        {profile.sections.map((s, i) => {
          const positionPct = ((i + 0.5) / count) * 100
          const isActive = s.id === activeId
          // a nav click jumps past the flight, so the section it lands on
          // reveals at once rather than waiting for an aircraft that is no
          // longer on its way
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`nav__item${isActive ? ' nav__item--active' : ''}`}
              style={{ top: `${positionPct}%`, '--nav-x': `${positionPct}%` } as React.CSSProperties}
              onClick={() => revealSection(i)}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="nav__tick" />
              <span className="nav__label">{s.label.toUpperCase()}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
