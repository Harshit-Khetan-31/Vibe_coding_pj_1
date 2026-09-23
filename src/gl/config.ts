/**
 * Every number the 3D layer is tuned by, in one place. Nothing below is
 * duplicated in a component.
 */

/* ---- model --------------------------------------------------------------- */

export const MODEL_URL = '/models/plane.glb'

/**
 * Which local axis the model's nose points down, before normalization.
 * `Plane.tsx` rotates this onto −Z, so swapping the model means changing this
 * line and nothing else.
 *
 * Socata ST 10: the instrument panel and windshield sit at −X, the tail at +X,
 * and the 9.6m wingspan runs along Z.
 */
export const MODEL_NOSE_AXIS: 'x' | '-x' | 'z' | '-z' = '-x'

/** Wingspan as a fraction of viewport width. */
export const SPAN_FRACTION_DESKTOP = 0.3
export const SPAN_FRACTION_MOBILE = 0.55
export const MOBILE_MAX_WIDTH = 768

/* ---- camera + world ------------------------------------------------------ */

export const FOV = 42
/** The camera never moves. The world streams past it. */
export const CAMERA_Z = 0
/** Depth the aircraft holds, world units in front of the camera. */
export const PLANE_DEPTH = 22

/** Dusk: sun just above the horizon, slightly off to one side. */
export const SUN_INCLINATION = 0.495
export const SUN_AZIMUTH = 0.22
export const FOG_NEAR = 30
export const FOG_FAR = 190

/* ---- cloud layers -------------------------------------------------------- */

export type CloudLayer = {
  /** depth range the layer occupies */
  near: number
  far: number
  /** world units per second at cruise, before scroll adds to it */
  baseSpeed: number
  /** how much scroll velocity adds on top */
  scrollSpeed: number
  count: number
  segments: number
  /** half-extent of the spawn box, in world units at that depth */
  spreadX: number
  spreadY: number
  volume: number
  opacity: number
  color: string
  growth: number
}

/**
 * Three layers, parallaxed by depth: the near layer sweeps past the aircraft
 * fast, the far layer barely drifts. Speeds are set per layer rather than
 * derived from depth so the near layer can be pushed harder than perspective
 * alone would give — parallax you can feel at a glance.
 */
export const CLOUD_LAYERS: CloudLayer[] = [
  {
    near: 4,
    far: 34,
    baseSpeed: 9,
    scrollSpeed: 110,
    count: 5,
    segments: 12,
    spreadX: 26,
    spreadY: 14,
    volume: 7,
    opacity: 0.5,
    color: '#f4c9a8',
    growth: 5,
  },
  {
    near: 40,
    far: 95,
    baseSpeed: 5,
    scrollSpeed: 60,
    count: 7,
    segments: 9,
    spreadX: 54,
    spreadY: 26,
    volume: 12,
    opacity: 0.42,
    color: '#e6b79b',
    growth: 6,
  },
  {
    near: 105,
    far: 185,
    baseSpeed: 2.4,
    scrollSpeed: 26,
    count: 8,
    segments: 6,
    spreadX: 110,
    spreadY: 46,
    volume: 22,
    opacity: 0.3,
    color: '#cf9e93',
    growth: 7,
  },
]

export const CLOUD_TEXTURE = '/textures/cloud.png'

/* ---- flight model -------------------------------------------------------- */

/** Spring frequencies, rad/s. Lower = heavier. */
export const OMEGA_ZONE_X = 1.5 // lateral repositioning: slow, so the turn reads
export const OMEGA_ZONE_Y = 2.1
export const OMEGA_ROLL = 3.4 // roll leads…
export const OMEGA_YAW = 1.7 // …yaw follows, at half the frequency
export const OMEGA_PITCH = 2.6

/** Roll angle per unit of lateral speed (world units/s), radians. */
export const ROLL_PER_LATERAL = 0.075
export const ROLL_MAX = 0.85
/** Yaw the coordinated turn produces per radian of roll. */
export const YAW_PER_ROLL = 0.42
/** Pointer influence on roll — desktop only, and never while manoeuvring. */
export const ROLL_PER_POINTER = 0.16

/** Nose-up per unit of scroll progress/s, radians. */
export const PITCH_PER_VELOCITY = 0.16
export const PITCH_MAX = 0.3
/** Nose follows the vertical component of the manoeuvre too. */
export const PITCH_PER_VERTICAL = 0.05

/** Idle bob: amplitude in world units, and its frequencies. */
export const BOB_AMPLITUDE = 0.55
export const BOB_RATE = 0.62
/** Low-frequency turbulence wander, world units and radians. */
export const WANDER_AMPLITUDE = 0.9
export const WANDER_ROLL = 0.1
export const WANDER_PITCH = 0.045

/** Propeller: revolutions per second at idle, and the throttle's contribution. */
export const PROP_IDLE_RPS = 7
export const PROP_MAX_RPS = 34

/* ---- screen zones -------------------------------------------------------- */

/**
 * How far off centre the aircraft parks, as a fraction of the half-viewport.
 * On a phone the text is full width, so the aircraft can only offset a little
 * and mostly separates itself vertically instead.
 */
export const ZONE_X_DESKTOP = 0.52
export const ZONE_X_MOBILE = 0.26
