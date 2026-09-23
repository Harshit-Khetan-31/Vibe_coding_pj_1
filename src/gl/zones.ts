import { SECTION_IDS, TEXT_SIDE } from '../flight/profile'
import { MOBILE_MAX_WIDTH, ZONE_X_DESKTOP, ZONE_X_MOBILE } from './config'

/**
 * Where the aircraft parks for each section: the side opposite that section's
 * text, in normalized screen space (−1 … +1, y up).
 *
 * The horizontal side is derived from `TEXT_SIDE` rather than listed again, so
 * moving a text column moves the aircraft with it. Only the vertical offsets
 * are hand-set — they exist so five sections don't all hold the exact same
 * altitude and the flight reads as a route rather than a slider.
 */

const ZONE_Y: Record<(typeof SECTION_IDS)[number], number> = {
  intro: -0.04,
  work: 0.16,
  experiments: -0.2,
  about: 0.1,
  contact: -0.12,
}

export type Zone = { x: number; y: number }

export function zoneFor(sectionIndex: number, viewportWidth: number): Zone {
  const id = SECTION_IDS[Math.max(0, Math.min(SECTION_IDS.length - 1, sectionIndex))]
  const mobile = viewportWidth <= MOBILE_MAX_WIDTH
  const spread = mobile ? ZONE_X_MOBILE : ZONE_X_DESKTOP
  // text left → aircraft right
  const x = TEXT_SIDE[id] === 'left' ? spread : -spread
  // On a phone the text is full width and sits at the bottom of the section
  // (see Section.css), so the aircraft separates itself by climbing above it
  // rather than by moving aside.
  const y = mobile ? ZONE_Y[id] * 0.5 + 0.34 : ZONE_Y[id]
  return { x, y }
}
