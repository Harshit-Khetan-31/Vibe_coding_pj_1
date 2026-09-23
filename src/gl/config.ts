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

/**
 * The cloud sea below: golden lit tops, and the shade between them.
 *
 * The shade used to be a saturated blue-lavender, which at this scale read as
 * patches of purple sitting in an otherwise warm frame. It is now a warm dusty
 * mauve — still cool *relative* to the tops, which is all that is needed for
 * the sea to have form, but with nowhere near enough saturation to become a
 * colour of its own.
 */
export const SEA_LIT = '#ffdcae'
export const SEA_SHADE = '#c0a6a8'
/**
 * Feature scale, and how fast the sea slides past at cruise. The scale is low
 * on purpose: a high one puts several noise cells in every pixel near the
 * horizon, where the repeat becomes legible as a texture rather than as cloud.
 */
export const SEA_SCALE = 0.95
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
    color: '#f7f0ec',
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
    color: '#efe4e0',
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
    color: '#e2d3d2',
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

/**
 * How hard the aircraft's lateral travel pushes the weather the other way. Low,
 * and lower than it was: the aircraft now weaves continuously rather than
 * crossing once per section, so anything stronger sloshes the whole sky back
 * and forth instead of reading as parallax against the weave.
 */
export const CLOUD_LATERAL = 0.05

/* ---- the view ------------------------------------------------------------ */

/**
 * The facing model. The camera never moves — the golden-hour framing, the sun
 * position and the god rays are all tuned to a camera at the origin looking
 * down -Z, and moving it would re-grade the whole picture. So the *aircraft*
 * turns, and its heading is built from the direction it is actually travelling.
 *
 * Travel has two components: a depth one, which is simply which way you are
 * scrolling (down = flying toward you, up = flying away), and a lateral one,
 * which is the path's own tangent. `VIEW_SWEEP_DEG` is how far off the view
 * axis the aircraft gets at full lateral lean — so it reads as a three-quarter
 * at the crossings and as head-on (or tail-on) at the ends of each swing, and
 * it is never a flat side profile.
 */
export const VIEW_SWEEP_DEG = 44
export const VIEW_SWEEP = (VIEW_SWEEP_DEG * Math.PI) / 180

/** Nose at the camera, and nose away from it. */
export const HEADING_AT_CAMERA = Math.PI
export const HEADING_AWAY = 0

/**
 * The reversal gate. Scroll velocity (progress per second) has to exceed this
 * *and* hold its sign for this long before the aircraft commits to turning
 * around — so jitter, a trackpad bounce or the settle at the end of a flick can
 * never start a U-turn. `OMEGA_HEADING` then sets how long the turn itself
 * takes, which is a little under a second.
 */
export const SCROLL_REVERSAL_SPEED = 0.02
export const REVERSAL_DWELL = 0.22

/**
 * Below this much progress the aircraft settles facing the viewer whatever the
 * last scroll direction was, so the top of the page always opens on the front
 * of the aeroplane with its propeller turning.
 */
export const TOP_SETTLE = 0.035

/* ---- the finale ---------------------------------------------------------- */

/**
 * The last stretch before CONTACT, as fractions of the finale's own window
 * (see `route.ts` for where that window sits in the scroll).
 *
 * It is written as a pure function of progress and then chased by springs, so
 * scrolling back up plays it backwards with no second code path — the only
 * thing that is *not* symmetric is the heading, because an aircraft receding
 * from the camera has to be pointing away from it.
 */
export const FINALE_TURN_END = 0.3
export const FINALE_PASS_START = 0.3
export const FINALE_PASS_END = 0.86
/** Where the aircraft ends up: behind the camera. */
export const FINALE_PASS_Z = 3.2
/** Slightly in front of the near plane — past this it is simply not drawn. */
export const FINALE_HIDE_Z = -0.15
/** Extra propeller scale at the pass-through, so the disc covers any aspect. */
export const FINALE_PROP_GROW = 1.35

/* ---- flight model -------------------------------------------------------- */

/** Spring frequencies, rad/s. Lower = heavier. */
/**
 * Position. These used to be slow, because they were gliding between two parked
 * zones and the glide *was* the motion. Now they are chasing a path that is
 * already smooth and already moving, so they act as a low-pass on it instead:
 * fast enough that the weave survives an ordinary scroll, slow enough that a
 * hard flick flattens it out, which is what an aeroplane would do anyway.
 */
export const OMEGA_ZONE_X = 6.0
export const OMEGA_ZONE_Y = 5.0
export const OMEGA_ROLL = 3.4 // roll leads the turn it is banking into
export const OMEGA_PITCH = 2.6
/** Heading: a 180 degree reversal settles in a little under a second. */
export const OMEGA_HEADING = 5.0
/** Depth, used only by the finale's fly-through. */
export const OMEGA_Z = 5.5

/**
 * Bank has two sources, and both are real aerodynamics rather than decoration.
 * `ROLL_PER_CURVE` is the steady bank held through the curve, proportional to
 * the path's lateral curvature — hardest at the ends of each swing, zero at the
 * crossings. `ROLL_PER_TURN` is the transient on top of it, per rad/s of
 * heading rate, which is what banks the aircraft over during a reversal.
 */
export const ROLL_PER_CURVE = 0.42
export const ROLL_PER_TURN = 0.16
export const ROLL_MAX = 0.9
/** Pointer influence on roll — desktop only, and never while manoeuvring. */
export const ROLL_PER_POINTER = 0.16

/** Nose-up per unit of scroll progress/s, radians. */
export const PITCH_PER_VELOCITY = 0.16
export const PITCH_MAX = 0.3
/** Nose follows the vertical component of the manoeuvre too. */
export const PITCH_PER_VERTICAL = 0.05
/** And the route's own climb rate, which is where the gentle porpoise shows. */
export const PITCH_PER_CLIMB = 0.3

/** Idle hover: amplitude in world units, and its frequency. */
export const BOB_AMPLITUDE = 0.5
export const BOB_RATE = 0.62
/**
 * Low-frequency wander. It is gated on idle and on turbulence rather than left
 * running: while the aircraft is flying the serpentine, a second unrelated
 * drift on top of it only reads as slop.
 */
export const WANDER_AMPLITUDE = 0.9
export const WANDER_IDLE = 0.22
export const WANDER_ROLL = 0.1
export const WANDER_PITCH = 0.045

/** Propeller: revolutions per second at idle, and the throttle's contribution. */
export const PROP_IDLE_RPS = 7
export const PROP_MAX_RPS = 34
/**
 * The blades read as blades below the first figure and as a solid disc above
 * the second; between them they cross-fade, which is what a real propeller
 * does as it spools up.
 */
export const PROP_BLUR_FROM = 9
export const PROP_BLUR_TO = 22
/** Geometry, as fractions of the disc radius. */
export const PROP_BLADES = 3
export const PROP_BLADE_WIDTH = 0.17
export const PROP_BLADE_TWIST = 0.38
export const PROP_HUB_RADIUS = 0.13
export const PROP_INK = '#171b2c'

/* ---- screen zones -------------------------------------------------------- */

/**
 * How far off centre the aircraft parks, as a fraction of the half-viewport.
 * On a phone the text is full width, so the aircraft can only offset a little
 * and mostly separates itself vertically instead.
 */
export const ZONE_X_DESKTOP = 0.56
export const ZONE_X_MOBILE = 0.3
/** On a phone the aircraft separates itself by climbing, not by moving aside. */
export const ZONE_Y_MOBILE_LIFT = 0.34

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

/**
 * Bloom is the only effect a phone gets; the rest are desktop-only.
 *
 * Both are deliberately restrained. Bloom at a low threshold over a sky this
 * bright lifts a halo off every high-contrast edge in the frame, including the
 * headlines sitting in front of it, and mipmap bloom separates that halo into
 * colour as it spreads. The threshold now sits above everything except the sun
 * disc itself, which is the only thing that was ever meant to bloom.
 */
export const BLOOM_INTENSITY = 0.22
export const BLOOM_THRESHOLD = 0.96
export const BLOOM_SMOOTHING = 0.22
export const GODRAYS_DENSITY = 0.82
export const GODRAYS_DECAY = 0.93
export const GODRAYS_WEIGHT = 0.13
export const GODRAYS_EXPOSURE = 0.22
export const VIGNETTE_DARKNESS = 0.52
export const VIGNETTE_OFFSET = 0.32
