import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge, ProgressBar, PulseDot, Skeleton, SkeletonText } from '@/components/ui/Primitives'
import { PIPELINE_STEPS } from '@/lib/constants'
import type { ProjectStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  status: ProjectStatus | null
  waitMessage: string
  onBack: () => void
}

/** Skeleton shown until the script arrives, so the panel is never blank. */
function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <Skeleton className="mb-3 h-2.5 w-24" />
        <SkeletonText lines={6} />
      </div>
      <div>
        <Skeleton className="mb-3 h-2.5 w-28" />
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border-hair p-3.5">
              <Skeleton className="mb-2.5 h-2.5 w-14" />
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-fg-subtle">
        Script and scene breakdown appear here as they are generated
      </p>
    </div>
  )
}

export function ProgressView({ status, waitMessage, onBack }: Props) {
  const pct = Math.min(100, Math.max(0, status?.progress ?? 0))
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === status?.current_step)
  const detail = status?.step_detail || waitMessage

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-6xl"
    >
      <Card edge className="p-6 sm:p-8">
        <div className="mb-7 flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" icon={<ChevronLeft size={15} />} onClick={onBack}>
            Back
          </Button>
          <Badge tone="brand" dot={false}>
            <PulseDot />
            <span className="ml-1">Processing</span>
          </Badge>
        </div>

        <div className="mb-2 flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-fg">Generating your video</h2>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-semibold text-brand tabular-nums">{pct}</span>
            <span className="label-mono">% complete</span>
          </div>
        </div>

        <ProgressBar value={pct} className="mb-3" />

        <div className="mb-9 h-5">
          <AnimatePresence mode="wait">
            <motion.p
              key={detail}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="text-sm text-fg-muted"
            >
              {detail}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
          {/* Stage tracker */}
          <ol className="relative flex flex-col gap-1">
            <span className="absolute bottom-4 left-[15px] top-4 w-px bg-border-hair" aria-hidden />
            {PIPELINE_STEPS.map((step, i) => {
              const done = currentIdx > i
              const active = currentIdx === i
              return (
                <li key={step.key} className="relative flex items-start gap-3.5 py-1.5">
                  <span
                    className={cn(
                      'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-2xs font-mono transition-colors duration-300',
                      done && 'border-[var(--color-success-500)] bg-[color-mix(in_oklab,var(--color-success-500)_16%,transparent)] text-[var(--color-success-500)]',
                      active && 'animate-pulse-ring border-border-accent bg-brand-soft text-brand',
                      !done && !active && 'border-border-hair bg-surface text-fg-subtle',
                    )}
                  >
                    {done ? <Check size={13} /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 pt-1">
                    <div
                      className={cn(
                        'text-sm font-medium transition-colors',
                        active ? 'text-fg' : done ? 'text-fg-muted' : 'text-fg-subtle',
                      )}
                    >
                      {step.name}
                    </div>
                    <div className="text-xs text-fg-subtle">{step.desc}</div>
                  </div>
                </li>
              )
            })}
          </ol>

          {/* Live preview */}
          <div className="min-w-0 rounded-2xl border border-border-hair bg-surface-inset p-5 sm:p-6">
            {!status?.script ? (
              <PreviewSkeleton />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col gap-7"
              >
                <div>
                  <h3 className="label-mono mb-2.5">Generated script</h3>
                  <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
                    {status.script}
                  </p>
                </div>

                {status.scenes?.length > 0 && (
                  <div>
                    <h3 className="label-mono mb-2.5">Scene breakdown</h3>
                    <div className="flex max-h-80 flex-col gap-2.5 overflow-y-auto pr-1">
                      {status.scenes.map((scene, i) => (
                        <motion.div
                          key={scene.scene_number ?? i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i * 0.04, 0.4) }}
                          className="rounded-xl border border-border-hair bg-surface p-3.5"
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="label-mono !text-brand">
                              Scene {scene.scene_number ?? i + 1}
                            </span>
                            <span className="font-mono text-2xs text-fg-subtle">
                              {scene.duration ?? '?'}s
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-fg-muted">{scene.narration}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
