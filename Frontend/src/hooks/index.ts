import { useEffect, useRef, useState } from 'react'
import { animate, useInView } from 'motion/react'
import { prefersReducedMotion } from '@/lib/utils'

/** Counts 0 → target once the element scrolls into view. */
export function useCountUp(target: number, duration = 1.4) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    const controls = animate(0, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, target, duration])

  return { ref, value }
}

/** Cycles an index on an interval — used by the language chip strip. */
export function useCycle(length: number, intervalMs = 1200) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (length <= 1 || prefersReducedMotion()) return
    const t = setInterval(() => setI((p) => (p + 1) % length), intervalMs)
    return () => clearInterval(t)
  }, [length, intervalMs])
  return i
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** Debounces a value — admin search boxes use 400ms, matching the old UI. */
export function useDebounced<T>(value: T, delay = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

/** Pointer-tracked 3D tilt. Disabled on touch and for reduced motion. */
export function useTilt(max = 6) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
      el.style.transform =
        `perspective(900px) rotateY(${dx * max}deg) rotateX(${-dy * max}deg) translateY(-3px)`
    }
    const onLeave = () => { el.style.transform = '' }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [max])

  return ref
}
