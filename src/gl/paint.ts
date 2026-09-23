import {
  Box3,
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from 'three'

/**
 * Painting the aircraft: the two things that have to be measured before a decal
 * can be projected — the text, and the airframe it goes on.
 *
 * Nothing here knows about React. `Livery.tsx` turns the numbers below into
 * decal boxes.
 */

/* ---- the text ------------------------------------------------------------ */

export type TextTexture = { texture: CanvasTexture; aspect: number }

const FONT_STACK = '"Big Shoulders Display", "Arial Narrow", sans-serif'
const FONT_PX = 256

/**
 * A transparent canvas with one line of display type on it, drawn glyph by
 * glyph so the tracking is identical in every browser (`ctx.letterSpacing` is
 * still not everywhere). Returns its aspect ratio too — the decal box is sized
 * from the text rather than the text squeezed into a fixed box.
 */
export function drawTextTexture(
  text: string,
  ink: string,
  { weight = 700, tracking = 0.06, padding = 0.18 } = {},
): TextTexture {
  const font = `${weight} ${FONT_PX}px ${FONT_STACK}`
  const gap = FONT_PX * tracking

  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('livery: no 2d context')
  probe.font = font

  const glyphs = [...text]
  const widths = glyphs.map((g) => probe.measureText(g).width)
  const textWidth = widths.reduce((a, b) => a + b, 0) + gap * (glyphs.length - 1)

  const padY = FONT_PX * padding
  const width = Math.ceil(textWidth + padY)
  const height = Math.ceil(FONT_PX * (1 + padding))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('livery: no 2d context')

  ctx.clearRect(0, 0, width, height)
  ctx.font = font
  ctx.fillStyle = ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  let x = (width - textWidth) / 2
  for (let i = 0; i < glyphs.length; i++) {
    ctx.fillText(glyphs[i], x, height / 2)
    x += widths[i] + gap
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true

  return { texture, aspect: width / height }
}

/* ---- the airframe -------------------------------------------------------- */

export type Mark = {
  /** the right-hand decal box; the left one mirrors Y */
  position: [number, number, number]
  /** box size: text width, text height, projection depth */
  scale: [number, number, number]
}

export type Airframe = { title: Mark; registration: Mark }

export type LiveryPlan = {
  titleAspect: number
  titleStation: number
  titleHeight: number
  registrationAspect: number
  registrationStation: number
  registrationHeight: number
}

/** The box reaches from the centreline out past the skin — see measureAirframe. */
const REACH = 1.25

/**
 * The airframe mesh arrives as one lump of 14k vertices with no part names, so
 * the fuselage has to be found rather than looked up.
 *
 * In this model's local space +X runs nose→tail, ±Y is the span and +Z is up
 * (the glTF node carries the −90° X that makes it Y-up). Binning the vertices
 * along X gives a width profile: the bins that blow out to most of the
 * half-span *are* the wing, and the run of bins at the back that are suddenly
 * tall *is* the empennage. The title goes in the bay between them; the
 * registration goes on the fin above the tailplane.
 *
 * Every decal box runs from the centreline (y = 0) out past the skin, never
 * across it. That is what keeps the projection on the near side only: the far
 * skin lives at negative Y, outside the box, so it cannot pick up a mirrored
 * copy of the text.
 *
 * Returns null if the model does not look like an aeroplane laid out this way,
 * in which case it simply stays unpainted — better than lettering a wing.
 */
export function measureAirframe(geometry: BufferGeometry, plan: LiveryPlan): Airframe | null {
  const position = geometry.getAttribute('position')
  if (!position) return null

  geometry.computeBoundingBox()
  const box = geometry.boundingBox ?? new Box3()
  const size = box.getSize(new Vector3())

  // span longest, then length, then height — anything else is a model this
  // function was not written for
  if (!(size.y >= size.x && size.x > size.z && size.z > 0)) return null

  const length = size.x
  const halfSpan = size.y / 2
  const BINS = 28
  const NARROW = 0.3 // beyond this fraction of the half-span it is not fuselage

  const maxAbsY = new Float32Array(BINS)
  const zLow = new Float32Array(BINS).fill(Infinity)
  const zHigh = new Float32Array(BINS).fill(-Infinity)

  const binOf = (x: number) =>
    Math.min(BINS - 1, Math.max(0, Math.floor(((x - box.min.x) / length) * BINS)))

  for (let i = 0; i < position.count; i++) {
    const b = binOf(position.getX(i))
    const ay = Math.abs(position.getY(i))
    if (ay > maxAbsY[b]) maxAbsY[b] = ay
    if (ay < NARROW * halfSpan) {
      const z = position.getZ(i)
      if (z < zLow[b]) zLow[b] = z
      if (z > zHigh[b]) zHigh[b] = z
    }
  }

  /**
   * Everything in a slab of fuselage: how far out the skin reaches, and how
   * deep the body is there. Read straight off the vertices rather than off the
   * bins, because the rear fuselage of this model is a handful of very long
   * triangles and whole bins of it are empty.
   */
  const slab = (centre: number, halfBand: number, minZ = -Infinity) => {
    let halfWidth = 0
    let low = Infinity
    let high = -Infinity
    let count = 0
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i)
      if (x < centre - halfBand || x > centre + halfBand) continue
      const ay = Math.abs(position.getY(i))
      if (ay >= NARROW * halfSpan) continue
      const z = position.getZ(i)
      if (z < minZ) continue
      count++
      if (ay > halfWidth) halfWidth = ay
      if (z < low) low = z
      if (z > high) high = z
    }
    if (!count) return { halfWidth: size.z * 0.2, low: box.min.z, high: box.max.z }
    return { halfWidth, low, high }
  }

  /* the bay between the wing and the tail ---------------------------------- */
  let wingEnd = box.min.x + length * 0.4
  for (let b = 0; b < BINS; b++) {
    if (maxAbsY[b] > halfSpan * 0.5) wingEnd = box.min.x + ((b + 1) / BINS) * length
  }

  let tailStart = box.min.x + length * 0.85
  for (let b = BINS - 1; b >= 0; b--) {
    const tall = zHigh[b] > box.max.z * 0.5
    const wide = maxAbsY[b] > halfSpan * 0.25
    if (!tall && !wide) break
    tailStart = box.min.x + (b / BINS) * length
  }
  if (tailStart <= wingEnd + length * 0.1) tailStart = wingEnd + length * 0.1

  /* the title, along the flat of the rear fuselage -------------------------- */
  const bay = tailStart - wingEnd
  const titleRoom = bay * 0.86
  const probe = slab(wingEnd + bay * plan.titleStation, length * 0.06)

  let titleH = (probe.high - probe.low) * plan.titleHeight
  const titleW = Math.min(titleH * plan.titleAspect, titleRoom)
  titleH = titleW / plan.titleAspect

  const titleX = Math.min(
    Math.max(wingEnd + bay * plan.titleStation, wingEnd + titleW / 2),
    tailStart - titleW / 2,
  )
  const body = slab(titleX, titleW / 2)
  const titleReach = body.halfWidth * REACH

  const title: Mark = {
    position: [titleX, titleReach / 2, body.low + (body.high - body.low) * 0.62],
    scale: [titleW, titleH, titleReach],
  }

  /* the registration, on the fin ------------------------------------------- */
  const regX = box.min.x + plan.registrationStation * length
  const empennage = slab(regX, length * 0.05)
  // the fin is whatever is above the tailplane at this station
  const split = empennage.low + (empennage.high - empennage.low) * 0.55
  const finDepth = empennage.high - split

  let regH = finDepth * plan.registrationHeight
  const regW = Math.min(regH * plan.registrationAspect, length * 0.16)
  regH = regW / plan.registrationAspect

  const fin = slab(regX, regW / 2, split)
  const finReach = fin.halfWidth * REACH * 1.4 // a fin is thin; be generous

  const registration: Mark = {
    position: [regX, finReach / 2, split + finDepth * 0.5],
    scale: [regW, regH, finReach],
  }

  return { title, registration }
}

/* ---- the fallback panel -------------------------------------------------- */

/**
 * If a decal cannot be projected, the text goes on a panel instead — bowed
 * along its length so it still follows the barrel of the fuselage rather than
 * hovering flat beside it.
 */
export function curvedPanel(width: number, height: number, bulge: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height, 16, 1)
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / (width / 2)
    position.setZ(i, -bulge * u * u)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}
