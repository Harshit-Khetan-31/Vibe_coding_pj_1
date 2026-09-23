import {
  ALTITUDE_KEYS,
  PHASES,
  SPEED_KEYS,
  WAYPOINTS,
  type PhaseId,
  type ValueKey,
} from './profile'
import { anchorProgress, type Layout } from './layout'
import { buildRoute, type Route } from './route'

/**
 * The flight as a function of scroll, with no geometry in it.
 *
 * Phase 1 resolved anchors onto a drawn curve and measured arc length. Since
 * Phase 2A there is no curve: a Track is just the profile's anchors resolved to
 * progress values, so `progress → phase / section / altitude / speed` is a
 * lookup and nothing re-measures per frame. Where the aircraft *is* on screen
 * is decided by the 3D layer, not here.
 */

export type ResolvedPhase = {
  id: PhaseId
  label: string
  section: number
  start: number
  end: number
}

export type ResolvedWaypoint = {
  code: string
  label: string
  progress: number
}

type Keyed = { p: number; v: number }

function resolveKeys(layout: Layout, keys: ValueKey[]): Keyed[] {
  const out: Keyed[] = []
  let prev = -Infinity
  for (const key of keys) {
    // monotonic by construction: a later anchor can never resolve earlier than
    // an earlier one, however the layout has collapsed
    const p = Math.max(anchorProgress(layout, key.at.s, key.at.u), prev)
    prev = p
    out.push({ p, v: key.v })
  }
  return out
}

function sampleKeys(keys: Keyed[], progress: number): number {
  if (keys.length === 0) return 0
  if (progress <= keys[0].p) return keys[0].v
  const last = keys[keys.length - 1]
  if (progress >= last.p) return last.v
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]
    if (progress > b.p) continue
    const a = keys[i - 1]
    const span = b.p - a.p
    if (span <= 1e-6) return b.v
    const t = (progress - a.p) / span
    // smoothstep: instruments ease in and out of a keyframe instead of ramping
    return a.v + (b.v - a.v) * t * t * (3 - 2 * t)
  }
  return last.v
}

export class Track {
  readonly layout: Layout
  /** where the aircraft flies: the serpentine, resolved onto this layout */
  readonly route: Route
  readonly phases: ResolvedPhase[]
  readonly waypoints: ResolvedWaypoint[]
  private readonly altitude: Keyed[]
  private readonly speed: Keyed[]

  constructor(layout: Layout) {
    this.layout = layout
    this.route = buildRoute(layout)

    let prev = 0
    this.phases = PHASES.map((phase) => {
      const start = Math.max(anchorProgress(layout, phase.from.s, phase.from.u), prev)
      const end = Math.max(anchorProgress(layout, phase.to.s, phase.to.u), start)
      prev = end
      return { id: phase.id, label: phase.label, section: phase.section, start, end }
    })
    // the first and last phase own everything outside the keyed range, so there
    // is no progress value without a phase
    if (this.phases.length > 0) {
      this.phases[0].start = 0
      this.phases[this.phases.length - 1].end = 1
    }

    this.waypoints = WAYPOINTS.map((w) => ({
      code: w.code,
      label: w.label,
      progress: anchorProgress(layout, w.at.s, w.at.u),
    }))

    this.altitude = resolveKeys(layout, ALTITUDE_KEYS)
    this.speed = resolveKeys(layout, SPEED_KEYS)
  }

  phaseIndexAt(progress: number): number {
    for (let i = this.phases.length - 1; i >= 0; i--) {
      if (progress >= this.phases[i].start) return i
    }
    return 0
  }

  /**
   * Section from the section boxes themselves rather than from the phase, so
   * the HUD index matches what is actually on screen even if a phase spans a
   * section boundary.
   */
  sectionIndexAt(progress: number): number {
    const { sections, limit, viewport } = this.layout
    const y = progress * limit + viewport / 2
    for (let i = sections.length - 1; i >= 0; i--) {
      if (y >= sections[i].top) return i
    }
    return 0
  }

  altitudeAt(progress: number): number {
    return sampleKeys(this.altitude, progress)
  }

  speedAt(progress: number): number {
    return sampleKeys(this.speed, progress)
  }
}

export function buildTrack(layout: Layout): Track {
  return new Track(layout)
}
