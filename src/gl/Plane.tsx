import { useEffect, useMemo, useRef } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  AdditiveBlending,
  Box3,
  CanvasTexture,
  Color,
  Euler,
  Group,
  MathUtils,
  Mesh,
  Quaternion,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type Object3D,
  type SpriteMaterial,
} from 'three'
import { getTrack, isReducedMotion, setAttitude, setPropellerCoverage, state } from '../flight/store'
import { Livery } from './Livery'
import { Propeller } from './Propeller'
import { clamp, noise, snapSpring, spring, stepSpring, type Gate, gate, stepGate } from './spring'
import {
  BOB_AMPLITUDE,
  BOB_RATE,
  CAMERA_Z,
  FINALE_HIDE_Z,
  FINALE_PASS_END,
  FINALE_PASS_START,
  FINALE_PASS_Z,
  FINALE_PROP_GROW,
  FINALE_TURN_END,
  FOV,
  HEADING_AT_CAMERA,
  HEADING_AWAY,
  MOBILE_MAX_WIDTH,
  MODEL_NOSE_AXIS,
  MODEL_URL,
  NAV_LIGHT_GREEN,
  NAV_LIGHT_INTENSITY,
  NAV_LIGHT_RED,
  NAV_LIGHT_SIZE,
  NAV_LIGHT_WHITE,
  NAV_STROBE_GAP,
  NAV_STROBE_INTENSITY,
  NAV_STROBE_PERIOD,
  NAV_STROBE_WIDTH,
  OMEGA_HEADING,
  OMEGA_PITCH,
  OMEGA_ROLL,
  OMEGA_Z,
  OMEGA_ZONE_X,
  OMEGA_ZONE_Y,
  PITCH_MAX,
  PITCH_PER_CLIMB,
  PITCH_PER_VELOCITY,
  PITCH_PER_VERTICAL,
  PLANE_DEPTH,
  REVERSAL_DWELL,
  ROLL_MAX,
  ROLL_PER_CURVE,
  ROLL_PER_POINTER,
  ROLL_PER_TURN,
  SCROLL_REVERSAL_SPEED,
  SPAN_FRACTION_DESKTOP,
  SPAN_FRACTION_MOBILE,
  TOP_SETTLE,
  VIEW_SWEEP,
  WANDER_AMPLITUDE,
  WANDER_IDLE,
  WANDER_PITCH,
  WANDER_ROLL,
  ZONE_X_DESKTOP,
  ZONE_X_MOBILE,
  ZONE_Y_MOBILE_LIFT,
} from './config'

/**
 * The aircraft, and the flight model that moves it.
 *
 * There is no keyframe anywhere below. `route.ts` says where the aircraft
 * *should* be for a given scroll progress; everything you actually see is a
 * critically damped spring chasing that, which is why a fast flick or a
 * reversed scroll can only ever make the aeroplane glide harder — it cannot
 * snap, and it cannot ring.
 *
 * Phase 2B adds three things to that. The aircraft is now seen from the side
 * rather than from behind, so its heading is a real quantity instead of a
 * fixed pose. It weaves across the screen between sections rather than sliding
 * between two parked zones. And it turns around — properly, banked, through the
 * front — whenever the direction it is travelling in reverses.
 *
 * The heading is the interesting part. It lives on one arc centred on "nose at
 * the camera" (`HEADING_AT_CAMERA`), with flying-right and flying-left the same
 * distance either side of it. A spring between those two targets therefore
 * sweeps *through* the camera-facing pose: that single fact is the U-turn, the
 * three-quarter view and the guarantee that the aircraft is never seen
 * tail-first, and none of the three needed a special case.
 */

useGLTF.preload(MODEL_URL)

/** The rotation that puts the model's nose down −Z, whatever it shipped as. */
function noseQuaternion(): Quaternion {
  const q = new Quaternion()
  const y = (angle: number) => q.setFromAxisAngle(new Vector3(0, 1, 0), angle)
  switch (MODEL_NOSE_AXIS) {
    case '-z':
      return q
    case 'z':
      return y(Math.PI)
    case '-x':
      return y(-Math.PI / 2)
    case 'x':
      return y(Math.PI / 2)
  }
}

/**
 * Where the model's own propeller is, measured rather than guessed.
 *
 * Everything here is in normalized model units: nose down -Z, +X the right
 * wing, origin at the centre of the bounding box.
 */
export type Spinner = {
  /** centre of the shaft - the model is not perfectly on its own axis */
  x: number
  y: number
  /** the mounting plane: where the spinner cone meets the cowling */
  z: number
  /** radius of the spinner at that plane */
  radius: number
  /** how far the model's fused blades reach - the real propeller radius */
  tipRadius: number
  /** false when the measurement failed and these are bounding-box guesses */
  measured: boolean
}

type Normalized = {
  object: Object3D
  /** wingspan after orientation, model units */
  span: number
  /** distance from the centre to the nose, model units */
  noseOffset: number
  /** distance from the centre to the tail */
  tailOffset: number
  /** height of the wingtips, so the nav lights sit on the wing and not beside it */
  wingY: number
  /** station of the wingtips along the fuselage */
  wingZ: number
  /** the model's propeller, measured in `normalize()` */
  spinner: Spinner
  /**
   * The airframe skin, which is where the paint goes. The model ships 41
   * unnamed `Object_N` meshes — forty of them are the cockpit — so it is picked
   * by weight rather than by name: the exterior shell is an order of magnitude
   * denser than any instrument on the panel.
   */
  fuselage: Mesh | null
}

/** How far behind the nose the propeller slab reaches, as a fraction of span. */
const SPINNER_SLAB = 0.02
/** Anything this much wider than the spinner, inside the slab, is a blade. */
const BLADE_MARGIN = 1.15

/** Each vertex of a mesh, in normalized model space. */
function forEachVertex(mesh: Mesh, fn: (v: Vector3, i: number) => void) {
  const position = mesh.geometry?.getAttribute('position') as BufferAttribute | undefined
  if (!position) return
  const v = new Vector3()
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
    fn(v, i)
  }
}

/**
 * Find the propeller inside the airframe mesh.
 *
 * The model ships its propeller fused into the fuselage, so there is nothing to
 * look up by name - but there is a shape to look for. Everything within 2% of
 * the span behind the nose is either the spinner cone (a tight cluster of small
 * radii around the shaft) or a blade (a thin sheet reaching most of the way to
 * the tip). Sorting that slab's radii and taking the widest gap in the lower
 * half separates the two: below the gap is the spinner, above it are the blades.
 *
 * The mounting plane then comes for free - the furthest aft any vertex gets
 * while still inside the spinner radius is exactly where the cone ends and the
 * cowling takes over.
 */
function measureSpinner(fuselage: Mesh, span: number): Spinner | null {
  const position = fuselage.geometry?.getAttribute('position')
  if (!position || position.count < 3) return null

  let minZ = Infinity
  forEachVertex(fuselage, (p) => {
    if (p.z < minZ) minZ = p.z
  })
  if (!Number.isFinite(minZ)) return null

  const slabBack = minZ + span * SPINNER_SLAB
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  forEachVertex(fuselage, (p) => {
    if (p.z > slabBack) return
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  })
  if (!Number.isFinite(minX)) return null

  // the blades are symmetric about the shaft, so the slab's own bounding box
  // centre is the shaft - no averaging, which vertex density would skew
  const x = (minX + maxX) / 2
  const y = (minY + maxY) / 2

  const radii: number[] = []
  forEachVertex(fuselage, (p) => {
    if (p.z <= slabBack) radii.push(Math.hypot(p.x - x, p.y - y))
  })
  if (radii.length < 8) return null
  radii.sort((a, b) => a - b)

  const tipRadius = radii[radii.length - 1]
  if (!(tipRadius > 0)) return null

  let widest = 0
  let radius = tipRadius * 0.22
  for (let i = 1; i < radii.length; i += 1) {
    if (radii[i] > tipRadius * 0.6) break
    const gap = radii[i] - radii[i - 1]
    if (gap > widest) {
      widest = gap
      radius = radii[i - 1]
    }
  }
  // a fused cone and blade roots that touch leave no gap worth trusting
  if (widest < tipRadius * 0.015 || radius <= 0) radius = tipRadius * 0.22

  let z = slabBack
  const cowlLimit = minZ + span * 0.25
  forEachVertex(fuselage, (p) => {
    if (p.z > cowlLimit || p.z <= z) return
    if (Math.hypot(p.x - x, p.y - y) <= radius * 1.02) z = p.z
  })

  return { x, y, z, radius, tipRadius, measured: true }
}

/**
 * Drop the fused blades, keep the spinner and the cowling.
 *
 * Only whole triangles go: a triangle whose three vertices all sit in the
 * propeller slab *and* all sit outside the spinner is blade and nothing else.
 * Anything straddling the boundary is cowling, so it stays and the nose keeps
 * its skin. The geometry is cloned first, because `Object3D.clone()` shares it
 * with the cached glTF.
 */
function stripFusedBlades(fuselage: Mesh, spinner: Spinner, span: number): number {
  const source = fuselage.geometry as BufferGeometry
  const position = source.getAttribute('position') as BufferAttribute | undefined
  if (!position) return 0

  let minZ = Infinity
  forEachVertex(fuselage, (p) => {
    if (p.z < minZ) minZ = p.z
  })
  const slabBack = minZ + span * SPINNER_SLAB
  const cut = spinner.radius * BLADE_MARGIN

  const isBlade = new Uint8Array(position.count)
  forEachVertex(fuselage, (p, i) => {
    const outside = Math.hypot(p.x - spinner.x, p.y - spinner.y) > cut
    isBlade[i] = p.z <= slabBack && outside ? 1 : 0
  })

  const index = source.getIndex()
  const count = index ? index.count : position.count
  const kept: number[] = []
  let removed = 0
  for (let i = 0; i + 2 < count; i += 3) {
    const a = index ? index.getX(i) : i
    const b = index ? index.getX(i + 1) : i + 1
    const c = index ? index.getX(i + 2) : i + 2
    if (isBlade[a] && isBlade[b] && isBlade[c]) {
      removed += 1
      continue
    }
    kept.push(a, b, c)
  }
  if (!removed) return 0

  const geometry = source.clone()
  geometry.setIndex(kept)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  fuselage.geometry = geometry
  return removed
}

/** Vite's dev flag, reached without pulling its ambient types into tsconfig. */
const DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true

/* ---- the arrival ---------------------------------------------------------
 *
 * The loader's takeoff ends with the real aircraft flying into the frame. It
 * starts below and behind the camera with its nose away — the pose you would be
 * left in having just watched it leave the runway over your head — and blends
 * onto the ordinary Intro pose across `state.entry`.
 *
 * What is blended is the *target*, never the spring: the springs keep chasing
 * as they do for everything else, which is why the arrival cannot snap however
 * fast the loader was skipped through.
 */

/** How far below the frame the aircraft starts, in half-viewports. */
const ENTRY_BELOW = 2.4
/** And the bank it is still holding off the runway. */
const ENTRY_BANK = 0.2

let loggedSpinner = false

/**
 * Centre the model on its own bounding box and point it down −Z, so the rest of
 * the file can treat it as a unit-agnostic aircraft: +X is the right wing, +Y
 * is up, −Z is the direction of flight.
 */
function normalize(source: Object3D): Normalized {
  const object = source.clone(true)
  object.quaternion.copy(noseQuaternion())
  object.updateMatrixWorld(true)

  const box = new Box3().setFromObject(object)
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  object.position.set(-center.x, -center.y, -center.z)
  // the recentre has to land in the matrices before anything is measured off
  // them: every measurement below reads world space and expects it to be the
  // normalized space the rest of the file talks in
  object.updateMatrixWorld(true)

  let fuselage: Mesh | null = null
  let densest = 0
  const meshes: Mesh[] = []
  object.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
    meshes.push(mesh)
    const count = mesh.geometry?.getAttribute('position')?.count ?? 0
    if (count > densest) {
      densest = count
      fuselage = mesh
    }
  })

  const span = Math.max(size.x, 1e-3)

  // the wingtips, for the nav lights: the outermost vertex in the whole model
  // is the tip of a wing, and its height is where a nav light is bolted
  let wingY = 0
  let wingZ = 0
  let reach = 0
  for (const mesh of meshes) {
    forEachVertex(mesh, (p) => {
      const out = Math.abs(p.x)
      if (out <= reach) return
      reach = out
      wingY = p.y
      wingZ = p.z
    })
  }

  const skin = fuselage as Mesh | null
  const measured = skin ? measureSpinner(skin, span) : null
  const spinner: Spinner = measured ?? {
    x: 0,
    y: 0,
    z: -size.z / 2 + span * 0.02,
    radius: span * 0.045,
    tipRadius: span * 0.19,
    measured: false,
  }
  const removed = skin && measured ? stripFusedBlades(skin, spinner, span) : 0

  if (DEV && !loggedSpinner) {
    loggedSpinner = true
    console.info('[plane] spinner', { ...spinner, span, bladeTrianglesRemoved: removed })
  }

  return {
    object,
    span,
    noseOffset: size.z / 2,
    tailOffset: size.z / 2,
    wingY,
    wingZ,
    spinner,
    fuselage,
  }
}

const TWO_PI = Math.PI * 2

/**
 * The representative of `target` nearest the current angle. Keeping the heading
 * unwrapped rather than folded into 0…2π is what lets a turn be a turn: the
 * spring interpolates the shortest real rotation instead of teleporting across
 * the seam.
 */
function nearestAngle(current: number, target: number): number {
  return target + TWO_PI * Math.round((current - target) / TWO_PI)
}

const smoothstep01 = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** 0 outside [a,b], eased 0→1 across it. */
const ramp = (v: number, a: number, b: number) => smoothstep01((v - a) / Math.max(b - a, 1e-4))

/**
 * A soft round falloff, drawn once. A sprite with additive blending and this on
 * it is a light; the same sprite with a hard-edged texture is a sticker.
 */
function lightTexture(): CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.22, 'rgba(255,255,255,0.72)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.14)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

/** One pulse of the strobe: a short, symmetric flash starting at `u` = 0. */
function flash(u: number): number {
  if (u < 0 || u > NAV_STROBE_WIDTH) return 0
  return Math.sin((u / NAV_STROBE_WIDTH) * Math.PI)
}

/**
 * Red on the left wingtip, green on the right, and a white tail strobe that
 * double-flashes every `NAV_STROBE_PERIOD`. The two wingtip lights are steady;
 * the strobe is the only thing here that moves, and the only thing bright
 * enough to be an event rather than a detail.
 *
 * All three sit a hair above `BLOOM_THRESHOLD` and are not tone mapped, so the
 * bloom pass picks them up and nothing else in the frame changes at all.
 */
function NavLights({
  span,
  wingY,
  wingZ,
  tailZ,
}: {
  span: number
  wingY: number
  wingZ: number
  tailZ: number
}) {
  const texture = useMemo(() => lightTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])

  const colors = useMemo(
    () => ({
      red: new Color(NAV_LIGHT_RED).multiplyScalar(NAV_LIGHT_INTENSITY),
      green: new Color(NAV_LIGHT_GREEN).multiplyScalar(NAV_LIGHT_INTENSITY),
      white: new Color(NAV_LIGHT_WHITE).multiplyScalar(NAV_STROBE_INTENSITY),
    }),
    [],
  )

  const strobe = useRef<SpriteMaterial>(null)
  useFrame(({ clock }) => {
    if (!strobe.current) return
    const u = clock.elapsedTime % NAV_STROBE_PERIOD
    strobe.current.opacity = Math.max(flash(u), flash(u - NAV_STROBE_GAP))
  })

  const size = span * NAV_LIGHT_SIZE
  // just inboard of the very tip, where the lens actually lives
  const tip = (span / 2) * 0.985

  return (
    <group>
      <sprite position={[-tip, wingY, wingZ]} scale={[size, size, size]}>
        <spriteMaterial
          map={texture}
          color={colors.red}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite position={[tip, wingY, wingZ]} scale={[size, size, size]}>
        <spriteMaterial
          map={texture}
          color={colors.green}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite position={[0, wingY, tailZ * 0.985]} scale={[size * 1.2, size * 1.2, size * 1.2]}>
        <spriteMaterial
          ref={strobe}
          map={texture}
          color={colors.white}
          blending={AdditiveBlending}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}

export function Plane() {
  const gltf = useGLTF(MODEL_URL)
  const model = useMemo(() => normalize(gltf.scene), [gltf.scene])

  const rig = useRef<Group>(null)
  const scaler = useRef<Group>(null)

  const springs = useRef({
    x: spring(0),
    y: spring(0),
    z: spring(-PLANE_DEPTH),
    roll: spring(0),
    pitch: spring(0),
    // an arrival starts nose-away; everything else starts facing the viewer
    heading: spring(state.entry < 1 ? HEADING_AWAY : HEADING_AT_CAMERA),
  })
  /**
   * The reversal gate, on the scroll itself: +1 flying toward the viewer,
   * −1 flying away. It is the only piece of state in the facing model.
   */
  const scroll = useRef<Gate>(gate(1))
  const settled = useRef(false)
  const scale = useRef(1)
  const euler = useRef(new Euler(0, 0, 0, 'YXZ'))

  /** Shared with the propeller, which needs to know about the fly-through. */
  const finale = useRef({ boost: 0, grow: 1 })

  // size, not camera.aspect: a resize updates this before the camera, and the
  // zone and the scale both have to move in the same frame or the aircraft
  // visibly jumps mid-drag
  const size = useThree((s) => s.size)

  useFrame(({ clock }, delta) => {
    const group = rig.current
    const track = getTrack()
    if (!group || !track) return
    // a resumed tab hands rAF one huge delta; the springs are stable under it,
    // but clamping keeps the noise terms from jumping a whole cycle
    const dt = clamp(delta, 1 / 240, 1 / 20)
    const t = clock.elapsedTime
    const s = springs.current
    const route = track.route

    /* viewport, in world units at the aircraft's depth --------------------- */
    const halfH = Math.tan(MathUtils.degToRad(FOV) / 2) * PLANE_DEPTH
    const halfW = halfH * (size.width / Math.max(size.height, 1))

    /* scale: wingspan as a fixed fraction of viewport width ---------------- */
    const mobile = size.width <= MOBILE_MAX_WIDTH
    const fraction = mobile ? SPAN_FRACTION_MOBILE : SPAN_FRACTION_DESKTOP
    scale.current = (fraction * halfW * 2) / model.span
    scaler.current?.scale.setScalar(scale.current)

    /* the finale ------------------------------------------------------------ */
    // one number, 0…1, and every part of the fly-through is a function of it —
    // which is what makes scrolling back up replay it in reverse for free
    const finaleSpan = Math.max(route.finale.to - route.finale.from, 1e-4)
    const f = clamp((state.progress - route.finale.from) / finaleSpan, 0, 1)
    const turning = smoothstep01(f / FINALE_TURN_END)
    const approach = Math.pow(ramp(f, FINALE_PASS_START, FINALE_PASS_END), 1.35)

    /* the serpentine -------------------------------------------------------- */
    // The path never stops: position is a closed-form function of smoothed
    // progress, so the aircraft is flying the whole way down and the only thing
    // that changes when you stop scrolling is that the curve stops advancing.
    const still = isReducedMotion()
    const spread = still ? 0 : mobile ? ZONE_X_MOBILE : ZONE_X_DESKTOP
    const p = state.progress
    const turb = state.turbulence
    // idle is a hover and nothing else — a second unrelated drift running under
    // the serpentine reads as slop rather than as air
    const wander = still ? 0 : WANDER_IDLE * state.idle + turb
    const calm = still ? 0 : 0.3 + 0.7 * state.idle

    const bob = Math.sin(t * BOB_RATE * Math.PI * 2) * BOB_AMPLITUDE * calm * (halfH / 10)
    const wanderX = noise(t, 1.7) * WANDER_AMPLITUDE * wander * (halfW / 14)
    const wanderY = noise(t, 5.9) * WANDER_AMPLITUDE * 0.7 * wander * (halfH / 10)

    const routeX = route.x(p) * spread
    // on a phone the text is full width, so the aircraft separates itself by
    // climbing above it rather than by moving aside
    const climbY = still ? 0 : route.y(p)
    const routeY = mobile ? climbY * 0.5 + ZONE_Y_MOBILE_LIFT : climbY

    // the finale pulls it onto the centreline before it turns at the camera
    const targetX = routeX * halfW * (1 - turning) + wanderX * (1 - turning)
    let targetY = routeY * halfH * (1 - turning) + (bob + wanderY) * (1 - turning)
    let targetZ = -PLANE_DEPTH + (PLANE_DEPTH + FINALE_PASS_Z) * approach

    /* the arrival ----------------------------------------------------------- */
    const entry = smoothstep01(state.entry)
    if (entry < 1) {
      targetY = targetY + (-halfH * ENTRY_BELOW - targetY) * (1 - entry)
      targetZ = targetZ + (FINALE_PASS_Z - targetZ) * (1 - entry)
    }

    if (!settled.current) {
      snapSpring(s.x, targetX)
      snapSpring(s.y, targetY)
      // the arrival starts behind the camera, which is nowhere near the depth
      // the spring was built at, so the first frame has to start from the pose
      // rather than fly to it
      snapSpring(s.z, targetZ)
      settled.current = true
    }

    const x = stepSpring(s.x, targetX, OMEGA_ZONE_X, dt)
    const y = stepSpring(s.y, targetY, OMEGA_ZONE_Y, dt)
    const z = stepSpring(s.z, targetZ, OMEGA_Z, dt)
    group.position.set(x, y, z)
    // past the camera there is nothing to draw, and the near plane would slice
    // the airframe into confetti on the way through
    group.visible = z < FINALE_HIDE_Z

    /* facing: the direction the aircraft is actually travelling ------------- */
    // Travel has two components. The depth one is simply which way you are
    // scrolling — down means the page is coming at you, so the aeroplane is
    // flying toward the viewer and you see its front and its propeller; up
    // means it is flying away and you see its tail. The lateral one is the
    // path's own tangent, exact rather than differenced, so the nose leads
    // along the curve at any scroll speed and swings through head-on at the
    // ends of each swing instead of ever sitting flat side-on.
    //
    // The gate is the anti-jitter rule: the scroll has to clear a speed *and*
    // hold its sign for REVERSAL_DWELL before the aircraft commits, so a
    // trackpad bounce cannot start a U-turn. The turn between the two facings
    // is then just the heading spring covering 180 degrees.
    const direction = stepGate(
      scroll.current,
      state.velocity,
      SCROLL_REVERSAL_SPEED,
      REVERSAL_DWELL,
      dt,
    )
    const lean = still ? 0 : route.lean(p)
    const tx = direction * lean * Math.sin(VIEW_SWEEP)
    const tz = direction * Math.cos(VIEW_SWEEP)

    const psi = s.heading.value
    // nose = (-sin psi, 0, -cos psi), so this is simply "point the nose down
    // the travel vector" — the three-quarter, the reversal and the
    // no-flat-profile rule all fall out of it rather than being cased apart
    const travelling = nearestAngle(psi, Math.atan2(-tx, -tz))
    // at the very top the aircraft always settles facing the viewer, whichever
    // way the last scroll went
    const front = nearestAngle(psi, HEADING_AT_CAMERA)
    const atTop = 1 - smoothstep01(p / TOP_SETTLE)
    let headingTarget = travelling + (front - travelling) * atTop

    // forward through the finale it turns to face the camera; backing out of it
    // the aircraft is receding, so it has to be pointing away instead
    const finaleHeading = nearestAngle(psi, direction > 0 ? HEADING_AT_CAMERA : HEADING_AWAY)
    headingTarget += (finaleHeading - headingTarget) * turning
    // climbing away from the viewer, so the nose is pointing away
    if (entry < 1) {
      const away = nearestAngle(psi, HEADING_AWAY)
      headingTarget += (away - headingTarget) * (1 - entry)
    }
    const heading = stepSpring(s.heading, headingTarget, OMEGA_HEADING, dt)

    /* bank ------------------------------------------------------------------ */
    // Two sources: the steady bank held through the curve, which is the path's
    // lateral curvature and therefore peaks at the ends of each swing and
    // vanishes at the crossings; and the transient from the heading rate, which
    // is what rolls the aircraft over during a reversal. The curvature term
    // flips with travel direction, because the same geometric turn is a left
    // turn seen from the front and a right turn seen from behind.
    let rollTarget = clamp(
      route.curve(p) * direction * ROLL_PER_CURVE * (still ? 0 : 1) +
        s.heading.velocity * ROLL_PER_TURN,
      -ROLL_MAX,
      ROLL_MAX,
    )
    const manoeuvring = clamp(Math.abs(s.heading.velocity) * 0.5, 0, 1)
    rollTarget += -state.pointerX * ROLL_PER_POINTER * (1 - manoeuvring) * (1 - turning)
    rollTarget += noise(t, 3.1) * WANDER_ROLL * wander * (1 - turning)
    if (entry < 1) rollTarget += (ENTRY_BANK - rollTarget) * (1 - entry)
    const roll = stepSpring(s.roll, rollTarget, OMEGA_ROLL, dt)

    /* pitch: nose up on fast scroll, then settles --------------------------- */
    let pitchTarget = clamp(state.velocity * PITCH_PER_VELOCITY, -PITCH_MAX, PITCH_MAX)
    pitchTarget += clamp(
      (s.y.velocity / Math.max(halfH / 10, 1e-3)) * PITCH_PER_VERTICAL,
      -PITCH_MAX,
      PITCH_MAX,
    )
    // the route's own climb rate, so the vertical weave is flown rather than
    // slid — and it reverses with travel, like the bank
    pitchTarget += clamp(
      route.climb(p) * direction * PITCH_PER_CLIMB * (still ? 0 : 1),
      -PITCH_MAX,
      PITCH_MAX,
    )
    pitchTarget += noise(t, 8.4) * WANDER_PITCH * wander
    pitchTarget *= 1 - turning
    const pitch = stepSpring(s.pitch, pitchTarget, OMEGA_PITCH, dt)

    euler.current.set(pitch, heading, roll)
    group.rotation.copy(euler.current)

    /* what the propeller needs to know -------------------------------------- */
    finale.current.boost = turning
    finale.current.grow = 1 + FINALE_PROP_GROW * approach * approach

    /* propeller screen coverage: the disc's real on-screen size, which is what
       actually cues CONTACT's reveal (see store.ts) rather than a fixed scroll
       position — so the trigger tracks the close-up moment even if the
       finale's timing or depth is retuned later. */
    const propRadius = model.spinner.tipRadius * scale.current * finale.current.grow
    const distance = Math.max(CAMERA_Z - z, 0.05)
    const tanHalfFov = halfH / PLANE_DEPTH
    setPropellerCoverage(propRadius / (tanHalfFov * distance))

    // the instruments read the aircraft, not a second simulation of it
    // driftX is what the aircraft is *seen* to do, so the clouds get the real
    // lateral velocity rather than the route's
    setAttitude(MathUtils.radToDeg(heading), roll, s.x.velocity / Math.max(halfW, 1e-3))
  })

  return (
    <group ref={rig}>
      <group ref={scaler}>
        <primitive object={model.object} />
        {/* the paint is projected onto the skin itself, so it lives in the
            fuselage mesh's own space rather than beside it in the tree */}
        {model.fuselage && createPortal(<Livery fuselage={model.fuselage} />, model.fuselage)}
        <Propeller
          radius={model.spinner.tipRadius}
          position={[model.spinner.x, model.spinner.y, model.spinner.z]}
          // the model keeps its own spinner, so the procedural hub and cone
          // would sit inside it: they are only for the unmeasured fallback
          hub={!model.spinner.measured}
          finale={finale}
        />
        <NavLights
          span={model.span}
          wingY={model.wingY}
          wingZ={model.wingZ}
          tailZ={model.tailOffset}
        />
      </group>
    </group>
  )
}
