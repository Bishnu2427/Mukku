import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { AlertTriangle, ChevronDown, Download, Pencil, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Primitives'
import { SettingsPanel } from './SettingsPanel'
import { videos } from '@/lib/api'
import { PROMPT_MAX } from '@/lib/constants'
import type { Settings } from '@/lib/types'

interface Props {
  projectId: string
  prompt: string
  settings: Settings
  onCreateAnother: () => void
  onRemake: (prompt: string, settings: Settings) => void
}

export function ResultView({ projectId, prompt, settings, onCreateAnother, onRemake }: Props) {
  const [open, setOpen] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState(prompt)
  const [draft, setDraft] = useState<Settings>(settings)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-4xl"
    >
      <Card edge className="p-6 sm:p-8">
        <div className="mb-6 text-center">
          <Badge tone="success" className="mb-3">Video ready</Badge>
          <h2 className="font-display text-2xl font-semibold text-fg">Your video is ready</h2>
          <p className="mt-1.5 text-sm text-fg-muted">
            Watch it below, download the MP4, or refine and regenerate.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border-hair bg-black">
          <video
            src={videos.streamUrl(projectId)}
            controls
            preload="metadata"
            className="aspect-video w-full"
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={videos.downloadUrl(projectId)} download>
            <Button icon={<Download size={15} />}>Download MP4</Button>
          </a>
          <Button variant="secondary" icon={<Plus size={15} />} onClick={onCreateAnother}>
            Create another
          </Button>
        </div>

        {/* Edit & remake */}
        <div className="mt-8 rounded-2xl border border-border-hair">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center gap-2 px-5 py-4 text-sm font-medium text-fg"
          >
            <Pencil size={14} className="text-brand" />
            Edit &amp; remake
            <motion.span
              className="ml-auto"
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.25 }}
            >
              <ChevronDown size={15} className="text-fg-subtle" />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-5 border-t border-border-hair p-5">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="label-mono">Prompt</span>
                      <span className="font-mono text-2xs text-fg-subtle">
                        {draftPrompt.length}/{PROMPT_MAX}
                      </span>
                    </div>
                    <textarea
                      value={draftPrompt}
                      onChange={(e) => setDraftPrompt(e.target.value)}
                      maxLength={PROMPT_MAX}
                      rows={4}
                      className="w-full resize-none rounded-xl border border-border-hair bg-surface-inset px-4 py-3 text-sm leading-relaxed text-fg outline-none transition-colors focus:border-border-accent"
                    />
                  </div>

                  <SettingsPanel
                    compact
                    settings={draft}
                    onChange={(patch) => setDraft((s) => ({ ...s, ...patch }))}
                  />

                  <Button
                    fullWidth
                    icon={<RefreshCw size={15} />}
                    onClick={() => onRemake(draftPrompt, draft)}
                  >
                    Remake video
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  )
}

export function FailureView({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-2xl"
    >
      <Card className="p-8 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[color-mix(in_oklab,var(--color-danger-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_11%,transparent)] text-[var(--color-danger-500)]">
          <AlertTriangle size={22} />
        </span>
        <h2 className="font-display text-xl font-semibold text-fg">Generation failed</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
          Something broke partway through the pipeline. Your quota was not affected.
        </p>
        <pre className="mt-5 max-h-48 overflow-auto rounded-xl border border-border-hair bg-surface-inset p-4 text-left font-mono text-2xs leading-relaxed text-fg-subtle">
          {detail}
        </pre>
        <Button className="mt-6" variant="secondary" icon={<RefreshCw size={15} />} onClick={onRetry}>
          Try again
        </Button>
      </Card>
    </motion.div>
  )
}
