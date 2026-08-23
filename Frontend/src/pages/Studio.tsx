import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LayoutGrid, Lock, Sparkles } from 'lucide-react'
import { MarketingNav } from '@/components/layout/MarketingNav'
import { Composer } from '@/components/studio/Composer'
import { SettingsPanel } from '@/components/studio/SettingsPanel'
import { ProgressView } from '@/components/studio/ProgressView'
import { FailureView, ResultView } from '@/components/studio/ResultView'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useAuth } from '@/providers/AuthProvider'
import { useGeneration } from '@/hooks/useGeneration'
import { videos } from '@/lib/api'
import type { Settings } from '@/lib/types'

const DEFAULTS: Settings = {
  duration: 60,
  tone: 'educational',
  image_style: 'photorealistic',
  aspect_ratio: '16:9',
  voice_gender: 'auto',
  include_music: true,
  platform: '',
  language: 'en',
}

export default function Studio() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  const [prompt, setPrompt] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [confirmBack, setConfirmBack] = useState(false)

  const onUnauthorized = useCallback(() => navigate('/login'), [navigate])
  const gen = useGeneration(onUnauthorized)

  // "Remake" from the dashboard arrives as /studio?remake=<projectId>.
  // Pull that project's prompt and settings back into the composer so the user
  // edits an existing idea rather than retyping it.
  const [params, setParams] = useSearchParams()
  const remakeId = params.get('remake')

  useEffect(() => {
    if (!remakeId) return
    let cancelled = false
    videos
      .status(remakeId)
      .then((p) => {
        if (cancelled) return
        if (p.prompt) setPrompt(p.prompt)
        if (p.settings) setSettings((s) => ({ ...s, ...p.settings }))
      })
      .catch(() => { /* project gone or not ours — leave the composer empty */ })
      .finally(() => {
        if (!cancelled) {
          // Drop the param so a refresh doesn't re-prefill over later edits.
          setParams({}, { replace: true })
        }
      })
    return () => { cancelled = true }
  }, [remakeId, setParams])

  const patch = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }))

  const submit = () => gen.start(prompt, settings, files)

  const remake = (nextPrompt: string, nextSettings: Settings) => {
    setPrompt(nextPrompt)
    setSettings(nextSettings)
    gen.start(nextPrompt, nextSettings, files)
  }

  const locked = !loading && !user

  return (
    <div className="min-h-screen bg-bg">
      <MarketingNav />

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 lg:px-8">
        <AnimatePresence mode="wait">
          {/* ── Signed out ─────────────────────────────────────────────── */}
          {locked && (
            <motion.div
              key="wall"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-md"
            >
              <Card edge className="p-8 text-center">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border-accent bg-brand-soft text-brand">
                  <Lock size={22} />
                </span>
                <h1 className="font-display text-xl font-semibold text-fg">
                  Sign in to start creating
                </h1>
                <p className="mx-auto mt-2 max-w-xs text-sm text-fg-muted">
                  Create a free account and get three videos every month. No card required.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                  <Link to="/register"><Button>Create free account</Button></Link>
                  <Link to="/login"><Button variant="secondary">Sign in</Button></Link>
                </div>
              </Card>
            </motion.div>
          )}

          {/* ── Composer ───────────────────────────────────────────────── */}
          {!locked && gen.phase === 'idle' && (
            <motion.div
              key="compose"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <span className="label-mono text-brand">Studio</span>
                  <h1 className="mt-1.5 font-display text-3xl font-semibold text-fg">
                    Create your video
                  </h1>
                  <p className="mt-1.5 text-sm text-fg-muted">
                    Describe it, attach any media of your own, pick a platform, generate.
                  </p>
                </div>
                <Link to="/dashboard">
                  <Button variant="secondary" size="sm" icon={<LayoutGrid size={14} />}>
                    My videos
                  </Button>
                </Link>
              </div>

              <div className="flex flex-col gap-6">
                <Composer
                  value={prompt}
                  onChange={setPrompt}
                  files={files}
                  onFilesChange={setFiles}
                  onSubmit={submit}
                />

                <Card className="p-5 sm:p-6">
                  <SettingsPanel settings={settings} onChange={patch} />
                </Card>

                {gen.error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-danger-500)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_9%,transparent)] px-4 py-3 text-sm text-[var(--color-danger-500)]"
                  >
                    <span>{gen.error}</span>
                    {gen.quotaExceeded && (
                      <Link to="/dashboard" className="ml-auto">
                        <Button size="sm" variant="accent">Upgrade plan</Button>
                      </Link>
                    )}
                  </motion.div>
                )}

                <Button
                  size="lg"
                  fullWidth
                  icon={<Sparkles size={17} />}
                  onClick={submit}
                  disabled={prompt.trim().length < 10}
                >
                  Generate video
                </Button>
                <p className="text-center text-xs text-fg-subtle">
                  Press <kbd className="rounded border border-border-hair px-1">Ctrl</kbd>
                  {' + '}
                  <kbd className="rounded border border-border-hair px-1">Enter</kbd> to generate
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Running ────────────────────────────────────────────────── */}
          {gen.phase === 'running' && (
            <motion.div key="run" exit={{ opacity: 0 }}>
              <ProgressView
                status={gen.status}
                waitMessage={gen.waitMessage}
                onBack={() => setConfirmBack(true)}
              />
            </motion.div>
          )}

          {/* ── Done ───────────────────────────────────────────────────── */}
          {gen.phase === 'done' && gen.projectId && (
            <motion.div key="done">
              <ResultView
                projectId={gen.projectId}
                prompt={prompt}
                settings={settings}
                onCreateAnother={() => { gen.reset(); setFiles([]) }}
                onRemake={remake}
              />
            </motion.div>
          )}

          {/* ── Failed ─────────────────────────────────────────────────── */}
          {gen.phase === 'failed' && (
            <motion.div key="fail">
              <FailureView detail={gen.failure ?? 'Unknown error'} onRetry={gen.reset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ConfirmDialog
        open={confirmBack}
        onClose={() => setConfirmBack(false)}
        onConfirm={gen.reset}
        title="Stop watching this generation?"
        message="The video keeps rendering on the server — you can pick it up from your dashboard when it finishes."
        confirmLabel="Go back"
        danger={false}
      />
    </div>
  )
}
