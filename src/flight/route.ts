import { SECTION_IDS, TEXT_SIDE } from './profile'
import { anchorProgress, type Layout } from './layout'

/**
 * The flight path, as one continuous curve.
 *
 * Phase 2B routed the aircraft between per-section parking zones, which meant
 * it stopped at every section and crossed in the gaps. That is gone: the path
 * is now a single sinusoid down the whole page, so the aeroplane is always
 * flying and the page has one long S through it rather than five hops.
 *
 * Everything is a closed-form function of smoothed scroll progress, which buys
 * three things at once. The tangent and the curvature are exact rather than
 * differenced frame to frame, so the heading and the bank are clean at any
 * scroll speed. Scrolling up is the same curve read backwards, so up and down
 * are symmetric by construction. And nothing here has state, so a flick, a
 * reversal or a resumed tab cannot desynchronise it.
 *
 * Amplitudes are normalized (−1 … +1 of the half-viewport, y up); the GL layer
 * scales them.
 */

/**
 * Swings per section. One means the aircraft crosses and returns once per
 * section — the spec's "one full swing per section". Because section text sides
 * alternate, at this frequency the path does pass across the text column on its
 * way through; the readability budget for that is the text's own shadow (see
 * `src/sections/Section.css`), not a scrim. Halve this to 0.5 and the aircraft
 * holds the side opposite each section's text instead.
 */
const SWINGS_PER_SECTION = 1

/**
 * The vertical weave runs at half the lateral frequency, so the two never line
 * up into a single diagonal and the path reads as three-dimensional.
 */
const VERTICAL_RATIO = 0.5
const VERTICAL_AMPLITUDE = 0.26
const VERTICAL_PHASE = Math.PI * 0.35

/** Where each section's content is considered passed, and reveals. */
const REVEAL_U = 0.3

/** The finale window: the last ~15% of the scroll, ending inside CONTACT. */
const FINALE_FROM = { s: 3, u: 0.9 }
const FINALE_TO = { s: 4, u: 0.3 }

const TAU = Math.PI * 2

export type Route = {
  /** lateral position, −1 … +1 of the half-viewport */
  x(progress: number): number
  /** altitude, −1 … +1 of the half-viewport */
  y(progress: number): number
  /**
   * The lateral tangent, −1 … +1, in *down-scroll* order: +1 is "heading right
   * if you are scrolling down". The aircraft's facing is built from this.
   */
  lean(progress: number): number
  /**
   * Lateral curvature, −1 … +1. Peaks at the ends of each swing, where the
   * aircraft is turning hardest, and passes through zero at the crossings —
   * which is exactly the bank angle, up to a constant.
   */
  curve(progress: number): number
  /** The vertical tangent, −1 … +1, in down-scroll order. Feeds the pitch. */
  climb(progress: number): number
  /** progress at which a section's content has been flown past */
  revealAt(section: number): number
  /** the finale's progress window */
  finale: { from: number; to: number }
}

export function buildRoute(layout: Layout): Route {
  const sections = Math.max(layout.sections.length, 1)
  const omega = TAU * sections * SWINGS_PER_SECTION

  // Phase so the curve starts at its lateral extreme on the side opposite the
  // first section's text, with zero tangent: at the top of the page the
  // aircraft is therefore already where it belongs, pointing straight at the
  // viewer, and it does not have to lurch to get there on the first wheel tick.
  const first = TEXT_SIDE[SECTION_IDS[0]] === 'left' ? 1 : -1
  const phase0 = first > 0 ? Math.PI / 2 : -Math.PI / 2

  const at = (p: number) => omega * p + phase0
  const vertical = (p: number) => omega * VERTICAL_RATIO * p + VERTICAL_PHASE

  const reveal = SECTION_IDS.map((_, i) => anchorProgress(layout, i, REVEAL_U))

  return {
    x: (p) => Math.sin(at(p)),
    y: (p) => Math.sin(vertical(p)) * VERTICAL_AMPLITUDE,
    lean: (p) => Math.cos(at(p)),
    // d²x/dp² normalized: −sin, which is just −x
    curve: (p) => -Math.sin(at(p)),
    climb: (p) => Math.cos(vertical(p)) * VERTICAL_RATIO,
    revealAt: (i) => reveal[Math.max(0, Math.min(reveal.length - 1, i))] ?? 1,
    finale: {
      from: anchorProgress(layout, FINALE_FROM.s, FINALE_FROM.u),
      to: anchorProgress(layout, FINALE_TO.s, FINALE_TO.u),
    },
  }
}
