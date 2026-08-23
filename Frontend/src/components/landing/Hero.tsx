import { Suspense, lazy } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowRight, Play, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PulseDot } from '@/components/ui/Primitives'
import { useCountUp } from '@/hooks'

// three.js is ~182 kB — never let it block first paint of the copy.
const DuskScene = lazy(() => import('@/components/three/DuskScene'))

const STATS = [
  { value: 8,  suffix: '',  label: 'AI stages' },
  { value: 12, suffix: '',  label: 'Languages' },
  { value: 7,  suffix: '+', label: 'Platforms' },
  { value: 5,  suffix: ' min', label: 'Max length' },
]

function Stat({ value, suffix, label }: (typeof STATS)[number]) {
  const { ref, value: n } = useCountUp(value)
  return (
    <div className="flex flex-col gap-1">
      <span ref={ref} className="font-display text-2xl font-semibold text-fg sm:text-3xl">
        {n}
        {suffix}
      </span>
      <span className="label-mono">{label}</span>
    </div>
  )
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } },
}

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden">
      {/* 3D backdrop */}
      <Suspense fallback={null}>
        <DuskScene className="pointer-events-none absolute inset-0 -z-10 opacity-90" />
      </Suspense>

      {/* Aurora wash — the dusk sky sitting behind everything */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="animate-drift absolute -top-1/4 left-1/2 h-[70vh] w-[80vw] -translate-x-1/2 rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, var(--aurora-1), transparent 68%)' }}
        />
        <div
          className="animate-drift absolute bottom-0 right-0 h-[46vh] w-[46vw] rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(circle, var(--aurora-2), transparent 70%)', animationDelay: '-9s' }}
        />
        <div
          className="animate-float absolute bottom-[18%] left-[12%] h-[22vh] w-[22vw] rounded-full blur-[90px]"
          style={{ background: 'radial-gradient(circle, var(--aurora-3), transparent 72%)' }}
        />
      </div>

      <div className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-60" />

      {/* Content */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto w-full max-w-4xl px-5 pb-20 pt-28 text-center lg:px-8"
      >
        <motion.div variants={item} className="mb-7 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-hair bg-surface/60 px-3.5 py-1.5 backdrop-blur-md">
            <PulseDot tone="accent" />
            <span className="label-mono !text-fg-muted">Eight-stage AI pipeline</span>
          </span>
        </motion.div>

        <motion.h1
          variants={item}
          className="font-display text-[clamp(2.5rem,7vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-fg"
        >
          Turn any idea into
          <br />
          <span className="text-gradient">a finished video</span>
        </motion.h1>

        <motion.p
          variants={item}
          className="mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-fg-muted"
        >
          Describe what you want. Mukku writes the script, plans the scenes, generates
          the visuals, records the voiceover, scores the music, and hands you a
          ready-to-post MP4.
        </motion.p>

        <motion.div variants={item} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/register">
            <Button size="lg" icon={<Sparkles size={16} />} iconRight={<ArrowRight size={16} />}>
              Start creating free
            </Button>
          </Link>
          <a href="#how">
            <Button size="lg" variant="secondary" icon={<Play size={15} />}>
              See how it works
            </Button>
          </a>
        </motion.div>

        <motion.p variants={item} className="mt-4 text-sm text-fg-subtle">
          3 free videos every month · No credit card required
        </motion.p>

        <motion.div
          variants={item}
          className="mx-auto mt-16 grid max-w-2xl grid-cols-2 gap-8 border-t border-border-hair pt-9 sm:grid-cols-4"
        >
          {STATS.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </motion.div>
      </motion.div>

      {/* Fade the canvas into the next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-bg" />
    </section>
  )
}
