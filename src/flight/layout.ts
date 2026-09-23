import { SECTION_IDS, type SectionId } from './profile'

/**
 * The bridge between the DOM and the flight.
 *
 * Since Phase 2A there is no drawn route, so this no longer measures lanes or
 * corridors — only where each section actually sits in the document, which is
 * what turns a scroll position into a phase, a section and an instrument value.
 */

export type SectionBox = { id: SectionId; top: number; height: number }

export type Layout = {
  width: number
  viewport: number
  docHeight: number
  /** the scrollable range, px — the denominator of `progress` */
  limit: number
  sections: SectionBox[]
  signature: string
}

/** Equal division fallback for the first paint, before the sections exist. */
function fallbackSections(docHeight: number): SectionBox[] {
  const h = docHeight / SECTION_IDS.length
  return SECTION_IDS.map((id, i) => ({ id, top: i * h, height: h }))
}

export function measureLayout(): Layout {
  const root = document.documentElement
  const width = root.clientWidth
  const viewport = window.innerHeight
  const scrollY = window.scrollY

  const boxes: SectionBox[] = []
  for (const id of SECTION_IDS) {
    const el = document.getElementById(id)
    if (!el) break
    const rect = el.getBoundingClientRect()
    boxes.push({ id, top: rect.top + scrollY, height: rect.height })
  }

  const complete = boxes.length === SECTION_IDS.length
  const last = complete ? boxes[boxes.length - 1] : null
  const docHeight = Math.max(last ? last.top + last.height : root.scrollHeight, viewport)
  const sections = complete ? boxes : fallbackSections(docHeight)

  return {
    width,
    viewport,
    docHeight,
    limit: Math.max(1, docHeight - viewport),
    sections,
    signature: [
      Math.round(width),
      Math.round(viewport),
      Math.round(docHeight),
      sections.map((s) => `${Math.round(s.top)}:${Math.round(s.height)}`).join(','),
    ].join('|'),
  }
}

/** Anchor → document y. */
export function anchorY(layout: Layout, s: number, u: number): number {
  const box = layout.sections[Math.max(0, Math.min(layout.sections.length - 1, s))]
  return box.top + u * box.height
}

/**
 * Anchor → scroll progress, 0–1.
 *
 * An anchor is "reached" when it crosses the middle of the viewport, which is
 * the same rule `useActiveSection` uses — so the HUD and the DOM can never
 * disagree about which section you are in.
 */
export function anchorProgress(layout: Layout, s: number, u: number): number {
  const y = anchorY(layout, s, u) - layout.viewport / 2
  return Math.min(1, Math.max(0, y / layout.limit))
}
