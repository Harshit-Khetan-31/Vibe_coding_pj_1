import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, Group, MathUtils, Mesh, Quaternion, Vector3, type Object3D } from 'three'
import { setAttitude, state } from '../flight/store'
import { zoneFor } from './zones'
import { clamp, noise, snapSpring, spring, stepSpring } from './spring'
import {
  BOB_AMPLITUDE,
  BOB_RATE,
  FOV,
  MOBILE_MAX_WIDTH,
  MODEL_NOSE_AXIS,
  MODEL_URL,
  OMEGA_PITCH,
  OMEGA_ROLL,
  OMEGA_YAW,
  OMEGA_ZONE_X,
  OMEGA_ZONE_Y,
  PITCH_MAX,
  PITCH_PER_VELOCITY,
  PITCH_PER_VERTICAL,
  PLANE_DEPTH,
  PROP_IDLE_RPS,
  PROP_MAX_RPS,
  ROLL_MAX,
  ROLL_PER_LATERAL,
  ROLL_PER_POINTER,
  SPAN_FRACTION_DESKTOP,
  SPAN_FRACTION_MOBILE,
  WANDER_AMPLITUDE,
  WANDER_PITCH,
  WANDER_ROLL,
  YAW_PER_ROLL,
} from './config'

/**
 * The aircraft, and the flight model that moves it.
 *
 * There is no path and no keyframe anywhere below. The store says how far down
 * the page you are and how fast you are going; the section says which side of
 * the screen the text is on; everything else falls out of four critically
 * damped springs (lateral, vertical, roll, pitch) plus a yaw that follows the
 * roll. Because the springs are unconditionally stable and always chase a
 * *target* rather than being driven directly, a fast flick or a reversed scroll
 * can only ever make the aircraft glide harder — it cannot snap.
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

  object.traverse((child) => {
    if ((child as Mesh).isMesh) {
      child.castShadow = false
      child.receiveShadow = false
    }
  })

  return { object, span: Math.max(size.x, 1e-3), noseOffset: size.z / 2 }
}

function Propeller({ radius, z }: { radius: number; z: number }) {
  const ref = useRef<Group>(null)

  useFrame((_, dt) => {
    if (!ref.current) return
    const rps = PROP_IDLE_RPS + (PROP_MAX_RPS - PROP_IDLE_RPS) * state.throttle
    ref.current.rotation.z += rps * Math.PI * 2 * dt
  })

  // A spinning prop reads as a translucent disc, not as blades — so that is
  // what this is: a disc whose rotation is visible only through the hub streak.
  return (
    <group ref={ref} position={[0, 0, z]}>
      <mesh>
        <circleGeometry args={[radius, 28]} />
        <meshBasicMaterial color="#f6dcc4" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[radius * 2, radius * 0.06]} />
        <meshBasicMaterial color="#ffe9d2" transparent opacity={0.22} depthWrite={false} />
      </mesh>
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
    roll: spring(0),
    pitch: spring(0),
    yaw: spring(0),
  })
  const settled = useRef(false)
  const scale = useRef(1)

  // size, not camera.aspect: a resize updates this before the camera, and the
  // zone and the scale both have to move in the same frame or the aircraft
  // visibly jumps mid-drag
  const size = useThree((s) => s.size)

  useFrame(({ clock }, delta) => {
    const group = rig.current
    if (!group) return
    // a resumed tab hands rAF one huge delta; the springs are stable under it,
    // but clamping keeps the noise terms from jumping a whole cycle
    const dt = clamp(delta, 1 / 240, 1 / 20)
    const t = clock.elapsedTime
    const s = springs.current

    /* viewport, in world units at the aircraft's depth --------------------- */
    const halfH = Math.tan(MathUtils.degToRad(FOV) / 2) * PLANE_DEPTH
    const halfW = halfH * (size.width / Math.max(size.height, 1))

    /* scale: wingspan as a fixed fraction of viewport width ---------------- */
    const mobile = size.width <= MOBILE_MAX_WIDTH
    const fraction = mobile ? SPAN_FRACTION_MOBILE : SPAN_FRACTION_DESKTOP
    scale.current = (fraction * halfW * 2) / model.span
    scaler.current?.scale.setScalar(scale.current)

    /* target zone ----------------------------------------------------------- */
    const zone = zoneFor(state.sectionIndex, size.width)
    const turb = state.turbulence
    const calm = 0.3 + 0.7 * state.idle
    const wander = 0.25 + turb

    const bob = Math.sin(t * BOB_RATE * Math.PI * 2) * BOB_AMPLITUDE * calm * (halfH / 10)
    const wanderX = noise(t, 1.7) * WANDER_AMPLITUDE * wander * (halfW / 14)
    const wanderY = noise(t, 5.9) * WANDER_AMPLITUDE * 0.7 * wander * (halfH / 10)

    const targetX = zone.x * halfW + wanderX
    const targetY = zone.y * halfH + bob + wanderY

    if (!settled.current) {
      snapSpring(s.x, targetX)
      snapSpring(s.y, targetY)
      settled.current = true
    }

    const x = stepSpring(s.x, targetX, OMEGA_ZONE_X, dt)
    const y = stepSpring(s.y, targetY, OMEGA_ZONE_Y, dt)
    group.position.set(x, y, -PLANE_DEPTH)

    /* coordinated turn: roll leads, yaw follows ----------------------------- */
    // roll comes from how fast the aircraft is actually moving sideways, not
    // from the target — so it banks into the move and levels out as it arrives
    const lateral = s.x.velocity / Math.max(halfW / 10, 1e-3)
    const manoeuvring = clamp(Math.abs(lateral) * 0.5, 0, 1)
    let rollTarget = clamp(-lateral * ROLL_PER_LATERAL, -ROLL_MAX, ROLL_MAX)
    rollTarget += -state.pointerX * ROLL_PER_POINTER * (1 - manoeuvring)
    rollTarget += noise(t, 3.1) * WANDER_ROLL * wander

    const roll = stepSpring(s.roll, rollTarget, OMEGA_ROLL, dt)
    const yaw = stepSpring(s.yaw, roll * YAW_PER_ROLL, OMEGA_YAW, dt)

    /* pitch: nose up on fast scroll, then settles --------------------------- */
    let pitchTarget = clamp(state.velocity * PITCH_PER_VELOCITY, -PITCH_MAX, PITCH_MAX)
    pitchTarget += clamp(
      (s.y.velocity / Math.max(halfH / 10, 1e-3)) * PITCH_PER_VERTICAL,
      -PITCH_MAX,
      PITCH_MAX,
    )
    pitchTarget += noise(t, 8.4) * WANDER_PITCH * wander
    const pitch = stepSpring(s.pitch, pitchTarget, OMEGA_PITCH, dt)

    group.rotation.set(pitch, yaw, roll)

    // the instruments read the aircraft, not a second simulation of it
    setAttitude(-MathUtils.radToDeg(yaw), roll)
  })

  return (
    <group ref={rig}>
      <group ref={scaler}>
        <primitive object={model.object} />
        <Propeller radius={model.span * 0.19} z={-model.noseOffset * 0.99} />
      </group>
    </group>
  )
}
