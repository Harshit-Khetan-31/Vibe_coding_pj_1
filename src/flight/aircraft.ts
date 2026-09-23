/**
 * The aircraft glyph: hairline line-art at the same stroke weight as the HUD,
 * so the whole site reads as one instrument rather than a toy plane in a corner.
 *
 * Drawn nose-first along +x, centred on the centre of gravity, about 34px long
 * at scale 1. Strokes are non-scaling, so the lane scale never thickens it.
 */

/** Half the outline, y ≥ 0. Mirrored in code so the two wings cannot drift. */
const HALF: Array<[number, number]> = [
  [17, 0], // nose
  [4.5, 1.1], // fuselage shoulder
  [-8.5, 11.4], // wing leading edge
  [-11.4, 11.7], // wingtip
  [-6.4, 2.2], // wing trailing edge, back to the root
  [-11.6, 2.2], // fuselage side
  [-14.6, 6.5], // tailplane leading edge
  [-16, 6.5], // tailplane tip
  [-15.4, 1.5], // tailplane trailing edge
  [-16.8, 0], // tail
]

function mirrored(): string {
  const fwd = HALF.map(([x, y]) => `${x} ${y}`)
  const back = HALF.slice(1, -1)
    .reverse()
    .map(([x, y]) => `${x} ${-y}`)
  return `M ${fwd[0]} L ${fwd.slice(1).join(' L ')} L ${back.join(' L ')} Z`
}

export const AIRCRAFT_OUTLINE = mirrored()
export const AIRCRAFT_SPINE = 'M 15.2 0 L -16.2 0'
export const AIRCRAFT_CANOPY = 'M 7.6 -1.6 L 11.4 0 L 7.6 1.6'
export const AIRCRAFT_LENGTH = 34
/** Wingtip to centreline at scale 1. The lane math clears this. */
export const AIRCRAFT_HALF_SPAN = 11.7
