/**
 * Capabilities, as a bento of working demonstrations.
 *
 * The previous version was six identical cards in a 3×2 grid: same radius,
 * same border, same icon-in-a-rounded-square, same two lines of body. Every
 * feature weighted equally, nothing interactive, nothing that could only be
 * said about this product. That shape is the clearest structural tell of
 * generated design.
 *
 * Here each tile *performs* its feature instead of captioning it — the
 * language tile actually cycles through Devanagari, Tamil and Bengali; the
 * ratio tile morphs between 16:9, 9:16 and 1:1; the motion tile runs a real
 * parallax against a frozen still. Cell sizes differ so the grid has a
 * hierarchy, and every tile responds to the cursor.
 *
 * Cost: all motion is transform/opacity, each tile pauses when off screen, and
 * there is no new dependency.
 */

import { useRef } from 'react'
import { motion, useInView } from 'motion/react'
import { Film, Languages as LangIcon, Music, Sparkles, Upload, Wand2 } from 'lucide-react'
import { useCycle } from '@/hooks'
import { useTilt } from '@/hooks/useInteraction'
import { EASE_OUT, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

/* ── Tile shell ──────────────────────────────────────────────────────────── */

function Tile({
  className, children, title, body, icon: Icon, large = false,
}: {
  className?: string
  children?: React.ReactNode
  title: string
  body: string
  icon: React.ComponentType<{ size?: number }>
  large?: boolean
}) {
  const { ref, style } = useTilt<HTMLDivElement>(4)

  return (
    <motion.div
      ref={ref}
      style={style}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border-hair',
        'bg-surface/60 backdrop-blur-sm transition-colors duration-300 hover:border-border-accent',
        className,
      )}
    >
      <span className="edge-light pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden />

      {/* Demo area — this is the point of the tile */}
      {children && (
        <div
          className={cn(
            'relative overflow-hidden',
            // Short tiles get a fixed demo band; the tall tile lets the demo
            // take the slack, otherwise a 2-row span leaves a dead gap.
            large ? 'min-h-[13rem] flex-1' : 'h-28 shrink-0',
          )}
        >
          {children}
        </div>
      )}

      <div className={cn('flex flex-col justify-end p-5', large ? 'shrink-0' : 'flex-1')}>
        <div className="mb-2.5 flex items-center gap-2 text-brand">
          <Icon size={14} />
          <h3 className={cn('font-display font-semibold text-fg',
            large ? 'text-lg' : 'text-[0.95rem]')}>
            {title}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-fg-muted">{body}</p>
      </div>
    </motion.div>
  )
}

/* ── Demo: languages ─────────────────────────────────────────────────────── */

const SAMPLES = [
  { lang: 'English',  text: 'Most people walk around mildly dehydrated.' },
  { lang: 'हिन्दी',     text: 'ज़्यादातर लोग हल्के निर्जलीकरण में रहते हैं।' },
  { lang: 'தமிழ்',     text: 'பெரும்பாலானோர் லேசான நீரிழப்புடன் இருக்கிறார்கள்.' },
  { lang: 'বাংলা',     text: 'বেশিরভাগ মানুষ হালকা পানিশূন্যতায় থাকেন।' },
  { lang: 'తెలుగు',    text: 'చాలామంది స్వల్ప నిర్జలీకరణంలో ఉంటారు.' },
  { lang: 'ಕನ್ನಡ',     text: 'ಹೆಚ್ಚಿನವರು ಸೌಮ್ಯ ನಿರ್ಜಲೀಕರಣದಲ್ಲಿರುತ್ತಾರೆ.' },
]

function LanguageDemo() {
  const host = useRef<HTMLDivElement>(null)
  const seen = useInView(host, { amount: 0.3 })
  const i = useCycle(SAMPLES.length, 2200, seen)

  return (
    <div ref={host} className="flex h-full flex-col gap-4 px-5 py-5">
      <div className="flex flex-wrap gap-1.5">
        {SAMPLES.map((s, n) => (
          <span
            key={s.lang}
            className={cn(
              'rounded-md px-1.5 py-0.5 font-mono text-[10px] transition-colors duration-300',
              n === i ? 'bg-brand-soft text-brand' : 'text-fg-subtle',
            )}
          >
            {s.lang}
          </span>
        ))}
      </div>

      {/* The script itself, set large — the whole claim is that Mukku writes
          IN the language, so the sentence is the evidence and deserves size. */}
      <motion.p
        key={i}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
        className="text-balance text-[1.05rem] leading-snug text-fg"
      >
        {SAMPLES[i].text}
      </motion.p>

      {/* Narration recorded natively — a waveform tied to the same index, so
          the tile shows writing AND voice rather than leaving dead space. */}
      <div className="mt-auto">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success-500)]" />
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg-subtle">
            narration · {SAMPLES[i].lang}
          </span>
        </div>
        <div className="flex h-8 items-end gap-[2px]">
          {Array.from({ length: 52 }).map((_, n) => (
            <motion.span
              key={n}
              className="flex-1 rounded-full bg-brand/45"
              animate={seen
                ? { height: 3 + Math.abs(Math.sin(n * 0.7 + i * 1.3)) * 26 }
                : { height: 3 }}
              transition={{ duration: 0.4, delay: n * 0.006, ease: EASE_OUT }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Demo: aspect ratios ─────────────────────────────────────────────────── */

const RATIOS = [
  { label: '16:9', w: 132, h: 74,  for: 'YouTube' },
  { label: '9:16', w: 54,  h: 96,  for: 'Shorts · Reels' },
  { label: '1:1',  w: 84,  h: 84,  for: 'Feed post' },
]

function RatioDemo() {
  const host = useRef<HTMLDivElement>(null)
  const seen = useInView(host, { amount: 0.3 })
  const i = useCycle(RATIOS.length, 1900, seen)
  const r = RATIOS[i]

  return (
    <div ref={host} className="flex h-full items-center justify-center gap-4">
      {/* One element that morphs, rather than three that swap — the morph is
          what communicates "same video, different shape". */}
      <motion.div
        className="rounded-lg border border-border-accent"
        style={{ background: 'linear-gradient(140deg, hsl(220 48% 34%), hsl(248 42% 18%))' }}
        animate={{ width: r.w, height: r.h }}
        transition={SPRING}
      />
      <div className="w-[88px]">
        <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
          <div className="font-mono text-xs text-brand">{r.label}</div>
          <div className="mt-0.5 text-[11px] leading-tight text-fg-subtle">{r.for}</div>
        </motion.div>
      </div>
    </div>
  )
}

/* ── Demo: real motion ───────────────────────────────────────────────────── */

function MotionDemo() {
  const host = useRef<HTMLDivElement>(null)
  const seen = useInView(host, { amount: 0.3 })

  return (
    <div ref={host} className="flex h-full items-center justify-center gap-3 px-5 py-3">
      {/* Static */}
      <div className="flex-1">
        <div
          className="aspect-video overflow-hidden rounded-lg opacity-45 grayscale"
          style={{ background: 'linear-gradient(140deg, hsl(218 30% 36%), hsl(230 26% 18%))' }}
        />
        <p className="mt-1.5 truncate font-mono text-[9px] uppercase tracking-wider text-fg-subtle">
          static image
        </p>
      </div>
      {/* Animated — same frame, actually moving */}
      <div className="flex-1">
        <div className="relative aspect-video overflow-hidden rounded-lg border border-border-accent">
          <motion.div
            className="absolute inset-[-18%]"
            style={{ background: 'linear-gradient(140deg, hsl(220 50% 38%), hsl(250 44% 20%))' }}
            animate={seen ? { scale: [1, 1.14, 1], x: [0, -10, 0] } : {}}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute inset-0"
            style={{ background: 'linear-gradient(90deg,transparent,rgb(255 255 255/.12),transparent)' }}
            animate={seen ? { x: ['-100%', '100%'] } : {}}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
          />
        </div>
        <p className="mt-1.5 truncate font-mono text-[9px] uppercase tracking-wider text-brand">
          mukku output
        </p>
      </div>
    </div>
  )
}

/* ── Demo: upload ────────────────────────────────────────────────────────── */

function UploadDemo() {
  const host = useRef<HTMLDivElement>(null)
  const seen = useInView(host, { amount: 0.3 })

  return (
    <div ref={host} className="relative flex h-full items-center justify-center">
      <div className="relative h-16 w-40 rounded-xl border border-dashed border-border-strong">
        {[0, 1].map((n) => (
          <motion.div
            key={n}
            className="absolute left-1/2 top-1/2 h-9 w-12 -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-accent"
            style={{
              background: `linear-gradient(140deg, hsl(${206 + n * 34} 44% 36%), hsl(${226 + n * 34} 38% 20%))`,
            }}
            animate={seen ? {
              y: [-34, 0, 0, -34],
              x: [n === 0 ? -22 : 22, n === 0 ? -16 : 16, n === 0 ? -16 : 16, n === 0 ? -22 : 22],
              opacity: [0, 1, 1, 0],
              rotate: [n === 0 ? -8 : 8, 0, 0, n === 0 ? -8 : 8],
            } : {}}
            transition={{ duration: 3.4, repeat: Infinity, delay: n * 0.35, times: [0, 0.3, 0.75, 1] }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Demo: score ─────────────────────────────────────────────────────────── */

function ScoreDemo() {
  const host = useRef<HTMLDivElement>(null)
  const seen = useInView(host, { amount: 0.3 })

  return (
    <div ref={host} className="flex h-full items-end justify-center gap-[3px] pb-5">
      {Array.from({ length: 28 }).map((_, i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-accent/55"
          animate={seen ? { height: [6, 8 + ((i * 19) % 40), 6] } : { height: 6 }}
          transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.045, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

/* ── Demo: remake ────────────────────────────────────────────────────────── */

const EDITS = [
  { from: 'calm and friendly', to: 'punchy and bold' },
  { from: '60 seconds',        to: '30 seconds' },
  { from: 'English',           to: 'हिन्दी' },
]

function RemakeDemo() {
  const host = useRef<HTMLDivElement>(null)
  const seen = useInView(host, { amount: 0.3 })
  const i = useCycle(EDITS.length, 2400, seen)
  const e = EDITS[i]

  return (
    <div ref={host} className="flex h-full items-center px-5">
      <div className="w-full font-mono text-[11px]">
        <motion.div
          key={`f-${i}`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-fg-subtle line-through decoration-[var(--color-danger-500)]/50"
        >
          {e.from}
        </motion.div>
        <motion.div
          key={`t-${i}`}
          initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35 }}
          className="mt-1 text-[var(--color-success-500)]"
        >
          {e.to}
        </motion.div>
      </div>
    </div>
  )
}

/* ── Section ─────────────────────────────────────────────────────────────── */

export function FeatureBento() {
  return (
    <section id="features" className="relative scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">

        {/* Heading is deliberately left-aligned and narrow — a centred
            eyebrow/title/subtitle stack is the other half of the tell. */}
        <div className="max-w-xl">
          <span className="label-mono text-brand">Capabilities</span>
          <h2 className="mt-3 font-display text-[clamp(2.3rem,5vw,3.9rem)] font-semibold leading-[0.98] tracking-[-0.042em] text-fg">
            Not a storyboard tool.
            <br />
            The whole finished thing.
          </h2>
        </div>

        {/* Asymmetric grid: the two tiles that differentiate Mukku most —
            languages and motion — get the space. */}
        <div className="mt-12 grid auto-rows-[minmax(0,1fr)] gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            large
            className="sm:col-span-2 lg:row-span-2"
            icon={LangIcon}
            title="Twelve languages, natively"
            body="English plus eleven Indian languages — the script is written in the language, not translated into it, and the narration is recorded natively."
          >
            <LanguageDemo />
          </Tile>

          <Tile
            className="lg:col-span-2"
            icon={Film}
            title="Real motion, not a zoom"
            body="Scenes animate with genuine camera movement and generated video, not a still with a Ken Burns pan bolted on."
          >
            <MotionDemo />
          </Tile>

          <Tile
            icon={Sparkles}
            title="Platform presets"
            body="One click sets ratio, length, tone and style."
          >
            <RatioDemo />
          </Tile>

          <Tile
            icon={Upload}
            title="Bring your own media"
            body="Attach photos or clips — they replace generated scenes."
          >
            <UploadDemo />
          </Tile>

          <Tile
            className="sm:col-span-2 lg:col-span-2"
            icon={Music}
            title="An original score"
            body="Instrumental music composed for your topic and mood, ducked under the narration automatically."
          >
            <ScoreDemo />
          </Tile>

          <Tile
            className="sm:col-span-2 lg:col-span-2"
            icon={Wand2}
            title="Change one thing, remake"
            body="Adjust the prompt or any single setting and regenerate — without starting from scratch."
          >
            <RemakeDemo />
          </Tile>
        </div>
      </div>
    </section>
  )
}
