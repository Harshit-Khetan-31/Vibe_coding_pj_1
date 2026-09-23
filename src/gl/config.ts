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

/* ---- golden hour --------------------------------------------------------- */

/**
 * The sun sits just above the horizon and off to the right of the view axis, so
 * it is on screen (GodRays needs that) without sitting behind the aircraft for
 * the whole scroll. Angles, not a raw vector, so the look is one number away.
 */
export const SUN_ELEVATION_DEG = 3.4
export const SUN_AZIMUTH_DEG = 20
/** Where the sun billboard is parked. Inside `far`, outside everything else. */
export const SUN_DISTANCE = 300
export const SUN_RADIUS = 8.5

/** Unit vector toward the sun, camera-space = world space (the camera is fixed). */
export const SUN_DIRECTION: [number, number, number] = (() => {
  const el = (SUN_ELEVATION_DEG * Math.PI) / 180
  const az = (SUN_AZIMUTH_DEG * Math.PI) / 180
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
})()

/**
 * The gradient, bottom to top. Everything below the horizon is a sea of cloud
 * tops rather than ground, so there is no horizon line to hide — the sea just
 * washes out into `HAZE` as it approaches eye level.
 */
export const SKY_ZENITH = '#131a44' // deep indigo
export const SKY_HIGH = '#3e4a86' // dusty blue
export const SKY_MID = '#f2a781' // soft peach
export const SKY_HORIZON = '#ffc06b' // warm amber
export const SKY_HAZE = '#f6b27e' // what the cloud sea dissolves into
export const SUN_GLOW = '#ffd9a2'

/** The cloud sea below: lit tops, and the lavender shade between them. */
export const SEA_LIT = '#ffe4bd'
export const SEA_SHADE = '#7d76a6'
/** Noise scale and how fast the sea slides past at cruise. */
export const SEA_SCALE = 2.4
export const SEA_DRIFT = 0.12

export const FOG_COLOR = '#eeb184'
export const FOG_NEAR = 46
export const FOG_FAR = 270

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
  /** centre of the spawn box in Y — negative parks the layer below eye level */
  offsetY: number
  volume: number
  /** flattens the puff box vertically: 1 = billowing, 0.12 = a stratus sheet */
  flatten: number
  opacity: number
  color: string
  growth: number
}

/**
 * Four layers, parallaxed by depth: the near layer sweeps past the aircraft
 * fast, the far layer barely drifts. Speeds are set per layer rather than
 * derived from depth so the near layer can be pushed harder than perspective
 * alone would give — parallax you can feel at a glance.
 *
 * Since the golden-hour pass there are fewer and softer clouds: they read as
 * backlit shapes rather than as a texture, and their colour is deliberately a
 * near-white lavender so the *lighting* does the work — the warm key paints the
 * sun-facing rims gold, the lavender-slate hemisphere fills the rest. Nothing
 * here is brown, and nothing here is black.
 *
 * The last layer is different in kind: a thin, wide stratus sheet parked below
 * eye level, near the horizon, to give the distance a floor.
 */
export const CLOUD_LAYERS: CloudLayer[] = [
  {
    near: 4,
    far: 34,
    baseSpeed: 9,
    scrollSpeed: 110,
    count: 4,
    segments: 12,
    spreadX: 26,
    spreadY: 14,
    offsetY: 0,
    volume: 7,
    flatten: 1,
    opacity: 0.3,
    color: '#f4eef8',
    growth: 6,
  },
  {
    near: 40,
    far: 95,
    baseSpeed: 5,
    scrollSpeed: 60,
    count: 5,
    segments: 9,
    spreadX: 54,
    spreadY: 26,
    offsetY: -2,
    volume: 12,
    flatten: 1,
    opacity: 0.26,
    color: '#e7e0f2',
    growth: 7,
  },
  {
    near: 105,
    far: 185,
    baseSpeed: 2.4,
    scrollSpeed: 26,
    count: 6,
    segments: 6,
    spreadX: 110,
    spreadY: 46,
    offsetY: -6,
    volume: 22,
    flatten: 1,
    opacity: 0.18,
    color: '#d8d0e8',
    growth: 8,
  },
  {
    // stratus: thin bands low in the frame, almost stationary
    near: 120,
    far: 210,
    baseSpeed: 1.6,
    scrollSpeed: 16,
    count: 5,
    segments: 4,
    spreadX: 130,
    spreadY: 9,
    offsetY: -17,
    volume: 26,
    flatten: 0.12,
    opacity: 0.22,
    color: '#f3ddd6',
    growth: 9,
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

/* ---- livery -------------------------------------------------------------- */

/**
 * The paint. Both strings are projected onto the airframe mesh as decals, one
 * per side, so they wrap the fuselage and the fin instead of floating beside
 * them. Dark navy on the white body clears 4.5:1 comfortably.
 */
export const LIVERY_TITLE = 'HARSHIT'
export const LIVERY_REGISTRATION = 'VT-HRS'
export const LIVERY_INK = '#14213f'

/**
 * Where the strings sit, as fractions of the airframe's own bounding box —
 * never as model units, so a different aircraft still gets a sensible layout.
 * `Livery.tsx` measures the fuselage and turns these into decal boxes.
 */
export const LIVERY_TITLE_STATION = 0.45 // 0 = wing trailing edge, 1 = fin root
export const LIVERY_TITLE_HEIGHT = 0.3 // fraction of the fuselage's own depth
export const LIVERY_REG_STATION = 0.9 // fraction of the airframe length, from the nose
export const LIVERY_REG_HEIGHT = 0.34

/* ---- post-processing ----------------------------------------------------- */

/** Bloom is the only effect a phone gets; the rest are desktop-only. */
export const BLOOM_INTENSITY = 0.3
export const BLOOM_THRESHOLD = 0.88
export const BLOOM_SMOOTHING = 0.32
export const GODRAYS_DENSITY = 0.86
export const GODRAYS_DECAY = 0.93
export const GODRAYS_WEIGHT = 0.2
export const GODRAYS_EXPOSURE = 0.32
export const VIGNETTE_DARKNESS = 0.52
export const VIGNETTE_OFFSET = 0.32
