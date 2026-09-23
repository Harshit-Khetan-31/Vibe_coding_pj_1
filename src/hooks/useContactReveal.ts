import { useSyncExternalStore } from 'react'
import { isContactRevealed, subscribeContactReveal } from '../flight/store'
import { hasWebGL } from '../gl/webgl'
import { useReducedMotion } from './useReducedMotion'

/**
 * CONTACT's own reveal signal. Unlike `useSectionReveal`, this is not sticky —
 * it tracks the propeller disc's live on-screen size (see `Plane.tsx` and
 * `store.ts`), so it plays forward as the disc fills the screen in the finale
 * close-up and reverses cleanly if the visitor scrolls back up through it.
 *
 * With no WebGL there is no propeller to key off, so CONTACT falls back to
 * always-revealed — the same treatment reduced motion gets.
 */
export function useContactReveal(): boolean {
  const reduced = useReducedMotion()
  useSyncExternalStore(subscribeContactReveal, isContactRevealed, () => false)
  return reduced || !hasWebGL() || isContactRevealed()
}
