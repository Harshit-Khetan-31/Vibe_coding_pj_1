import { useEffect, useRef } from 'react'
import './GridField.css'

/**
 * Static grid is pure CSS (crisp hairlines, zero JS cost). The arc layer is
 * one SVG that parallaxes opposite the pointer via a damped transform —
 * cheap because it moves one element instead of redrawing a canvas.
 */
export function GridField() {
  const arcsRef = useRef<SVGSVGElement>(null)
  const target = useRef({ x: 0, y: 0 })
  const current = useRef({ x: 0, y: 0 })
  const frame = useRef<number>()

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    function onPointerMove(event: PointerEvent) {
      target.current.x = (event.clientX / window.innerWidth - 0.5) * 2
      target.current.y = (event.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    function tick() {
      current.current.x += (target.current.x - current.current.x) * 0.04
      current.current.y += (target.current.y - current.current.y) * 0.04
      const el = arcsRef.current
      if (el) {
        el.style.transform = `translate3d(${-current.current.x * 18}px, ${-current.current.y * 14}px, 0)`
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  return (
    <div className="grid-field" aria-hidden="true">
      <div className="grid-field__lines" />
      <svg
        ref={arcsRef}
        className="grid-field__arcs"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path
          d="M -100 650 Q 500 150 1300 500"
          stroke="var(--line)"
          strokeWidth="1"
          opacity="0.55"
        />
        <path
          d="M -100 250 Q 600 700 1300 200"
          stroke="var(--line)"
          strokeWidth="1"
          opacity="0.4"
        />
        <path
          d="M 200 -50 Q 750 450 500 950"
          stroke="var(--line)"
          strokeWidth="1"
          opacity="0.3"
        />
        {CROSSHAIRS.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y})`} opacity={c.o}>
            <line x1="-6" y1="0" x2="6" y2="0" stroke="var(--dim)" strokeWidth="1" />
            <line x1="0" y1="-6" x2="0" y2="6" stroke="var(--dim)" strokeWidth="1" />
          </g>
        ))}
      </svg>
      <div className="grid-field__veil" />
    </div>
  )
}

const CROSSHAIRS = [
  { x: 220, y: 210, o: 0.5 },
  { x: 860, y: 140, o: 0.35 },
  { x: 980, y: 520, o: 0.5 },
  { x: 140, y: 620, o: 0.3 },
  { x: 660, y: 760, o: 0.45 },
  { x: 1080, y: 780, o: 0.3 },
]
