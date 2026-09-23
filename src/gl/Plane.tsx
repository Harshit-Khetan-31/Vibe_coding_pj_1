import { useMemo, useRef } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, Euler, Group, MathUtils, Mesh, Quaternion, Vector3, type Object3D } from 'three'
import { getTrack, setAttitude, state } from '../flight/store'
import { Livery } from './Livery'
import { Propeller } from './Propeller'
import { clamp, noise, snapSpring, spring, stepSpring, type Gate, gate, stepGate } from './spring'
import {
  BOB_AMPLITUDE,
  BOB_RATE,
  FINALE_HIDE_Z,
  FINALE_PASS_END,
  FINALE_PASS_START,
  FINALE_PASS_Z,
  FINALE_PROP_GROW,
  FINALE_TURN_END,
  FOV,
  HEADING_AT_CAMERA,
  HEADING_AWAY,
  HEADING_LEFT,
  HEADING_RIGHT,
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
  PITCH_PER_VELOCITY,
  PITCH_PER_VERTICAL,
  PLANE_DEPTH,
  REVERSAL_DWELL,
  REVERSAL_SPEED,
  SCROLL_REVERSAL_SPEED,
  ROLL_MAX,
  ROLL_PER_POINTER,
  ROLL_PER_TURN,
  SPAN_FRACTION_DESKTOP,
  SPAN_FRACTION_MOBILE,
  WANDER_AMPLITUDE,
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
    heading: spring(HEADING_RIGHT),
  })
  /** The reversal gate: +1 travelling right, −1 travelling left. */
  const travel = useRef<Gate>(gate(1))
  /** Last frame's route position, and the smoothed rate derived from it. */
  const lastRouteX = useRef<number | null>(null)
  const routeRate = useRef(0)
  /** And on the scroll itself, which is what the finale's nose direction reads. */
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
    const spread = mobile ? ZONE_X_MOBILE : ZONE_X_DESKTOP
    const turb = state.turbulence
    const calm = 0.3 + 0.7 * state.idle
    const wander = 0.25 + turb

    const bob = Math.sin(t * BOB_RATE * Math.PI * 2) * BOB_AMPLITUDE * calm * (halfH / 10)
    const wanderX = noise(t, 1.7) * WANDER_AMPLITUDE * wander * (halfW / 14)
    const wanderY = noise(t, 5.9) * WANDER_AMPLITUDE * 0.7 * wander * (halfH / 10)

    const routeNormX = route.x(state.progress)
    const routeX = routeNormX * spread
    // on a phone the text is full width, so the aircraft separates itself by
    // climbing above it rather than by moving aside
    const routeY = mobile
      ? route.y(state.progress) * 0.5 + ZONE_Y_MOBILE_LIFT
      : route.y(state.progress)

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

    /* heading: which way is the aircraft actually going? --------------------- */
    // Direction comes from the *route*, not from the spring. The spring carries
    // idle bob and turbulence wander, whose velocity is the same order as a slow
    // crossing's — reading it would have the aircraft turning around on its own
    // while parked. The route is flat while parked, so its rate is exactly zero
    // and the only thing that can move it is the scroll.
    const previous = lastRouteX.current
    lastRouteX.current = routeNormX
    const raw = previous === null ? 0 : (routeNormX - previous) / dt
    routeRate.current += (raw - routeRate.current) * (1 - Math.exp(-dt / 0.1))

    // the gate is the anti-jitter rule on top of that: the rate has to clear a
    // speed *and* hold its sign for REVERSAL_DWELL before the aircraft commits
    // to turning around, so a trackpad bounce cannot start a U-turn
    const direction = stepGate(
      travel.current,
      routeRate.current,
      REVERSAL_SPEED,
      REVERSAL_DWELL,
      dt,
    )
    // the same rule, on the scroll itself: the finale only reverses on a
    // sustained upward scroll, never on the settle at the end of a flick
    const scrolling = stepGate(
      scroll.current,
      state.velocity,
      SCROLL_REVERSAL_SPEED,
      REVERSAL_DWELL,
      dt,
    )

    const psi = s.heading.value
    const cruise = nearestAngle(psi, direction > 0 ? HEADING_RIGHT : HEADING_LEFT)
    // forward through the finale it turns to face the camera; backing out of it
    // the aircraft is receding, so it has to be pointing away instead
    const finaleHeading = nearestAngle(
      psi,
      scrolling > 0 ? HEADING_AT_CAMERA : HEADING_AWAY,
    )
    const headingTarget = cruise + (finaleHeading - cruise) * turning
    const heading = stepSpring(s.heading, headingTarget, OMEGA_HEADING, dt)

    /* bank into the turn, and yaw is the turn itself ------------------------ */
    // the aircraft banks because it is *turning*, not because it is sliding
    // sideways — so the roll builds as the U-turn starts and levels as it ends
    let rollTarget = clamp(s.heading.velocity * ROLL_PER_TURN, -ROLL_MAX, ROLL_MAX)
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
    pitchTarget += noise(t, 8.4) * WANDER_PITCH * wander
    pitchTarget *= 1 - turning
    const pitch = stepSpring(s.pitch, pitchTarget, OMEGA_PITCH, dt)

    euler.current.set(pitch, heading, roll)
    group.rotation.copy(euler.current)

    /* what the propeller needs to know -------------------------------------- */
    finale.current.boost = turning
    finale.current.grow = 1 + FINALE_PROP_GROW * approach * approach

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
        <Propeller radius={model.span * 0.19} z={-model.noseOffset * 0.99} finale={finale} />
      </group>
    </group>
  )
}
