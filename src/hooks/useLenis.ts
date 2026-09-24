import { useEffect } from 'react'
import Lenis from 'lenis'
import { resetClock, setReducedMotion, setScroll, tick } from '../flight/store'

/**
 * The one rAF loop in the app. Lenis smooths the scroll and hands the position
 * to the flight store; the store resolves a frame; subscribers write the DOM.
 * Touch and reduced motion skip Lenis and read native scroll instead.
 */
/**
 * The live instance, for the one caller that has to *drive* the scroll rather
 * than read it (Header's "Get in touch" jump). Null under reduced motion and
 * on touch, where Lenis is never constructed and native scrolling is in
 * charge — callers fall back to `window.scrollTo`.
 */
let instance: Lenis | null = null

export function getLenis(): Lenis | null {
  return instance
}

export function useLenis() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const touch = window.matchMedia('(hover: none)').matches
    setReducedMotion(reduced)

    const nativeLimit = () =>
      document.documentElement.scrollHeight - window.innerHeight

    let lenis: Lenis | null = null
    let onScroll: (() => void) | null = null

    if (reduced || touch) {
      onScroll = () => setScroll(window.scrollY, nativeLimit())
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onScroll, { passive: true })
      onScroll()
    } else {
      lenis = new Lenis({
        duration: 1.1,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        smoothWheel: true,
      })
      lenis.on('scroll', ({ scroll, limit }: { scroll: number; limit: number }) => {
        setScroll(scroll, limit)
      })
      setScroll(window.scrollY, nativeLimit())
    }
    instance = lenis

    let frame = 0
    const loop = (time: number) => {
      lenis?.raf(time)
      tick(time)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    // a hidden tab stops rAF; don't let the resumed frame's dt hit the springs
    const onVisibility = () => {
      if (!document.hidden) resetClock()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
      if (onScroll) {
        window.removeEventListener('scroll', onScroll)
        window.removeEventListener('resize', onScroll)
      }
      lenis?.destroy()
      instance = null
      resetClock()
    }
  }, [])
}
