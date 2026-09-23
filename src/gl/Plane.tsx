import { useMemo, useRef } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, Euler, Group, MathUtils, Mesh, Quaternion, Vector3, type Object3D } from 'three'
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

type Normalized = {
  object: Object3D
  /** wingspan after orientation, model units */
  span: number
  /** distance from the centre to the nose, model units */
  noseOffset: number
  /**
   * The airframe skin, which is where the paint goes. The model ships 41
   * unnamed `Object_N` meshes — forty of them are the cockpit — so it is picked
   * by weight rather than by name: the exterior shell is an order of magnitude
   * denser than any instrument on the panel.
   */
  fuselage: Mesh | null
}

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

  let fuselage: Mesh | null = null
  let densest = 0
  object.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
    const count = mesh.geometry?.getAttribute('position')?.count ?? 0
    if (count > densest) {
      densest = count
      fuselage = mesh
    }
  })

  return { object, span: Math.max(size.x, 1e-3), noseOffset: size.z / 2, fuselage }
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

/** Mirrors the `radius` handed to `<Propeller>` below, in model-span units. */
const PROP_RADIUS_FRACTION = 0.19

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
    heading: spring(HEADING_AT_CAMERA),
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
    const targetY = routeY * halfH * (1 - turning) + (bob + wanderY) * (1 - turning)
    const targetZ = -PLANE_DEPTH + (PLANE_DEPTH + FINALE_PASS_Z) * approach

    if (!settled.current) {
      snapSpring(s.x, targetX)
      snapSpring(s.y, targetY)
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
    const propRadius = model.span * PROP_RADIUS_FRACTION * scale.current * finale.current.grow
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
          radius={model.span * PROP_RADIUS_FRACTION}
          z={-model.noseOffset * 0.99}
          finale={finale}
        />
      </group>
    </group>
  )
}
