import { useState } from 'react'
import { motion } from 'motion/react'
import { Download, Film, Play, RefreshCw, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Primitives'
import { videos } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useToast } from '@/providers/ToastProvider'
import { fmtDate, truncate } from '@/lib/utils'
import type { Project } from '@/lib/types'

const STATUS_TONE = {
  completed: 'success',
  failed: 'danger',
  processing: 'brand',
  queued: 'neutral',
} as const

export function VideoCard({
  project, index = 0, onDeleted,
}: {
  project: Project
  index?: number
  /** Called after a successful delete so the parent can drop it from the list. */
  onDeleted?: (projectId: string) => void
}) {
  const [playing, setPlaying] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const toast = useToast()

  const rendering = project.status === 'processing' || project.status === 'queued'

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await videos.remove(project.project_id)
      toast.success(
        res.files_removed
          ? `Video deleted · ${res.files_removed} file${res.files_removed === 1 ? '' : 's'} removed`
          : 'Video deleted',
      )
      onDeleted?.(project.project_id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete this video.')
      setDeleting(false)
    }
  }
  const done = project.status === 'completed'
  const tone = STATUS_TONE[project.status] ?? 'neutral'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.4 }}
    >
      <Card className="group flex h-full flex-col overflow-hidden">
        <div className="relative aspect-video bg-[linear-gradient(135deg,var(--brand-soft),var(--surface-3))]">
          {playing && done ? (
            <video
              src={videos.streamUrl(project.project_id)}
              controls
              autoPlay
              className="h-full w-full bg-black object-contain"
            />
          ) : (
            <>
              {done && project.has_video && !thumbFailed ? (
                <img
                  src={videos.thumbnailUrl(project.project_id)}
                  alt=""
                  loading="lazy"
                  onError={() => setThumbFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-fg-subtle">
                  <Film size={26} className="opacity-50" />
                </div>
              )}

              {done && (
                <button
                  onClick={() => setPlaying(true)}
                  aria-label="Play video"
                  className="absolute inset-0 grid place-items-center bg-[rgb(6_9_18/0.25)] opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-white/30 bg-white/15 backdrop-blur-md">
                    <Play size={17} className="ml-0.5 fill-white text-white" />
                  </span>
                </button>
              )}

              <span className="absolute left-2.5 top-2.5">
                <Badge tone={tone}>{project.status}</Badge>
              </span>
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="line-clamp-2 text-sm leading-relaxed text-fg">
            {truncate(project.prompt || '(no description)', 110)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs text-fg-subtle">
            <span>{fmtDate(project.created_at, { month: 'short', day: 'numeric' })}</span>
            {project.settings?.duration && <><span>·</span><span>{project.settings.duration}s</span></>}
            {project.settings?.language && <><span>·</span><span>{project.settings.language}</span></>}
            {project.settings?.aspect_ratio && <><span>·</span><span>{project.settings.aspect_ratio}</span></>}
          </div>

          <div className="mt-auto flex gap-2 pt-4">
            {done && (
              <a href={videos.downloadUrl(project.project_id)} download className="flex-1">
                <span className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border-hair text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-brand">
                  <Download size={12} />
                  Download
                </span>
              </a>
            )}
            <a
              href={`/studio?remake=${encodeURIComponent(project.project_id)}`}
              className="flex-1"
            >
              <span className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border-hair text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-brand">
                <RefreshCw size={12} />
                Remake
              </span>
            </a>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting || rendering}
              title={rendering ? 'Wait for this video to finish rendering' : 'Delete permanently'}
              aria-label="Delete video"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-border-hair text-fg-subtle transition-colors hover:border-[var(--color-danger-500)] hover:text-[var(--color-danger-500)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete this video?"
        message="The video, its scene images, clips and voice tracks, and anything you uploaded for it are removed permanently. This cannot be undone."
        confirmLabel="Delete permanently"
      />
    </motion.div>
  )
}
