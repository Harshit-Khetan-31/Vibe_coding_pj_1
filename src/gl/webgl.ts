let cached: boolean | null = null

/**
 * One real context probe, cached. `!!window.WebGLRenderingContext` is not
 * enough — the constructor exists on machines where context creation is
 * blocked (blocklisted drivers, hardware acceleration off, too many contexts).
 */
export function hasWebGL(): boolean {
  if (cached !== null) return cached
  if (typeof window === 'undefined') return (cached = false)
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    cached = Boolean(gl)
    // release the probe context immediately; browsers cap how many exist
    if (gl && 'getExtension' in gl) {
      ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    cached = false
  }
  return cached
}
