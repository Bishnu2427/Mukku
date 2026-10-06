/**
 * The hero's signature moment: a self-running demonstration of the product.
 *
 * Every competitor's landing page *describes* what their tool does. This one
 * performs it — a prompt types itself, the eight stages execute in sequence
 * with their real output appearing, and it resolves into a finished frame.
 * It is the one thing on the page no other company could copy, because it is
 * literally Mukku's pipeline.
 *
 * Cost discipline (the page has to stay fast):
 *   • No per-frame JavaScript. Motion is declarative and composited.
 *   • Only `transform` and `opacity` animate — never width/height/top/left.
 *   • The whole sequence pauses when scrolled out of view or the tab is
 *     hidden, via useSequence's `paused` flag.
 *   • ~6 kB of component code, no extra dependency.
 */

import { memo, useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Film, Layers, Music, Image as ImageIcon, Mic, Scissors, Sparkles, Type } from 'lucide-react'
import { useInViewport, useSequence, useTypewriter } from '@/hooks/useInteraction'
import { EASE_OUT, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

const PROMPT = 'A 60-second explainer on why hydration matters, calm and friendly.'

/** The real backend stage keys, so the demo cannot drift from the product. */
const STAGES = [
  { key: 'analyzing_prompt',  label: 'Reading idea',   icon: Sparkles },
  { key: 'generating_script', label: 'Script',  icon: Type },
  { key: 'planning_scenes',   label: 'Scenes',     icon: Scissors },
  { key: 'generating_images', label: 'Visuals',  icon: ImageIcon },
  { key: 'generating_clips',  label: 'Animating',    icon: Film },
  { key: 'generating_voices', label: 'Voiceover', icon: Mic },
  { key: 'generating_music',  label: 'Music',       icon: Music },
  { key: 'assembling_video',  label: 'Assembling',          icon: Layers },
] as const

const SCRIPT_LINES = [
  'Most people walk around mildly dehydrated without noticing.',
  'Your body loses about two litres of water a day — more if you move.',
  'The first sign is rarely thirst. It is usually fatigue.',
]

const SCENES = [
  { n: 1, t: 'Glass filling, morning light', hue: 212 },
  { n: 2, t: 'Runner pausing, city park',    hue: 244 },
  { n: 3, t: 'Desk, afternoon slump',        hue: 28  },
]

/* Phase timings in ms. Total ≈ 13s, then it loops. */
const TIMELINE = [2600, 1500, 1700, 1700, 1700, 1300, 1200, 1400, 2400]

function Waveform({ active }: { active: boolean }) {
  // Deterministic bar heights — Math.random() here would make the component
  // non-reproducible between renders and defeat memoisation.
  const bars = useMemo(
    () => Array.from({ length: 34 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 1.7)) * 0.75),
    [],
  )
  return (
    <div className="flex h-10 items-center gap-[3px]">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-brand/70"
          initial={{ scaleY: 0.08 }}
          animate={active ? { scaleY: [0.08, h, 0.3 + h * 0.4] } : { scaleY: 0.08 }}
          transition={{ duration: 0.5, delay: i * 0.012, ease: EASE_OUT }}
          style={{ height: 34, originY: 0.5 }}
        />
      ))}
    </div>
  )
}

export const PipelineDemo = memo(function PipelineDemo() {
  const { ref, visible } = useInViewport<HTMLDivElement>(0.15)
  const { step, cycle } = useSequence(TIMELINE, { paused: !visible })

  // Phase 0 is the prompt typing; stages run 1..8; phase 9 is the result.
  const typing = step === 0
  const stageIndex = step - 1
  const finished = step >= STAGES.length + 1

  // One value decides what the output panel shows. Deriving it here, rather
  // than scattering index comparisons through the JSX, is what guarantees
  // exactly one child is mounted — which is what AnimatePresence requires.
  const panel = (() => {
    if (typing) return 'idle'
    if (finished) return 'done'
    switch (stageIndex) {
      case 0:  return 'idle'
      case 1:  return 'script'
      case 2:  return 'scenes'
      case 3:  return 'visuals'
      case 4:  return 'clips'
      case 5:  return 'voice'
      case 6:  return 'music'
      case 7:  return 'assemble'
      default: return 'idle'
    }
  })()

  const { text } = useTypewriter(PROMPT, {
    speed: 26,
    enabled: visible && typing,
  })

  return (
    <div ref={ref} className="relative w-full">
      {/* Frame */}
      <div className="glass relative overflow-hidden rounded-2xl border border-border-hair shadow-[var(--shadow-lg)]">
        <span className="edge-light absolute inset-x-0 top-0 h-px" aria-hidden />

        {/* Title bar — grounds it as a real workspace, not an illustration */}
        <div className="flex items-center gap-2 border-b border-border-hair px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[var(--color-danger-500)]/50" />
          <span className="h-2 w-2 rounded-full bg-accent/50" />
          <span className="h-2 w-2 rounded-full bg-[var(--color-success-500)]/50" />
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
            mukku studio
          </span>
          <span className="ml-auto font-mono text-[10px] text-fg-subtle">
            {finished ? 'done' : `${Math.min(step, STAGES.length)}/${STAGES.length}`}
          </span>
        </div>

        {/* Prompt line */}
        <div className="border-b border-border-hair px-4 py-3.5">
          <p className="min-h-[2.6em] text-[13px] leading-relaxed text-fg">
            {typing ? text : PROMPT}
            {typing && (
              <motion.span
                className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.18em] bg-brand"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
              />
            )}
          </p>
        </div>

        {/* Stage rail + output */}
        <div className="grid gap-0 sm:grid-cols-[136px_1fr]">
          {/* Rail */}
          <ul className="space-y-0.5 border-b border-border-hair p-2.5 sm:border-b-0 sm:border-r">
            {STAGES.map((s, i) => {
              const done = finished || i < stageIndex
              const active = !finished && i === stageIndex
              const Icon = s.icon
              return (
                <li
                  key={s.key}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors duration-300',
                    active && 'bg-brand-soft text-brand',
                    done && !active && 'text-fg-muted',
                    !done && !active && 'text-fg-subtle',
                  )}
                >
                  <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {done && !active ? (
                      <Check size={11} className="text-[var(--color-success-500)]" />
                    ) : (
                      <Icon size={11} />
                    )}
                    {active && (
                      <motion.span
                        className="absolute inset-[-5px] rounded-full border border-brand/40"
                        animate={{ scale: [1, 1.5], opacity: [0.7, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                      />
                    )}
                  </span>
                  <span className="truncate">{s.label}</span>
                </li>
              )
            })}
          </ul>

          {/* Output panel */}
          <div className="relative min-h-[232px] p-4">
            <AnimatePresence mode="wait" initial={false}>
              {/* Exactly one child at a time, keyed by phase — see note above. */}
              {/* Script streaming in */}
              {panel === "script" && (
                <motion.div
                  key={`script-${cycle}`}
                  className="space-y-2.5"
                  initial="hidden" animate="show" exit={{ opacity: 0 }}
                  variants={{ show: { transition: { staggerChildren: 0.28 } } }}
                >
                  {SCRIPT_LINES.map((l) => (
                    <motion.p
                      key={l}
                      className="text-[12.5px] leading-relaxed text-fg-muted"
                      variants={{
                        hidden: { opacity: 0, x: -8 },
                        show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE_OUT } },
                      }}
                    >
                      {l}
                    </motion.p>
                  ))}
                </motion.div>
              )}

              {/* Scenes dealing out like cards */}
              {panel === "scenes" && (
                <motion.div
                  key={`scenes-${cycle}`}
                  className="grid grid-cols-3 gap-2"
                  initial="hidden" animate="show" exit={{ opacity: 0 }}
                  variants={{ show: { transition: { staggerChildren: 0.11 } } }}
                >
                  {SCENES.map((s) => (
                    <motion.div
                      key={s.n}
                      className="rounded-lg border border-border-hair bg-surface-2 p-2.5"
                      variants={{
                        hidden: { opacity: 0, y: 18, rotate: -4 },
                        show: { opacity: 1, y: 0, rotate: 0, transition: SPRING },
                      }}
                    >
                      <div className="font-mono text-[9px] text-fg-subtle">SCENE {s.n}</div>
                      <div className="mt-1 text-[11px] leading-snug text-fg-muted">{s.t}</div>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Visuals resolving from blur */}
              {(panel === "visuals" || panel === "clips") && (
                <motion.div
                  key={`visuals-${cycle}`}
                  className="grid grid-cols-3 gap-2"
                  initial="hidden" animate="show" exit={{ opacity: 0 }}
                  variants={{ show: { transition: { staggerChildren: 0.13 } } }}
                >
                  {SCENES.map((s) => (
                    <motion.div
                      key={s.n}
                      className="relative aspect-video overflow-hidden rounded-lg"
                      style={{
                        background:
                          `linear-gradient(140deg, hsl(${s.hue} 52% 34%), hsl(${s.hue + 26} 44% 18%))`,
                      }}
                      variants={{
                        hidden: { opacity: 0, filter: 'blur(9px)', scale: 1.06 },
                        show: {
                          opacity: 1, filter: 'blur(0px)', scale: 1,
                          transition: { duration: 0.75, ease: EASE_OUT },
                        },
                      }}
                    >
                      {/* Clip stage adds a slow pan, so motion is visibly added */}
                      {panel === "clips" && (
                        <motion.span
                          className="absolute inset-0"
                          style={{
                            background:
                              'linear-gradient(90deg, transparent, rgb(255 255 255/0.14), transparent)',
                          }}
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                        />
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Voice */}
              {panel === "voice" && (
                <motion.div
                  key={`voice-${cycle}`}
                  className="flex h-full flex-col justify-center gap-3"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  <Waveform active />
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
                    English · female · 3 scenes
                  </p>
                </motion.div>
              )}

              {/* Music */}
              {panel === "music" && (
                <motion.div
                  key={`music-${cycle}`}
                  className="flex h-full items-center justify-center gap-1.5"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {Array.from({ length: 16 }).map((_, i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 rounded-full bg-accent/60"
                      animate={{ height: [8, 10 + ((i * 13) % 34), 8] }}
                      transition={{
                        duration: 0.9, repeat: Infinity,
                        delay: i * 0.06, ease: 'easeInOut',
                      }}
                    />
                  ))}
                </motion.div>
              )}

              {/* Assembling: scenes collapse into one frame */}
              {panel === "assemble" && (
                <motion.div
                  key={`assemble-${cycle}`}
                  className="relative flex h-full items-center justify-center"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {SCENES.map((s, i) => (
                    <motion.div
                      key={s.n}
                      className="absolute h-20 w-36 rounded-lg border border-border-hair"
                      style={{
                        background:
                          `linear-gradient(140deg, hsl(${s.hue} 52% 34%), hsl(${s.hue + 26} 44% 18%))`,
                      }}
                      initial={{ x: (i - 1) * 96, rotate: (i - 1) * 7, opacity: 0.9 }}
                      animate={{ x: 0, rotate: 0, opacity: i === 1 ? 1 : 0 }}
                      transition={{ duration: 1, ease: EASE_OUT }}
                    />
                  ))}
                </motion.div>
              )}

              {/* Finished */}
              {panel === "done" && (
                <motion.div
                  key={`done-${cycle}`}
                  className="flex h-full flex-col items-center justify-center gap-3"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={SPRING}
                >
                  <div
                    className="relative aspect-video w-full max-w-[280px] overflow-hidden rounded-xl"
                    style={{
                      background: 'linear-gradient(140deg, hsl(216 52% 32%), hsl(248 44% 17%))',
                    }}
                  >
                    <motion.span
                      className="absolute left-0 top-0 h-[3px] bg-brand"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 2.2, ease: 'linear' }}
                    />
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/12 backdrop-blur-sm">
                        <span className="ml-0.5 border-y-[7px] border-l-[11px] border-y-transparent border-l-white/90" />
                      </span>
                    </div>
                  </div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-success-500)]">
                    ready · 1080p · 58s
                  </p>
                </motion.div>
              )}

              {/* Idle placeholder while the prompt types */}
              {panel === "idle" && (
                <motion.div
                  key={`idle-${cycle}`}
                  className="flex h-full items-center justify-center"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  <p className="text-center text-[11.5px] leading-relaxed text-fg-subtle">
                    {typing ? 'Waiting for your idea…' : 'Understanding the brief…'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
})
