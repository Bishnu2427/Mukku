import { motion } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SegOption<T extends string | number> {
  value: T
  label: ReactNode
  hint?: string
}

interface Props<T extends string | number> {
  options: readonly SegOption<T>[]
  value: T
  onChange: (v: T) => void
  label?: string
  /** Horizontal scroll instead of wrap — for long rows like the 12 languages. */
  scroll?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Segmented control with a shared layout pill that slides between options.
 * Replaces the legacy `.seg-control` / `.seg-btn` pattern, keeping the same
 * value semantics so backend payloads are unchanged.
 */
export function SegControl<T extends string | number>({
  options, value, onChange, label, scroll = false, size = 'md', className,
}: Props<T>) {
  // Scopes the sliding pill so multiple controls don't animate into each other.
  const groupId = useId()

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <span className="label-mono">{label}</span>}
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          'flex gap-1 rounded-xl border border-border-hair bg-surface-inset p-1',
          scroll ? 'no-scrollbar overflow-x-auto' : 'flex-wrap',
        )}
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={String(opt.value)}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              title={opt.hint}
              className={cn(
                'relative shrink-0 rounded-lg font-medium transition-colors duration-200',
                size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
                active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
              )}
            >
              {active && (
                <motion.span
                  layoutId={`seg-${groupId}`}
                  className="absolute inset-0 rounded-lg border border-border-accent bg-brand-soft"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                />
              )}
              <span className="relative z-10 whitespace-nowrap">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
