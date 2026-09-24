import { HEADING_OFFSET, RUNWAY_HEADING } from './profile'
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

  /**
   * The takeoff loader, while it is on screen. It is a second, shorter flight
   * that happens before the scrollable one, so the instruments cannot read it
   * off `progress` — the loader writes what it is flying here instead, and the
   * HUD prefers these values for as long as `active` is true.
   */
  loader: LoaderState

  /**
   * The aircraft's arrival, 0 → 1 across the last stretch of the takeoff. The
   * 3D layer blends its pose from "below and behind the camera, climbing away"
   * to the ordinary Intro pose across it. 1 means the entry is over, which is
   * also what it reads when there was never a loader at all.
   */
  entry: number
}

export type LoaderState = {
  active: boolean
  /** feet, knots and degrees, exactly as the instruments will print them */
  altitude: number
  speed: number
  heading: number
  phaseLabel: string
  /** the radio call, without the leading marker the HUD adds */
  callout: string
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
  loader: {
    active: false,
    altitude: 0,
    speed: 0,
    heading: RUNWAY_HEADING,
    phaseLabel: 'ON BLOCKS',
    callout: 'RWY 11',
  },
  entry: 1,
}

const frameListeners = new Set<Listener>()
const loaderListeners = new Set<Listener>()
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

/* ---- the takeoff loader --------------------------------------------------- */

/**
 * The loader plays once per session, and the decision is made here rather than
 * inside the component so that every part of the first frame — the overlay, the
 * masthead that has to stay out of its way — asks the same question and gets
 * the same answer, whatever order React happens to mount them in.
 *
 * `sessionStorage` is read defensively: it throws in some privacy modes, and a
 * failed read should mean "play it" rather than "crash the page".
 */

const LOADER_SEEN_KEY = 'loader-seen'

let loaderDecided = false
let loaderPlays = false
let loaderVersion = 0

export function loaderShouldPlay(): boolean {
  if (!loaderDecided) {
    loaderDecided = true
    try {
      loaderPlays = sessionStorage.getItem(LOADER_SEEN_KEY) !== '1'
    } catch {
      loaderPlays = true
    }
    state.loader.active = loaderPlays
    // with no loader there is no arrival to blend, so the aircraft is simply
    // already there
    state.entry = loaderPlays ? 0 : 1
  }
  return loaderPlays
}

/* ---- what the counter is counting ---------------------------------------- */

/**
 * The four things that have to happen before the page is ready, each reported
 * as 0–1 by whoever actually knows: the document for its fonts, `World` for the
 * Scene chunk, drei's `useProgress` for the glTF and its textures, and the
 * renderer itself once it has compiled and drawn twice.
 *
 * They live here rather than in the loader because the reporters are all over
 * the app and none of them should have to import a component to say so — and
 * because when the world is never going to be drawn at all (reduced motion, no
 * WebGL) `World` can simply mark them done.
 */
export type LoadPart = 'fonts' | 'chunk' | 'assets' | 'world'

const loadParts: Record<LoadPart, number> = { fonts: 0, chunk: 0, assets: 0, world: 0 }
let loaderFailed = false

export function setLoadPart(part: LoadPart, value: number) {
  const v = value < 0 ? 0 : value > 1 ? 1 : value
  // monotonic: useProgress restarts its own count every time a new loader
  // manager run begins, and the visitor should never watch a number fall
  if (v > loadParts[part]) loadParts[part] = v
}

export function getLoadParts(): Readonly<Record<LoadPart, number>> {
  return loadParts
}

/** A glTF that will not load. The loader stops waiting and hands over. */
export function failLoader() {
  loaderFailed = true
}

export function isLoaderFailed(): boolean {
  return loaderFailed
}

export function subscribeLoader(fn: Listener): () => void {
  loaderListeners.add(fn)
  return () => loaderListeners.delete(fn)
}

export function getLoaderVersion(): number {
  return loaderVersion
}

export function isLoaderActive(): boolean {
  return state.loader.active
}

/** Per-frame readout from the loader's own rAF loop. Never through React. */
export function setLoaderReadout(next: Partial<Omit<LoaderState, 'active'>>) {
  Object.assign(state.loader, next)
}

/** How far through the arrival the aircraft is, 0 → 1. */
export function setEntry(value: number) {
  state.entry = value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * The chrome handoff: the instruments go back to reading the scroll, the rail
 * and the masthead come back, the scroll unlocks, and the loader will not play
 * again this session. The overlay itself is still on screen for the last of the
 * climb — it owns its own unmount — and `state.entry` keeps running, so this
 * deliberately leaves the arrival alone.
 */
export function endLoader() {
  if (!state.loader.active) return
  state.loader.active = false
  try {
    sessionStorage.setItem(LOADER_SEEN_KEY, '1')
  } catch {
    // best-effort: at worst the loader plays once more
  }
  loaderVersion++
  loaderListeners.forEach((fn) => fn())
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
  // HEADING_OFFSET turns the 3D layer's own frame into a compass, so the pose
  // the Intro settles into reads as runway 11 and the handoff has no jump
  state.heading = (((headingDeg + HEADING_OFFSET) % 360) + 360) % 360
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
