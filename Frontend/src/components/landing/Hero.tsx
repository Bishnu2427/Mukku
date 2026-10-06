import { Suspense, lazy } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PulseDot } from '@/components/ui/Primitives'
import { useCountUp } from '@/hooks'
import { useMagnetic } from '@/hooks/useInteraction'
import { EASE_OUT } from '@/lib/motion'
import { PipelineDemo } from './PipelineDemo'

// WebGL is split out so it never blocks first paint of the headline.
const DuskScene = lazy(() => import('@/components/three/DuskScene'))

const STATS = [
  { value: 8,  suffix: '',      label: 'AI stages' },
  { value: 12, suffix: '',      label: 'Languages' },
  { value: 7,  suffix: '+',     label: 'Platforms' },
  { value: 5,  suffix: ' min',  label: 'Max length' },
]

function Stat({ value, suffix, label }: (typeof STATS)[number]) {
  const { ref, value: n } = useCountUp(value)
  return (
    <div className="flex flex-col gap-0.5">
      <span ref={ref} className="font-display text-xl font-semibold tabular-nums text-fg">
        {n}{suffix}
      </span>
      <span className="label-mono">{label}</span>
    </div>
  )
}

/** Cursor-following CTA. Physical response is most of what "expensive" means. */
function MagneticCta() {
  const { ref, style } = useMagnetic<HTMLDivElement>(0.28)
  return (
    <motion.div ref={ref} style={style} className="inline-block">
      <Link to="/register">
        <Button size="lg" iconRight={<ArrowRight size={16} />}>
          Start creating free
        </Button>
      </Link>
    </motion.div>
  )
}

/**
 * Entrance choreography.
 *
 * Deliberately NOT one uniform fade-up on every child — that is the single
 * clearest sign of generated design, because identical motion tells the reader
 * nothing about what matters. Here the eyebrow slides, the headline rises per
 * line, the demo scales in from behind, and the stats simply fade. Four
 * different gestures, ranked by importance.
 */
const line = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.75, delay: 0.1 + i * 0.09, ease: EASE_OUT },
  }),
}

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-24 pt-32 lg:pb-32 lg:pt-36">
      <Suspense fallback={null}>
        <DuskScene className="pointer-events-none absolute inset-0 -z-10" />
      </Suspense>
      <div className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-40" />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.06fr)] lg:gap-16 lg:px-8">

        {/* ── Left: the claim ─────────────────────────────────────────── */}
        <div className="max-w-xl">
          <motion.div
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-border-hair bg-surface/50 px-3 py-1.5 backdrop-blur-sm"
          >
            <PulseDot tone="accent" />
            <span className="label-mono !text-fg-muted">Live · eight-stage pipeline</span>
          </motion.div>

          <h1 className="font-display text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[1.04] tracking-[-0.038em] text-fg">
            {['Describe it once.', 'Get the finished film.'].map((l, i) => (
              <motion.span
                key={l}
                custom={i}
                variants={line}
                initial="hidden"
                animate="show"
                className="block"
              >
                {l}
              </motion.span>
            ))}
          </h1>

          <motion.p
            custom={2}
            variants={line}
            initial="hidden"
            animate="show"
            className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-fg-muted"
          >
            Script, scenes, visuals, voiceover and score — generated end to end and
            handed to you as a ready-to-post MP4. No timeline. No editing suite.
          </motion.p>

          <motion.div
            custom={3}
            variants={line}
            initial="hidden"
            animate="show"
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <MagneticCta />
            <a href="#how">
              <Button size="lg" variant="ghost" icon={<Play size={14} />}>
                See how it works
              </Button>
            </a>
          </motion.div>

          <motion.p
            custom={4}
            variants={line}
            initial="hidden"
            animate="show"
            className="mt-4 text-sm text-fg-subtle"
          >
            3 free videos a month · no card required
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.75, duration: 0.8 }}
            className="mt-12 grid grid-cols-4 gap-6 border-t border-border-hair pt-7"
          >
            {STATS.map((s) => <Stat key={s.label} {...s} />)}
          </motion.div>
        </div>

        {/* ── Right: the proof ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.955, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.95, delay: 0.3, ease: EASE_OUT }}
          className="relative"
        >
          {/* Soft lift behind the panel so it separates from the shader */}
          <div
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] opacity-60"
            style={{ background: 'radial-gradient(60% 55% at 50% 45%, var(--aurora-1), transparent 70%)' }}
          />
          <PipelineDemo />
        </motion.div>
      </div>
    </section>
  )
}
