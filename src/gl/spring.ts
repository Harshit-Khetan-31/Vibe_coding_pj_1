/**
 * Critically damped springs — the only way anything moves in the 3D layer.
 *
 * The integrator is the implicit (backward Euler) form, which is unconditionally
 * stable: the spring cannot overshoot or explode no matter how large `dt` is or
 * how far the target jumps. That is the whole point — a fast flick, a reversed
 * scroll or a resumed background tab moves the target a long way in one frame,
 * and an explicit integrator would snap or ring. This one just glides.
 *
 * `omega` is the angular frequency in rad/s; think of it as 1/settling-time.
 * Higher = tighter and more responsive, lower = heavier and more inert.
 */

export type Spring = { value: number; velocity: number }

export function spring(value = 0): Spring {
  return { value, velocity: 0 }
}

export function stepSpring(s: Spring, target: number, omega: number, dt: number): number {
  const f = 1 + 2 * dt * omega
  const oo = omega * omega
  const hoo = dt * oo
  const hhoo = dt * hoo
  const detInv = 1 / (f + hhoo)
  const detX = f * s.value + dt * s.velocity + hhoo * target
  const detV = s.velocity + hoo * (target - s.value)
  s.value = detX * detInv
  s.velocity = detV * detInv
  return s.value
}

/** Drop a spring onto a value with no motion — used on the first resolved frame. */
export function snapSpring(s: Spring, value: number) {
  s.value = value
  s.velocity = 0
}

/**
 * Cheap deterministic noise: three incommensurate sines, no allocation, no
 * table. Reads as low-frequency wander rather than white noise, which is what
 * light turbulence actually looks like.
 */
export function noise(t: number, seed: number): number {
  return (
    Math.sin(t * 0.73 + seed) * 0.55 +
    Math.sin(t * 1.31 + seed * 2.7) * 0.3 +
    Math.sin(t * 2.17 + seed * 5.1) * 0.15
  )
}

/**
 * A sign with hysteresis, which is how the flight model decides that a reversal
 * is real rather than a twitch.
 *
 * The input has to exceed `threshold` *and* hold the opposite sign for `dwell`
 * seconds before the committed sign changes. Anything smaller, or anything that
 * flickers, leaves the gate exactly where it was — so trackpad inertia, a
 * bounced wheel tick or the last pixel of a smooth-scroll settle can never
 * order the aircraft to turn around.
 */
export type Gate = { sign: number; pending: number; held: number }

export function gate(sign = 1): Gate {
  return { sign, pending: 0, held: 0 }
}

export function stepGate(
  g: Gate,
  value: number,
  threshold: number,
  dwell: number,
  dt: number,
): number {
  const sign = value > threshold ? 1 : value < -threshold ? -1 : 0
  if (sign === 0 || sign === g.sign) {
    g.pending = 0
    g.held = 0
    return g.sign
  }
  if (sign === g.pending) {
    g.held += dt
  } else {
    g.pending = sign
    g.held = 0
  }
  if (g.held >= dwell) {
    g.sign = sign
    g.pending = 0
    g.held = 0
  }
  return g.sign
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
