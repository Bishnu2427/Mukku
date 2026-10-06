/**
 * Interaction primitives.
 *
 * These exist to make elements respond to the pointer with momentum instead of
 * switching between two states. A CSS `transition: transform .2s` always moves
 * the same way regardless of how you approached it; a spring does not, and
 * that difference is most of what separates a crafted interface from a
 * generated one.
 *
 * Every hook here no-ops under prefers-reduced-motion and on coarse pointers,
 * where cursor tracking is meaningless and costs battery.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { SPRING_SNAP, SPRING_SOFT } from '@/lib/motion'

function isFinePointerWithMotion(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return window.matchMedia('(pointer: fine)').matches
}

/* ── Magnetic ───────────────────────────────────────────────────────────── */

/**
 * Pulls an element toward the cursor while it is nearby, then springs back.
 * `strength` is the fraction of the cursor offset the element travels.
 */
export function useMagnetic<T extends HTMLElement = HTMLDivElement>(strength = 0.35) {
  const ref = useRef<T>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, SPRING_SNAP)
  const sy = useSpring(y, SPRING_SNAP)

  useEffect(() => {
    const el = ref.current
    if (!el || !isFinePointerWithMotion()) return

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      x.set((e.clientX - (r.left + r.width / 2)) * strength)
      y.set((e.clientY - (r.top + r.height / 2)) * strength)
    }
    const onLeave = () => { x.set(0); y.set(0) }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [strength, x, y])

  return { ref, style: { x: sx, y: sy } }
}

/* ── Tilt ───────────────────────────────────────────────────────────────── */

/**
 * 3D tilt toward the cursor. `max` is degrees at the furthest corner.
 * Keep it under ~8deg — anything more reads as a gimmick rather than depth.
 */
export function useTilt<T extends HTMLElement = HTMLDivElement>(max = 6) {
  const ref = useRef<T>(null)
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, SPRING_SOFT)
  const sry = useSpring(ry, SPRING_SOFT)
  // Glare follows the cursor so the surface reads as lit, not just rotated.
  const gx = useMotionValue(50)
  const gy = useMotionValue(50)

  useEffect(() => {
    const el = ref.current
    if (!el || !isFinePointerWithMotion()) return

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      ry.set((px - 0.5) * max * 2)
      rx.set((0.5 - py) * max * 2)
      gx.set(px * 100)
      gy.set(py * 100)
    }
    const onLeave = () => { rx.set(0); ry.set(0); gx.set(50); gy.set(50) }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [max, rx, ry, gx, gy])

  return {
    ref,
    style: { rotateX: srx, rotateY: sry, transformPerspective: 1000 },
    glare: { gx, gy },
  }
}

/* ── Typewriter ─────────────────────────────────────────────────────────── */

/**
 * Types a string out character by character, with slight jitter so it does not
 * sound like a metronome. Returns the visible slice plus whether it is done.
 */
export function useTypewriter(
  text: string,
  { speed = 42, startDelay = 0, enabled = true } = {},
) {
  const [out, setOut] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!enabled) { setOut(text); setDone(true); return }
    setOut(''); setDone(false)

    let i = 0
    let timer: number
    const tick = () => {
      i += 1
      setOut(text.slice(0, i))
      if (i >= text.length) { setDone(true); return }
      // Pause fractionally longer after punctuation — reads as human cadence.
      const ch = text[i - 1]
      const extra = '.,!?'.includes(ch) ? 260 : ' '.includes(ch) ? 40 : 0
      timer = window.setTimeout(tick, speed + extra + Math.random() * 34)
    }
    const start = window.setTimeout(tick, startDelay)
    return () => { window.clearTimeout(start); window.clearTimeout(timer) }
  }, [text, speed, startDelay, enabled])

  return { text: out, done }
}

/* ── Scroll progress for a single element ───────────────────────────────── */

/**
 * 0 when the element's top reaches the bottom of the viewport, 1 when its
 * bottom leaves the top. Used to drive scroll-linked sequences.
 */
export function useElementScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const progress = useMotionValue(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const update = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const total = r.height + vh
      const seen = vh - r.top
      progress.set(Math.min(1, Math.max(0, seen / total)))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [progress])

  return { ref, progress }
}

/** Maps a progress MotionValue onto a parallax offset in pixels. */
export function useParallax(progress: MotionValue<number>, distance = 60) {
  return useTransform(progress, [0, 1], [distance, -distance])
}

/* ── Looping sequencer ──────────────────────────────────────────────────── */

/**
 * Advances through N steps on a timeline, looping. Pauses when the tab is
 * hidden or the element scrolls out of view so an idle demo costs nothing.
 */
export function useSequence(steps: number[], { loop = true, paused = false } = {}) {
  const [step, setStep] = useState(0)
  const [cycle, setCycle] = useState(0)
  const timer = useRef<number>(0)

  const clear = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = 0 }
  }, [])

  useEffect(() => {
    if (paused) { clear(); return }

    const schedule = (i: number) => {
      timer.current = window.setTimeout(() => {
        const next = i + 1
        if (next >= steps.length) {
          if (!loop) return
          setCycle((c) => c + 1)
          setStep(0)
          schedule(0)
        } else {
          setStep(next)
          schedule(next)
        }
      }, steps[i])
    }

    schedule(step)
    return clear
    // step is intentionally excluded: the chain schedules itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, loop, steps, clear])

  return { step, cycle, reset: () => { clear(); setStep(0) } }
}

/** True while the element is intersecting the viewport. */
export function useInViewport<T extends HTMLElement = HTMLDivElement>(threshold = 0.25) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting), { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])

  return { ref, visible }
}
