import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Film, Paperclip, UploadCloud, X } from 'lucide-react'
import { EXAMPLE_PROMPTS, PROMPT_MAX, UPLOAD } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (v: string) => void
  files: File[]
  onFilesChange: (f: File[]) => void
  onSubmit: () => void
  disabled?: boolean
}

/** Object URLs must be revoked or the tab leaks memory on every re-render. */
function useObjectUrls(files: File[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const f of files) {
      if (f.type.startsWith('image/')) next[`${f.name}:${f.size}`] = URL.createObjectURL(f)
    }
    setUrls(next)
    return () => Object.values(next).forEach(URL.revokeObjectURL)
  }, [files])
  return urls
}

export function Composer({ value, onChange, files, onFilesChange, onSubmit, disabled }: Props) {
  const [dragging, setDragging] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const urls = useObjectUrls(files)

  const addFiles = useCallback(
    (incoming: File[]) => {
      const next = [...files]
      const problems: string[] = []
      for (const f of incoming) {
        if (!UPLOAD.allowedTypes.includes(f.type)) { problems.push(`${f.name}: unsupported type`); continue }
        if (f.size > UPLOAD.maxBytes) { problems.push(`${f.name}: over 50 MB`); continue }
        if (next.length >= UPLOAD.maxFiles) { problems.push(`Maximum ${UPLOAD.maxFiles} files`); break }
        if (next.some((x) => x.name === f.name && x.size === f.size)) continue
        next.push(f)
      }
      onFilesChange(next)
      setWarning(problems.length ? problems[0] : null)
      if (problems.length) setTimeout(() => setWarning(null), 4000)
    },
    [files, onFilesChange],
  )

  // Ctrl/Cmd+Enter submits, matching the legacy shortcut.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        addFiles(Array.from(e.dataTransfer.files))
      }}
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-200',
        dragging
          ? 'border-border-accent shadow-[0_0_0_4px_var(--brand-ring)]'
          : 'border-border-hair focus-within:border-border-accent',
      )}
    >
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 grid place-items-center gap-2 bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 text-brand">
              <UploadCloud size={34} />
              <span className="text-sm font-medium">Drop to attach</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={areaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={PROMPT_MAX}
        rows={6}
        disabled={disabled}
        placeholder={
          'Describe your video in detail…\n\ne.g. A step-by-step guide to healthy meal prep for busy professionals — quick recipes, storage tips, and a weekly plan.'
        }
        className="w-full resize-none bg-transparent px-5 pt-5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle disabled:opacity-60"
      />

      {/* Attachments */}
      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 px-5 pb-1 pt-3">
              {files.map((f, i) => {
                const key = `${f.name}:${f.size}`
                const isVideo = f.type.startsWith('video/')
                return (
                  <motion.div
                    key={key}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="group flex items-center gap-2 rounded-lg border border-border-hair bg-surface-2 py-1 pl-1 pr-2"
                  >
                    {isVideo ? (
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-soft text-brand">
                        <Film size={13} />
                      </span>
                    ) : (
                      <img src={urls[key]} alt="" className="h-7 w-7 rounded-md object-cover" />
                    )}
                    <span className="max-w-[120px] truncate text-xs text-fg-muted">{f.name}</span>
                    <button
                      onClick={() => onFilesChange(files.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${f.name}`}
                      className="text-fg-subtle transition-colors hover:text-[var(--color-danger-500)]"
                    >
                      <X size={13} />
                    </button>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border-hair px-4 py-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={UPLOAD.accept}
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
            files.length
              ? 'border-border-accent bg-brand-soft text-brand'
              : 'border-border-hair text-fg-muted hover:border-border-strong hover:text-fg',
          )}
        >
          <Paperclip size={13} />
          {files.length ? `${files.length} attached` : 'Attach media'}
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-mono">Try</span>
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex.label}
              onClick={() => { onChange(ex.text); areaRef.current?.focus() }}
              className="rounded-md border border-border-hair px-2 py-1 text-2xs text-fg-muted transition-colors hover:border-border-accent hover:text-brand"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <span className="ml-auto font-mono text-2xs text-fg-subtle">
          {value.length}/{PROMPT_MAX}
        </span>
      </div>

      <AnimatePresence>
        {warning && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border-hair px-5 py-2 text-xs text-[var(--color-danger-500)]"
          >
            {warning}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
