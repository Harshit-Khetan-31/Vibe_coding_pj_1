import { AIRCRAFT_CANOPY, AIRCRAFT_OUTLINE, AIRCRAFT_SPINE } from '../flight/aircraft'
import './SkyFallback.css'

/**
 * What the site is when there is no WebGL, or when the visitor has asked for
 * reduced motion: the same dusk, as a still. A painted gradient, a sun, and the
 * Phase 1 line-art aircraft parked in the frame — no canvas, no loop, no motion.
 *
 * It also stands in while the real scene's chunk is still downloading, so the
 * page never flashes a black rectangle.
 */
export function SkyFallback() {
  return (
    <div className="skyfall" aria-hidden="true">
      <div className="skyfall__sun" />
      <svg className="skyfall__craft" viewBox="-40 -40 80 80" fill="none">
        <g transform="rotate(-12)">
          <path className="skyfall__outline" d={AIRCRAFT_OUTLINE} />
          <path className="skyfall__spine" d={AIRCRAFT_SPINE} />
          <path className="skyfall__canopy" d={AIRCRAFT_CANOPY} />
        </g>
      </svg>
    </div>
  )
}
