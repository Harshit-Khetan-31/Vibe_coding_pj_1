import type { Track } from './track'

/**
 * The single source of truth for the flight, and the single rAF loop that
 * advances it. Lenis (or native scroll) pushes a scroll position in; one tick
 * per frame resolves it into progress, velocity, phase, section and a set of
 * instrument values; subscribers write straight to the DOM.
 *
 * Since Phase 2A the store no longer knows where the aircraft is: there is no
 * route and no screen position here. The 3D layer reads `progress`, `velocity`,
 * `sectionIndex` and `throttle`, flies itself, and writes its resulting attitude
 * back through `setAttitude` so the HUD reports the real aircraft rather than a
 * second, parallel simulation.
 *
 * React is deliberately kept out of the frame loop: it re-renders only when the
 * phase index changes, or when the track is rebuilt on resize.
 */

export type FlightState = {
  /** eased scroll progress, 0–1 */
  progress: number
  /** progress units per second, smoothed. Positive = scrolling down. */
  velocity: number
  /** 0–1 throttle, derived from |velocity| */
  throttle: number

  phaseIndex: number
  sectionIndex: number

  altitude: number
  speed: number

  /** attitude, written back by whichever layer is flying the aircraft */
  heading: number
  bank: number

  /** index into track.waypoints, or -1 */
  waypointIndex: number
  /** 0–1 envelope over the turbulence phase */
  turbulence: number
  /** 0–1, ramps up when nothing has been touched */
  idle: number

  pointerX: number
  pointerY: number

  /**
   * The aircraft's lateral travel, −1 (flying left) ... +1 (flying right), in
   * half-viewports per second. Written by the flying layer; the cloud field
   * reads it so the weather slides the other way as the aircraft crosses.
   */
  driftX: number
}

type Listener = () => void

const TAU_PROGRESS = 0.055 // scroll → aircraft lag, seconds
const TAU_VELOCITY = 0.09
const TAU_THROTTLE_UP = 0.07 // throttle opens fast…
const TAU_THROTTLE_DOWN = 0.45 // …and bleeds off slowly

const VELOCITY_FULL = 1.1 // progress/s that counts as full throttle

const IDLE_DELAY = 1.4 // seconds of no scroll and no pointer
const IDLE_RISE = 1.2
const IDLE_FALL = 0.3

const WAYPOINT_LEAD = 0.045
const WAYPOINT_TRAIL = 0.018

export const state: FlightState = {
  progress: 0,
  velocity: 0,
  throttle: 0,
  phaseIndex: 0,
  sectionIndex: 0,
  altitude: 0,
  speed: 0,
  heading: 0,
  bank: 0,
  waypointIndex: -1,
  turbulence: 0,
  idle: 0,
  pointerX: 0,
  pointerY: 0,
  driftX: 0,
}

const frameListeners = new Set<Listener>()
const revealListeners = new Set<Listener>()
const phaseListeners = new Set<Listener>()
const geometryListeners = new Set<Listener>()

let track: Track | null = null
let geometryVersion = 0

let scroll = 0
let scrollLimit = 1
let snapNext = true
let reducedMotion = false

let lastTime = 0
let pointerIdleFor = IDLE_DELAY
const revealed = new Set<number>()
let revealVersion = 0
let turbulencePhaseIndex = -1

/* ---- subscriptions ------------------------------------------------------- */

export function subscribeFrame(fn: Listener): () => void {
  frameListeners.add(fn)
  return () => frameListeners.delete(fn)
}

/** For React. Fires only when the phase index actually changes. */
export function subscribePhase(fn: Listener): () => void {
  phaseListeners.add(fn)
  return () => phaseListeners.delete(fn)
}

export function getPhaseIndex(): number {
  return state.phaseIndex
}

export function subscribeGeometry(fn: Listener): () => void {
  geometryListeners.add(fn)
  return () => geometryListeners.delete(fn)
}

export function getGeometryVersion(): number {
  return geometryVersion
}

export function getTrack(): Track | null {
  return track
}

/* ---- section reveals ------------------------------------------------------ */

/**
 * Which sections the aircraft has flown past. Reveals are sticky: once a
 * section has been passed it stays revealed, so scrolling back up never
 * un-writes text that is already on screen.
 */

export function subscribeReveal(fn: Listener): () => void {
  revealListeners.add(fn)
  return () => revealListeners.delete(fn)
}

export function getRevealVersion(): number {
  return revealVersion
}

export function isRevealed(section: number): boolean {
  return revealed.has(section)
}

/** A nav click jumps the scroll, so its target reveals immediately. */
export function revealSection(section: number) {
  let changed = false
  for (let i = 0; i <= section; i++) {
    if (revealed.has(i)) continue
    revealed.add(i)
    changed = true
  }
  if (changed) {
    revealVersion++
    revealListeners.forEach((fn) => fn())
  }
}

/* ---- CONTACT: propeller screen coverage ----------------------------------- */

/**
 * How much of the viewport the propeller disc fills during the finale, as
 * written back by the flying layer (`Plane.tsx`) each frame — the same
 * "flying layer reports back" pattern as `setAttitude`. Unlike the section
 * reveals above this is not sticky: it tracks the disc's real on-screen size,
 * so scrolling back up shrinks it again and CONTACT's reveal can play in
 * reverse instead of only ever turning on.
 *
 * The two thresholds are a small hysteresis band around "the propeller covers
 * ~60% of the screen", so a frame of scroll jitter right at the close-up
 * moment cannot flicker the reveal on and off.
 */

const CONTACT_REVEAL_ON = 0.6
const CONTACT_REVEAL_OFF = 0.52

let contactRevealed = false
const contactListeners = new Set<Listener>()

export function subscribeContactReveal(fn: Listener): () => void {
  contactListeners.add(fn)
  return () => contactListeners.delete(fn)
}

export function isContactRevealed(): boolean {
  return contactRevealed
}

/** `fraction` is the propeller disc's diameter as a fraction of viewport height. */
export function setPropellerCoverage(fraction: number) {
  const next = contactRevealed ? fraction > CONTACT_REVEAL_OFF : fraction >= CONTACT_REVEAL_ON
  if (next !== contactRevealed) {
    contactRevealed = next
    contactListeners.forEach((fn) => fn())
  }
}

export function isReducedMotion(): boolean {
  return reducedMotion
}

/* ---- inputs -------------------------------------------------------------- */

export function setTrack(next: Track) {
  track = next
  geometryVersion++
  turbulencePhaseIndex = -1
  snapNext = true
  resolve(0, true)
  geometryListeners.forEach((fn) => fn())
}

export function setScroll(next: number, limit: number) {
  scroll = next
  scrollLimit = limit > 1 ? limit : 1
}

export function setPointer(nx: number, ny: number) {
  state.pointerX = nx
  state.pointerY = ny
  pointerIdleFor = 0
}

export function setReducedMotion(value: boolean) {
  reducedMotion = value
}

/** The flying layer reports back, so the instruments read the real aircraft. */
export function setAttitude(headingDeg: number, bankRad: number, driftX: number) {
  state.heading = ((headingDeg % 360) + 360) % 360
  state.bank = bankRad
  state.driftX = driftX
}

/* ---- the loop ------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** Frame-rate independent exponential approach. */
const approach = (current: number, target: number, tau: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-dt / tau))

export function tick(timeMs: number) {
  if (!track) return
  const dt = lastTime === 0 ? 1 / 60 : clamp((timeMs - lastTime) / 1000, 1 / 240, 0.05)
  lastTime = timeMs
  resolve(dt, false)
  frameListeners.forEach((fn) => fn())
}

/** Called after a tab has been hidden, so a huge dt never lands in the springs. */
export function resetClock() {
  lastTime = 0
}

function resolve(dt: number, immediate: boolean) {
  if (!track) return

  const target = clamp(scroll / scrollLimit, 0, 1)
  const previous = state.progress

  if (immediate || snapNext) {
    state.progress = target
    snapNext = false
  } else {
    state.progress = approach(state.progress, target, TAU_PROGRESS, dt)
  }
  // kill the last fraction of a pixel of drift so the plane parks dead still
  if (Math.abs(target - state.progress) < 1e-5) state.progress = target

  const rawVelocity = dt > 0 ? (state.progress - previous) / dt : 0
  state.velocity = immediate ? 0 : approach(state.velocity, rawVelocity, TAU_VELOCITY, dt)

  const drive = clamp(Math.abs(state.velocity) / VELOCITY_FULL, 0, 1)
  const throttleTarget = Math.sqrt(drive)
  state.throttle = immediate
    ? throttleTarget
    : approach(
        state.throttle,
        throttleTarget,
        throttleTarget > state.throttle ? TAU_THROTTLE_UP : TAU_THROTTLE_DOWN,
        dt,
      )

  /* phase + section ------------------------------------------------------- */
  const phaseIndex = track.phaseIndexAt(state.progress)
  state.sectionIndex = track.sectionIndexAt(state.progress)
  if (phaseIndex !== state.phaseIndex) {
    state.phaseIndex = phaseIndex
    phaseListeners.forEach((fn) => fn())
  }

  /* turbulence ------------------------------------------------------------ */
  if (turbulencePhaseIndex < 0) {
    turbulencePhaseIndex = track.phases.findIndex((p) => p.id === 'TURBULENCE')
  }
  let turbulence = 0
  if (turbulencePhaseIndex >= 0 && !reducedMotion) {
    const ph = track.phases[turbulencePhaseIndex]
    const span = ph.end - ph.start
    if (span > 1e-4) {
      const u = (state.progress - ph.start) / span
      if (u > 0 && u < 1) turbulence = Math.sin(u * Math.PI) ** 0.7
    }
  }
  state.turbulence = turbulence

  /* idle ------------------------------------------------------------------ */
  pointerIdleFor += dt
  const settled = Math.abs(state.velocity) < 0.004 && pointerIdleFor > IDLE_DELAY
  if (reducedMotion) state.idle = 0
  else state.idle = clamp(state.idle + (settled ? dt / IDLE_RISE : -dt / IDLE_FALL), 0, 1)

  /* instruments ------------------------------------------------------------ */
  state.altitude = track.altitudeAt(state.progress)
  state.speed = track.speedAt(state.progress) * (0.86 + 0.14 * state.throttle)

  /* reveals ---------------------------------------------------------------- */
  const sections = track.layout.sections.length
  let revealChanged = false
  for (let i = 0; i < sections; i++) {
    if (!revealed.has(i) && state.progress >= track.route.revealAt(i)) {
      revealed.add(i)
      revealChanged = true
    }
  }
  if (revealChanged) {
    revealVersion++
    revealListeners.forEach((fn) => fn())
  }

  /* waypoints -------------------------------------------------------------- */
  let active = -1
  const waypoints = track.waypoints
  for (let i = 0; i < waypoints.length; i++) {
    const delta = state.progress - waypoints[i].progress
    if (delta > -WAYPOINT_LEAD && delta < WAYPOINT_TRAIL) {
      active = i
      break
    }
  }
  state.waypointIndex = active
}
