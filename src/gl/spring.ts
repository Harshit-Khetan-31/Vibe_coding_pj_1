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

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
