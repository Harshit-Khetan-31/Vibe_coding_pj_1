/**
 * The runway, ported from `docs/loader-reference.html`.
 *
 * This is the reference's `draw()` moved into a module and typed, and as
 * little else as could be got away with: the same projection, the same light
 * sequence, the same tremor, the same cloud deck, the same names. What has gone
 * is what the app already owns — the reference's own HUD (the real `<Hud>` does
 * that), its painted sky (the real 3D scene is underneath) and its 2D aircraft
 * (the real one flies in, see `state.entry` in `Plane.tsx`).
 *
 * Everything it needs per frame arrives in a `RunwayState`; nothing here reads
 * layout, touches the DOM outside its own canvas, or knows that React exists.
 */

export type RunwayPhase = 'load' | 'hold' | 'hand' | 'done'

export type RunwayState = {
  /** wall clock since the loader started, seconds */
  T: number
  /** load progress, 0–100 */
  p: number
  phase: RunwayPhase
  /** 0–1 through the takeoff roll */
  hand: number
  /** 4 while the visitor has skipped, 1 otherwise */
  speedup: number
}

/** What the takeoff looks like this frame, for the caller's instruments. */
export type RunwayView = { u: number; roll: number; pitch: number }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

type RGB = [number, number, number]
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// real runway light colours
const WHITE: RGB = [255, 238, 212]
const AMBER: RGB = [255, 186, 84]
const RED: RGB = [255, 76, 64]
const GREEN: RGB = [96, 232, 150]
const INK: RGB = [236, 234, 228]

/* ---------- scene data ---------- */
const N = 28 // edge-light rows
const HW = 1.6 // runway half width
const Z0 = 1.3 // threshold distance

type Star = { x: number; y: number; r: number; a: number; ph: number }
type Town = { x: number; h: number; a: number; ph: number; c: RGB }
type Puff = { x: number; y: number; z: number; s: number }

/** The site caps device pixel ratio at 1.75 everywhere; so does this. */
const MAX_DPR = 1.75

export function createRunway(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) return null

  let W = 0
  let H = 0
  let DPR = 1

  let stars: Star[] = []
  let town: Town[] = []
  let puffs: Puff[] = []

  // pointer: the whole view leans a few pixels toward the cursor, nearer
  // things more. Smoothed here, in the draw loop, exactly as in the reference.
  let px = 0
  let py = 0
  let tpx = 0
  let tpy = 0

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, MAX_DPR)
    W = innerWidth
    H = innerHeight
    canvas.width = Math.round(W * DPR)
    canvas.height = Math.round(H * DPR)
    ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
  }

  function seed() {
    let s = 11
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    stars = Array.from({ length: 80 }, () => ({
      x: rnd(),
      y: rnd(),
      r: rnd() * 0.9 + 0.3,
      a: rnd() * 0.3 + 0.06,
      ph: rnd() * 6,
    }))
    town = Array.from({ length: 60 }, () => {
      let x: number
      do {
        x = rnd()
      } while (Math.abs(x - 0.5) < 0.08)
      return { x, h: rnd() * 3, a: rnd() * 0.45 + 0.12, ph: rnd() * 6, c: rnd() < 0.75 ? AMBER : WHITE }
    })
    puffs = Array.from({ length: 9 }, (_, i) => ({
      x: (rnd() - 0.5) * 1.8,
      y: (rnd() - 0.5) * 0.9,
      z: 0.3 + i * 0.2,
      s: rnd() * 0.6 + 0.75,
    }))
  }

  function setPointer(nx: number, ny: number) {
    tpx = nx
    tpy = ny
  }

  function clear() {
    ctx!.clearRect(0, 0, W, H)
  }

  /** Fill the whole canvas with the loader's own night, and nothing else. */
  function fill() {
    ctx!.fillStyle = '#070708'
    ctx!.fillRect(0, 0, W, H)
  }

  /* ---------- one frame ---------- */
  function draw(dt: number, st: RunwayState): RunwayView {
    const c = ctx!
    const { phase, hand, speedup } = st
    const T = st.T
    const pn = st.p / 100
    const u = phase === 'hand' || phase === 'done' ? clamp(hand, 0, 1) : 0
    px += (tpx - px) * (1 - Math.exp(-dt / 0.35))
    py += (tpy - py) * (1 - Math.exp(-dt / 0.35))
    const roll = clamp(u / 0.55, 0, 1)
    const camZ = 12 * Math.pow(roll, 2.4)
    const pitch = ease(sstep(0.42, 0.82, u))
    const dark = 1 - pitch
    // engine run-up: a faint tremor that grows with the load, then real
    // vibration on the roll
    const tremor =
      (phase === 'load' ? 0.25 * pn : phase === 'hold' ? 0.5 : 0) +
      (phase === 'hand' ? 1.6 * roll * (1 - pitch) : 0)
    const sh = Math.sin(T * 71) * tremor
    const sv = Math.cos(T * 57) * tremor * 0.6
    const f = Math.min(H * 0.46, W * 0.55)
    const y0 = H * 0.46 + H * 1.08 * pitch - py * H * 0.012 + sv
    const cx = W / 2 - px * W * 0.018 + sh
    c.fillStyle = `rgba(7,7,8,${dark})`
    c.fillRect(0, 0, W, H)
    const proj = (x: number, z: number): [number, number, number] => {
      const sc = f / z
      return [cx + x * sc, y0 + sc, sc]
    }

    if (dark > 0.01) {
      // stars and the town strung along the horizon (distant: they barely move
      // with the pointer)
      for (const s of stars) {
        const a = s.a * (0.7 + 0.3 * Math.sin(T * 1.6 + s.ph)) * dark
        c.fillStyle = rgba(INK, a)
        c.fillRect(s.x * W + px * 4, y0 - 12 - s.y * y0 * 0.9, s.r, s.r)
      }
      for (const t of town) {
        const a = t.a * (0.7 + 0.3 * Math.sin(T * 2.6 + t.ph)) * dark
        c.fillStyle = rgba(t.c, a)
        c.fillRect(t.x * W - px * W * 0.006, y0 - 1.5 - t.h, 1.3, 1.3)
      }
      const hg = c.createLinearGradient(0, y0 - 50, 0, y0 + 6)
      hg.addColorStop(0, 'rgba(255,170,90,0)')
      hg.addColorStop(1, `rgba(255,170,90,${0.08 * dark})`)
      c.fillStyle = hg
      c.fillRect(0, y0 - 50, W, 56)
      // airport beacon: alternating green and white, the way real ones rotate
      {
        const bx = W * 0.17 - px * W * 0.006
        const by = y0 - 7
        const ph = (T % 2) / 2
        const a = Math.exp(-Math.pow((ph % 0.5) - 0.03, 2) / 0.0012) * dark
        const col = ph < 0.5 ? GREEN : WHITE
        const g = c.createRadialGradient(bx, by, 0, bx, by, 16)
        g.addColorStop(0, rgba(col, 0.8 * a))
        g.addColorStop(1, rgba(col, 0))
        c.fillStyle = g
        c.fillRect(bx - 16, by - 16, 32, 32)
        c.fillStyle = rgba(INK, 0.35 * dark)
        c.fillRect(bx - 0.5, by, 1, 6)
      }
      // runway surface
      const zf = Z0 + N + 0.5
      const [nlx, nly] = proj(-HW * 1.06, 0.32)
      const [nrx] = proj(HW * 1.06, 0.32)
      const [flx, fly] = proj(-HW * 1.06, zf)
      const [frx] = proj(HW * 1.06, zf)
      const sg = c.createLinearGradient(0, fly, 0, H)
      sg.addColorStop(0, 'rgba(236,234,228,0)')
      sg.addColorStop(1, `rgba(236,234,228,${0.03 * dark})`)
      c.fillStyle = sg
      c.beginPath()
      c.moveTo(nlx, nly)
      c.lineTo(flx, fly)
      c.lineTo(frx, fly)
      c.lineTo(nrx, nly)
      c.closePath()
      c.fill()
      const quad = (x0: number, x1: number, z0: number, z1: number, a: number) => {
        if (z1 <= 0.32) return
        z0 = Math.max(z0, 0.32)
        const [a1, b1] = proj(x0, z0)
        const [a2] = proj(x1, z0)
        const [a3, b3] = proj(x0, z1)
        const [a4] = proj(x1, z1)
        c.fillStyle = rgba(INK, a)
        c.beginPath()
        c.moveTo(a1, b1)
        c.lineTo(a2, b1)
        c.lineTo(a4, b3)
        c.lineTo(a3, b3)
        c.closePath()
        c.fill()
      }
      for (let i = 0; i < 6; i++) {
        const w = 0.17
        const g = 0.07
        const x = HW * 0.93 - i * (w + g)
        quad(x - w, x, Z0 + 0.3 - camZ, Z0 + 1.35 - camZ, 0.07 * dark)
        quad(-x, -x + w, Z0 + 0.3 - camZ, Z0 + 1.35 - camZ, 0.07 * dark)
      }
      {
        const za = Z0 + 1.75 - camZ
        const zb = Z0 + 3.7 - camZ
        if (za > 0.4) {
          const [, yb] = proj(0, za)
          const [, ya] = proj(0, zb)
          const scm = f / ((za + zb) / 2)
          // digits painted either side of the centreline, like real runway
          // markings
          for (const [d, x] of [
            ['1', -0.3],
            ['1', 0.3],
          ] as [string, number][]) {
            c.save()
            c.translate(cx + x * scm, yb)
            c.scale(scm * 0.012, (yb - ya) / 100)
            c.fillStyle = rgba(INK, 0.085 * dark)
            c.font = "800 100px 'Big Shoulders Display', sans-serif"
            c.textAlign = 'center'
            c.textBaseline = 'bottom'
            c.fillText(d, 0, 4)
            c.restore()
          }
        }
      }
      for (let z = Z0 + 4.3; z < zf; z += 1.1) quad(-0.028, 0.028, z - camZ, z + 0.55 - camZ, 0.07 * dark)
    }

    // lights. Sequence: threshold first, then outward; the red end bar lights
    // last, at 100%.
    const front = pn * (N + 1)
    const pulse = ((T * 0.9) % 1.1) * Math.max(front, 1)
    const vel = phase === 'hand' && roll < 1 ? 26 * Math.pow(roll, 1.4) * dt * speedup : 0
    const light = (x: number, z: number, col: RGB, sz: number, lit: number, i: number) => {
      if (z < 0.32 || (lit <= 0 && dark < 0.01)) return
      const [lx, ly, sc] = proj(x, z)
      if (ly > H + 60 || lx < -60 || lx > W + 60) return
      const rad = Math.max(0.8, 0.03 * sc * sz)
      c.fillStyle = `rgba(236,234,228,${0.1 * dark})`
      c.beginPath()
      c.arc(lx, ly, rad * 0.65, 0, 7)
      c.fill()
      if (lit <= 0) return
      const boost = phase === 'load' ? Math.exp(-Math.pow(i - pulse, 2) / 1.4) * 0.55 : 0
      const a = lit * (1 - pitch * 0.93) * (0.82 + boost)
      if (vel > 0) {
        const [qx, qy] = proj(x, z + vel)
        c.strokeStyle = rgba(col, 0.4 * a)
        c.lineWidth = rad * 1.25
        c.lineCap = 'round'
        c.beginPath()
        c.moveTo(qx, qy)
        c.lineTo(lx, ly)
        c.stroke()
      }
      const g = c.createRadialGradient(lx, ly, 0, lx, ly, rad * 3.8)
      g.addColorStop(0, rgba(col, 0.5 * a))
      g.addColorStop(1, rgba(col, 0))
      c.fillStyle = g
      c.fillRect(lx - rad * 3.8, ly - rad * 3.8, rad * 7.6, rad * 7.6)
      c.fillStyle = rgba(col, Math.min(1, a))
      c.beginPath()
      c.arc(lx, ly, rad, 0, 7)
      c.fill()
    }
    for (let i = 0; i < N; i++) {
      const z = Z0 + i - camZ
      const lit = clamp(front - i, 0, 1)
      if (i === 0) {
        for (const x of [-HW, -HW * 0.7, -HW * 0.4, HW * 0.4, HW * 0.7, HW]) light(x, z, GREEN, 0.8, lit, i)
        continue
      }
      // edge lights turn amber for the last stretch of runway: the caution zone
      const col = i >= N - 8 ? AMBER : WHITE
      light(-HW, z, col, 1, lit, i)
      light(HW, z, col, 1, lit, i)
      // centreline every half row: white, then red/white alternating, then red
      for (const h of [0, 0.5]) {
        const cc2 = (i + h) * 2
        const rem = 2 * N - cc2
        const cc = rem <= 6 ? RED : rem <= 14 ? (Math.round(cc2) % 2 ? RED : WHITE) : WHITE
        light(0, z + h, cc, 0.5, clamp(front - i - h, 0, 1), i)
      }
    }
    {
      const z = Z0 + N - camZ
      const lit = clamp(front - N, 0, 1)
      for (const x of [-HW, -HW * 0.66, -HW * 0.33, HW * 0.33, HW * 0.66, HW]) light(x, z, RED, 0.9, lit, N)
    }

    // the cloud deck, on the way up
    const cloud = sstep(0.5, 0.68, u) * (1 - sstep(0.74, 0.95, u))
    if (cloud > 0) {
      const cz = (u - 0.5) * 3.4
      for (const q of puffs) {
        const z = q.z - cz + 0.95
        if (z <= 0.05 || z > 2.2) continue
        const sc = 1 / z
        const r = Math.min(W, H) * 0.55 * q.s * sc
        const qx = W / 2 + q.x * W * 0.5 * sc - px * 20 * sc
        const qy = H / 2 + q.y * H * 0.5 * sc
        const a = cloud * sstep(2.2, 1.3, z) * sstep(0.05, 0.35, z) * 0.6
        const g = c.createRadialGradient(qx, qy, 0, qx, qy, r)
        g.addColorStop(0, `rgba(250,218,192,${a})`)
        g.addColorStop(1, 'rgba(250,218,192,0)')
        c.fillStyle = g
        c.fillRect(qx - r, qy - r, r * 2, r * 2)
      }
    }

    // soft vignette keeps the eye centred on the runway
    if (dark > 0.01) {
      const vg = c.createRadialGradient(
        W / 2,
        H * 0.55,
        Math.min(W, H) * 0.3,
        W / 2,
        H * 0.55,
        Math.max(W, H) * 0.75,
      )
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, `rgba(0,0,0,${0.5 * dark})`)
      c.fillStyle = vg
      c.fillRect(0, 0, W, H)
    }
    return { u, roll, pitch }
  }

  return { resize, seed, draw, setPointer, clear, fill }
}

export type Runway = NonNullable<ReturnType<typeof createRunway>>

/** `lerp` is part of the port's vocabulary; the loader uses it too. */
export { clamp, lerp, sstep, ease }
