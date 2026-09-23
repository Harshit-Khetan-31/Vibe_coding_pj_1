import { profile } from '../content/profile'
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
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`nav__item${isActive ? ' nav__item--active' : ''}`}
              style={{ top: `${positionPct}%`, '--nav-x': `${positionPct}%` } as React.CSSProperties}
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
