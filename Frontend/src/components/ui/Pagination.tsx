import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  page: number
  pages: number
  total: number
  limit: number
  onChange: (page: number) => void
}

export function Pagination({ page, pages, total, limit, onChange }: Props) {
  if (total === 0) return null

  const from = Math.min((page - 1) * limit + 1, total)
  const to = Math.min(page * limit, total)

  // Window of five around the current page, matching the legacy admin UI.
  const window: number[] = []
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) window.push(i)

  const btn = 'grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-xs transition-colors disabled:opacity-40 disabled:pointer-events-none'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-hair px-5 py-3">
      <span className="font-mono text-2xs text-fg-subtle">
        {from}–{to} of {total}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button
            className={cn(btn, 'border-border-hair text-fg-muted hover:text-fg')}
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={13} />
          </button>
          {window.map((p) => (
            <button
              key={p}
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(
                btn,
                p === page
                  ? 'border-border-accent bg-brand-soft text-brand'
                  : 'border-border-hair text-fg-muted hover:text-fg',
              )}
            >
              {p}
            </button>
          ))}
          {window[window.length - 1] < pages && (
            <>
              <span className="px-1 text-xs text-fg-subtle">…</span>
              <button
                className={cn(btn, 'border-border-hair text-fg-muted hover:text-fg')}
                onClick={() => onChange(pages)}
              >
                {pages}
              </button>
            </>
          )}
          <button
            className={cn(btn, 'border-border-hair text-fg-muted hover:text-fg')}
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Shared table chrome so every admin table lines up. */
export function Th({ children }: { children: React.ReactNode }) {
  return <th className="label-mono whitespace-nowrap px-5 py-3 text-left font-medium">{children}</th>
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-5 py-3 text-sm text-fg-muted', className)}>{children}</td>
}
