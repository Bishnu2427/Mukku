/**
 * "How it works" as a scroll-scrubbed pipeline.
 *
 * The previous version was eight identical cards in a four-column grid,
 * numbered 01–08, all entering with the same fade-up. That shape tells the
 * reader nothing: the numbering is decoration, and uniform motion flattens
 * every stage to equal importance.
 *
 * Here the scroll position *is* the pipeline position. A sticky panel on the
 * left shows what the current stage actually produces; the list on the right
 * advances as you scroll. The motion carries the information, which is the
 * whole difference between interaction and ornament.
 *
 * Performance: one `useScroll` (rAF-batched, passive) drives a single
 * MotionValue. Stage changes are plain React state updated at most eight times
 * across the section — no per-frame work, no layout reads during scroll.
 */

import { useRef, useState } from 'react'
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react'
import {
  Clapperboard, FileText, Film, Image as ImageIcon, Layers, Mic, Music, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EASE_OUT } from '@/lib/motion'

const STAGES = [
  {
    icon: Sparkles, name: 'Read the brief',
    desc: 'Topic, audience, tone and length are pulled out of your sentence — nothing to fill in.',
    out: ['topic · hydration & energy', 'audience · general', 'tone · calm, friendly', 'length · 60s'],
    kind: 'meta' as const,
  },
  {
    icon: FileText, name: 'Write the script',
    desc: 'A narration script in your language, paced to the duration you asked for.',
    out: [
      'Most people walk around mildly dehydrated.',
      'You lose about two litres a day — more if you move.',
      'The first sign is rarely thirst. It is fatigue.',
    ],
    kind: 'lines' as const,
  },
  {
    icon: Layers, name: 'Plan the scenes',
    desc: 'The script is cut into shots, each with its own visual direction and timing.',
    out: ['Glass filling, morning light', 'Runner pausing, city park', 'Desk, afternoon slump'],
    kind: 'cards' as const,
  },
  {
    icon: ImageIcon, name: 'Generate visuals',
    desc: 'One image per scene, in the style you picked — photoreal, cinematic or documentary.',
    out: [], kind: 'frames' as const,
  },
  {
    icon: Film, name: 'Animate',
    desc: 'Stills become motion. Camera moves, parallax, and real generated video where your plan allows it.',
    out: [], kind: 'motion' as const,
  },
  {
    icon: Mic, name: 'Record the voice',
    desc: 'Narration in twelve languages, timed to each scene so nothing runs over.',
    out: [], kind: 'wave' as const,
  },
  {
    icon: Music, name: 'Score it',
    desc: 'An original instrumental bed matched to the tone, ducked under the voice.',
    out: [], kind: 'bars' as const,
  },
  {
    icon: Clapperboard, name: 'Assemble',
    desc: 'Cuts, captions, colour grade and mix — rendered to a single MP4 you can post.',
    out: [], kind: 'final' as const,
  },
]

const HUES = [212, 228, 244, 262, 198, 174, 36, 216]

function StageVisual({ index }: { index: number }) {
  const s = STAGES[index]

  if (s.kind === 'meta' || s.kind === 'lines' || s.kind === 'cards') {
    return (
      <div className={cn('flex h-full flex-col justify-center gap-2.5',
        s.kind === 'cards' && 'gap-2')}>
        {s.out.map((line, i) => (
          <motion.div
            key={line}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.45, ease: EASE_OUT }}
            className={cn(
              s.kind === 'meta' && 'font-mono text-xs text-fg-muted',
              s.kind === 'lines' && 'text-sm leading-relaxed text-fg-muted',
              s.kind === 'cards' &&
                'rounded-lg border border-border-hair bg-surface-2 px-3 py-2 text-xs text-fg-muted',
            )}
          >
            {s.kind === 'cards' && (
              <span className="mr-2 font-mono text-[9px] text-fg-subtle">
                {String(i + 1).padStart(2, '0')}
              </span>
            )}
            {line}
          </motion.div>
        ))}
      </div>
    )
  }

  if (s.kind === 'frames' || s.kind === 'motion') {
    return (
      <div className="grid h-full grid-cols-3 items-center gap-2.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="relative aspect-video overflow-hidden rounded-xl"
            style={{
              background:
                `linear-gradient(140deg, hsl(${HUES[i * 2]} 48% 34%), hsl(${HUES[i * 2] + 24} 42% 17%))`,
            }}
            initial={{ opacity: 0, filter: 'blur(10px)', scale: 1.05 }}
            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
            transition={{ delay: i * 0.1, duration: 0.6, ease: EASE_OUT }}
          >
            {s.kind === 'motion' && (
              <motion.span
                className="absolute inset-0"
                style={{ background: 'linear-gradient(90deg,transparent,rgb(255 255 255/.16),transparent)' }}
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </motion.div>
        ))}
      </div>
    )
  }

  if (s.kind === 'wave') {
    return (
      <div className="flex h-full items-center justify-center gap-[3px]">
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-brand/70"
            initial={{ height: 4 }}
            animate={{ height: 6 + Math.abs(Math.sin(i * 0.9)) * 46 }}
            transition={{ delay: i * 0.012, duration: 0.4, ease: EASE_OUT }}
          />
        ))}
      </div>
    )
  }

  if (s.kind === 'bars') {
    return (
      <div className="flex h-full items-center justify-center gap-1.5">
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.span
            key={i}
            className="w-2 rounded-full bg-accent/60"
            animate={{ height: [10, 14 + ((i * 17) % 44), 10] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.05, ease: 'easeInOut' }}
          />
        ))}
      </div>
    )
  }

  // final
  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        className="relative aspect-video w-full max-w-sm overflow-hidden rounded-xl"
        style={{ background: 'linear-gradient(140deg, hsl(216 50% 30%), hsl(248 42% 16%))' }}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      >
        <motion.span
          className="absolute left-0 top-0 h-[3px] bg-brand"
          initial={{ width: '0%' }} animate={{ width: '100%' }}
          transition={{ duration: 2.4, ease: 'linear', repeat: Infinity }}
        />
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/12 backdrop-blur-sm">
            <span className="ml-0.5 border-y-[8px] border-l-[12px] border-y-transparent border-l-white/90" />
          </span>
        </div>
        <span className="absolute bottom-2.5 left-0 right-0 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-white/55">
          1080p · 58s · ready
        </span>
      </motion.div>
    </div>
  )
}

export function HowItWorks() {
  const host = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const { scrollYProgress } = useScroll({
    target: host,
    // Starts when the section's top hits 80% down the viewport, ends when its
    // bottom reaches 20% — so the sequence completes before it scrolls away.
    offset: ['start 0.95', 'end 0.55'],
  })

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    // Compress into 0..1 with 6% dead zones, so stage 01 is visible on entry
    // and stage 08 holds at the end instead of being skipped.
    const t = Math.min(1, Math.max(0, (v - 0.06) / 0.88))
    const i = Math.min(STAGES.length - 1, Math.floor(t * STAGES.length))
    setActive((prev) => (prev === i ? prev : i))
  })

  const railScale = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <section id="how" ref={host} className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">

        <div className="max-w-2xl">
          <span className="label-mono text-brand">The pipeline</span>
          <h2 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.9rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-fg">
            Eight stages. You write one sentence.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted">
            Each stage hands to the next on its own. Scroll to walk through what
            happens between your prompt and the finished file.
          </p>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_minmax(0,1.15fr)] lg:gap-16">

          {/* Stage list — the scroll track */}
          <ol className="relative">
            {/* Rail: a single scaleY transform, composited */}
            <span className="absolute left-[15px] top-2 h-[calc(100%-1rem)] w-px bg-border-hair" aria-hidden />
            <motion.span
              className="mk-rail absolute left-[15px] top-2 h-[calc(100%-1rem)] w-px bg-brand"
              style={{ scaleY: railScale }}
              aria-hidden
            />

            {STAGES.map((s, i) => {
              const on = i === active
              const past = i < active
              return (
                <li key={s.name} className="relative flex gap-5 pb-16 last:pb-4">
                  <span
                    className={cn(
                      'relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors duration-300',
                      on && 'border-brand bg-brand text-white',
                      past && !on && 'border-border-accent bg-brand-soft text-brand',
                      !on && !past && 'border-border-hair bg-bg text-fg-subtle',
                    )}
                  >
                    <s.icon size={14} />
                  </span>
                  <div className="pt-1">
                    <h3
                      className={cn(
                        'font-display text-[0.98rem] font-semibold transition-colors duration-300',
                        on ? 'text-fg' : 'text-fg-muted',
                      )}
                    >
                      {s.name}
                    </h3>
                    {/* Only the active stage carries its description — eight
                        paragraphs at once is a wall nobody reads. */}
                    <motion.p
                      initial={false}
                      animate={{
                        height: on ? 'auto' : 0,
                        opacity: on ? 1 : 0,
                        marginTop: on ? 6 : 0,
                      }}
                      transition={{ duration: 0.34, ease: EASE_OUT }}
                      className="overflow-hidden text-sm leading-relaxed text-fg-muted"
                    >
                      {s.desc}
                    </motion.p>
                  </div>
                </li>
              )
            })}
          </ol>

          {/* Sticky output panel */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="glass relative overflow-hidden rounded-2xl border border-border-hair p-5 shadow-[var(--shadow-lg)]">
              <span className="edge-light absolute inset-x-0 top-0 h-px" aria-hidden />
              <div className="mb-4 flex items-center justify-between">
                <span className="label-mono !text-fg-subtle">
                  Stage {String(active + 1).padStart(2, '0')}
                </span>
                <span className="font-mono text-[10px] text-fg-subtle">
                  {STAGES[active].name.toLowerCase()}
                </span>
              </div>
              <div className="h-[220px]">
                <StageVisual key={active} index={active} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
