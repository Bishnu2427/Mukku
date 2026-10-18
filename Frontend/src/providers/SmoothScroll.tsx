/**
 * Lenis smooth scrolling.
 *
 * Native scroll jumps in discrete wheel deltas; Lenis interpolates toward the
 * target so momentum carries and easing applies. It is the single cheapest
 * change that makes a site feel built rather than assembled — 5 KB gzipped.
 *
 * Three things matter for it not to be annoying:
 *
 *   • `prefers-reduced-motion` disables it entirely. Hijacked scroll is a
 *     genuine accessibility problem for people with vestibular disorders, and
 *     "smooth" is exactly what they turned off.
 *   • Touch devices keep native scroll. Mobile browsers already have momentum,
 *     and overriding it fights the OS and costs battery.
 *   • The RAF loop stops when the tab is hidden.
 *
 * It also drives `ScrollTrigger` when that is loaded, so GSAP and Lenis agree
 * on scroll position instead of fighting over it.
 */

import { useEffect, type ReactNode } from 'react'
import type Lenis from 'lenis'

export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (reduced || coarse) return

    let lenis: Lenis | null = null
    let frame = 0
    let cancelled = false

    // Dynamic import keeps Lenis out of the critical bundle.
    import('lenis').then(({ default: LenisCtor }) => {
      if (cancelled) return

      lenis = new LenisCtor({
        // ~1s to settle. Longer feels syrupy; shorter is indistinguishable
        // from native and not worth the bytes.
        duration: 1.05,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        wheelMultiplier: 0.9,
        touchMultiplier: 1.6,
        // Never intercept touch — native momentum is better there.
        syncTouch: false,
      })

      const raf = (time: number) => {
        lenis?.raf(time)
        frame = requestAnimationFrame(raf)
      }
      frame = requestAnimationFrame(raf)

      // If GSAP ScrollTrigger is present, keep the two in sync.
      const w = window as unknown as { ScrollTrigger?: { update: () => void } }
      if (w.ScrollTrigger) lenis.on('scroll', () => w.ScrollTrigger!.update())

      const onVisibility = () => {
        cancelAnimationFrame(frame)
        if (document.visibilityState === 'visible') frame = requestAnimationFrame(raf)
      }
      document.addEventListener('visibilitychange', onVisibility)

      return () => document.removeEventListener('visibilitychange', onVisibility)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      lenis?.destroy()
    }
  }, [])

  return <>{children}</>
}
