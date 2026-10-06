/**
 * Motion vocabulary.
 *
 * The point of centralising this is restraint. A page where every element
 * fades up by 22px with the same easing reads as generated, because nothing
 * is prioritised — the motion carries no information. Here each preset has a
 * job, and sections are expected to pick different ones.
 *
 * Physics over duration wherever something is interactive: springs respond to
 * how fast you threw them, tweens do not, and the difference is most of what
 * "feels expensive" actually means.
 */

import type { Transition, Variants } from 'motion/react'

/* ── Easing ─────────────────────────────────────────────────────────────── */

/** Fast out, long settle. Reads as confident rather than floaty. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const
/** Slight anticipation. For things that should feel mechanical. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const

export const SPRING: Transition = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }
/** Heavier — for larger surfaces that would feel twitchy on the default. */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 170, damping: 26 }
/** Snappy, for cursor-tracking where latency is felt immediately. */
export const SPRING_SNAP: Transition = { type: 'spring', stiffness: 550, damping: 30 }

/* ── Entrance presets ───────────────────────────────────────────────────── */

/**
 * Rise. The workhorse, but deliberately small (12px, not 24) — large travel
 * on every element is what makes a page feel like it is swimming.
 */
export const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
}

/** Blur-in. Costly to paint, so reserve it for one or two hero elements. */
export const focusIn: Variants = {
  hidden: { opacity: 0, filter: 'blur(10px)', scale: 0.98 },
  show: {
    opacity: 1, filter: 'blur(0px)', scale: 1,
    transition: { duration: 0.8, ease: EASE_OUT },
  },
}

/** Horizontal entrance — use when a section's content is genuinely lateral. */
export const slideIn = (from: 'left' | 'right' = 'left'): Variants => ({
  hidden: { opacity: 0, x: from === 'left' ? -28 : 28 },
  show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE_OUT } },
})

/** Scale from the floor. For cards that should feel like they land. */
export const settle: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT },
}

/* ── Orchestration ──────────────────────────────────────────────────────── */

export const stagger = (each = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: each, delayChildren: delay } },
})

/** Children animate from the end backwards — good for stacked lists. */
export const staggerReverse = (each = 0.06): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: each, staggerDirection: -1 } },
})

/* ── Per-character reveal ───────────────────────────────────────────────── */

/**
 * Splits a string into animatable chunks preserving spaces.
 * Reserved for a single headline per page — applied broadly it becomes noise.
 */
export function splitChars(text: string): string[] {
  return Array.from(text)
}

export const charContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.018, delayChildren: 0.08 } },
}

export const charItem: Variants = {
  hidden: { opacity: 0, y: '0.45em', rotateX: -55 },
  show: {
    opacity: 1, y: 0, rotateX: 0,
    transition: { duration: 0.5, ease: EASE_OUT },
  },
}

/* ── Viewport defaults ──────────────────────────────────────────────────── */

/**
 * `once` matters: re-animating on every scroll-past is a hallmark of
 * template motion and gets irritating on the second pass. The negative margin
 * fires slightly before the element is fully visible so it never looks late.
 */
export const inView = { once: true, margin: '-12% 0px -8% 0px' } as const
