import { useSyncExternalStore } from 'react'
import { getRevealVersion, isRevealed, subscribeReveal } from '../flight/store'
import { useReducedMotion } from './useReducedMotion'

/**
 * Whether the aircraft has flown past this section yet.
 *
 * The store decides — it already knows the progress at which each section is
 * passed — so React renders once per reveal rather than once per frame. Under
 * reduced motion there is no fly-past to wait for and the answer is always yes;
 * the CSS drops the transition to match, so the content is simply there.
 */
export function useSectionReveal(section: number): boolean {
  const reduced = useReducedMotion()
  useSyncExternalStore(subscribeReveal, getRevealVersion, () => 0)
  return reduced || isRevealed(section)
}
