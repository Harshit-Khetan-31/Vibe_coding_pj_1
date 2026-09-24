/**
 * The flight, as data. Tuning the flight means editing this file and nothing else.
 *
 * Nothing here is in pixels. A position is an `Anchor` — section index `s`, plus
 * the fraction `u` down that section's box — so the flight re-derives itself from
 * the real DOM whenever the layout changes.
 *
 * Since Phase 2A there is no drawn route, so there are no lanes and no control
 * points: what is left is *when* things happen (phases, waypoints, instrument
 * keyframes) and which side of the screen each section's text occupies, which is
 * what tells the aircraft which side to hold.
 */

export const SECTION_IDS = ['intro', 'work', 'experiments', 'about', 'contact'] as const
export type SectionId = (typeof SECTION_IDS)[number]

export const SECTION_LABELS: Record<SectionId, string> = {
  intro: 'INTRO',
  work: 'WORK',
  experiments: 'EXPERIMENTS',
  about: 'ABOUT',
  contact: 'CONTACT',
}

/**
 * Which side of the viewport a section's text column sits on. The aircraft holds
 * the opposite side — so this one list drives both the CSS and the flight, and
 * they cannot drift apart. See `src/sections/Section.css` and `src/gl/zones.ts`.
 */
export type TextSide = 'left' | 'right'

export const TEXT_SIDE: Record<SectionId, TextSide> = {
  intro: 'left',
  work: 'right',
  experiments: 'left',
  about: 'right',
  contact: 'left',
}

/**
 * What the compass reads when the aircraft is pointing at the viewer.
 *
 * The flight starts on runway 11, so the instruments open on 110 and the Intro
 * pose — nose at the camera, which is `HEADING_AT_CAMERA` = 180 degrees in the
 * 3D layer's own frame — has to read the same thing, or the number would jump
 * the moment the loader handed over. The offset is applied once, in
 * `store.setAttitude`, so there is exactly one place where the model's frame
 * becomes a compass rose.
 */
export const RUNWAY_HEADING = 110
export const HEADING_OFFSET = RUNWAY_HEADING - 180

/** A point in layout space: section `s`, fraction `u` down it. */
export type Anchor = { s: number; u: number }

export type PhaseId =
  | 'ON_BLOCKS'
  | 'ROTATION'
  | 'CLIMB'
  | 'CRUISE'
  | 'TURBULENCE'
  | 'DESCENT'
  | 'TOUCHDOWN'

export type PhaseDef = {
  id: PhaseId
  label: string
  section: number
  from: Anchor
  to: Anchor
}

/** Keyframed instrument values. Every HUD number is a function of progress. */
export type ValueKey = { at: Anchor; v: number }

export type WaypointDef = { at: Anchor; code: string; label: string }

/**
 * Phase boundaries are anchors too, so the flight and the DOM can never drift.
 *
 * ON BLOCKS and ROTATION are no longer here: the loader flies them before the
 * page is scrollable at all, and by the time the visitor has a scrollbar the
 * aircraft is already climbing away from the runway. Their ids are kept in
 * `PhaseId` because the loader still reports those labels to the HUD.
 */
export const PHASES: PhaseDef[] = [
  { id: 'CLIMB', label: 'CLIMB', section: 0, from: { s: 0, u: 0 }, to: { s: 1, u: 0.02 } },
  { id: 'CRUISE', label: 'CRUISE', section: 1, from: { s: 1, u: 0.02 }, to: { s: 2, u: 0.06 } },
  { id: 'TURBULENCE', label: 'TURBULENCE', section: 2, from: { s: 2, u: 0.06 }, to: { s: 3, u: 0.04 } },
  { id: 'DESCENT', label: 'DESCENT', section: 3, from: { s: 3, u: 0.04 }, to: { s: 4, u: 0.2 } },
  { id: 'TOUCHDOWN', label: 'TOUCHDOWN', section: 4, from: { s: 4, u: 0.2 }, to: { s: 4, u: 0.82 } },
]

export const WAYPOINTS: WaypointDef[] = [
  { at: { s: 1, u: 0.03 }, code: 'WP01', label: 'WORK' },
  { at: { s: 2, u: 0.06 }, code: 'WP02', label: 'EXPERIMENTS' },
  { at: { s: 3, u: 0.05 }, code: 'WP03', label: 'ABOUT' },
  { at: { s: 4, u: 0.1 }, code: 'WP04', label: 'CONTACT' },
  { at: { s: 4, u: 0.82 }, code: 'TDZ', label: 'TOUCHDOWN' },
]

/** Altitude, feet. */
export const ALTITUDE_KEYS: ValueKey[] = [
  // the loader hands over at 1480 feet and 152 knots, so the scroll picks the
  // flight up there rather than back on the ground
  { at: { s: 0, u: 0 }, v: 1480 },
  { at: { s: 0, u: 0.86 }, v: 14800 },
  { at: { s: 1, u: 0.16 }, v: 33000 },
  { at: { s: 2, u: 0.06 }, v: 36000 },
  { at: { s: 2, u: 0.5 }, v: 35400 },
  { at: { s: 3, u: 0.04 }, v: 34800 },
  { at: { s: 3, u: 0.56 }, v: 12000 },
  { at: { s: 4, u: 0.2 }, v: 2400 },
  { at: { s: 4, u: 0.62 }, v: 260 },
  { at: { s: 4, u: 0.82 }, v: 0 },
]

/** Ground speed, knots. */
export const SPEED_KEYS: ValueKey[] = [
  { at: { s: 0, u: 0 }, v: 152 },
  { at: { s: 1, u: 0.02 }, v: 322 },
  { at: { s: 1, u: 0.42 }, v: 468 },
  { at: { s: 2, u: 0.06 }, v: 470 },
  { at: { s: 3, u: 0.04 }, v: 452 },
  { at: { s: 3, u: 0.56 }, v: 284 },
  { at: { s: 4, u: 0.2 }, v: 168 },
  { at: { s: 4, u: 0.62 }, v: 138 },
  { at: { s: 4, u: 0.82 }, v: 0 },
]
