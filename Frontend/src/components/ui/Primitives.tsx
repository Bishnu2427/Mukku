import { motion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ── Badge ────────────────────────────────────────────────────────────────── */

type BadgeTone = 'neutral' | 'brand' | 'success' | 'danger' | 'accent' | 'lavender'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral:  'border-border-hair bg-surface-2 text-fg-muted',
  brand:    'border-border-accent bg-brand-soft text-brand',
  lavender: 'border-[color-mix(in_oklab,var(--color-lavender-400)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-lavender-400)_13%,transparent)] text-[var(--color-lavender-400)]',
  success:  'border-[color-mix(in_oklab,var(--color-success-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-success-500)_13%,transparent)] text-[var(--color-success-500)]',
  danger:   'border-[color-mix(in_oklab,var(--color-danger-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_13%,transparent)] text-[var(--color-danger-500)]',
  accent:   'border-[color-mix(in_oklab,var(--color-amber-500)_36%,transparent)] bg-accent-soft text-accent',
}

export function Badge({
  children, tone = 'neutral', mono = true, dot = false, className,
}: {
  children: ReactNode
  tone?: BadgeTone
  mono?: boolean
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-medium',
        mono && 'font-mono uppercase tracking-[0.08em]',
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** Live status dot with a breathing halo — used for "processing". */
export function PulseDot({ tone = 'brand' }: { tone?: 'brand' | 'success' | 'danger' | 'accent' }) {
  const color = {
    brand: 'var(--brand)',
    success: 'var(--color-success-500)',
    danger: 'var(--color-danger-500)',
    accent: 'var(--accent)',
  }[tone]
  return (
    <span className="relative flex h-2 w-2">
      <motion.span
        className="absolute inline-flex h-full w-full rounded-full"
        style={{ background: color }}
        animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
      />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  )
}

/* ── Skeleton ─────────────────────────────────────────────────────────────── */

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-surface-2', className)} style={style}>
      <div className="animate-shimmer absolute inset-0" />
    </div>
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ['100%', '92%', '96%', '78%', '88%', '70%']
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  )
}

/* ── Progress ─────────────────────────────────────────────────────────────── */

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <motion.div
        className="relative h-full rounded-full
                   bg-[linear-gradient(90deg,var(--color-primary-500),var(--color-lavender-400)_60%,var(--color-amber-500))]"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 26 }}
      >
        {/* travelling glint so the bar reads as alive even between updates */}
        <span
          className="absolute inset-y-0 w-16 opacity-70"
          style={{
            background: 'linear-gradient(90deg,transparent,rgb(255 255 255/0.55),transparent)',
            animation: 'mk-sweep 2.2s var(--ease-in-out-soft) infinite',
          }}
        />
      </motion.div>
    </div>
  )
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

export function EmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="mb-1 text-fg-subtle opacity-70">{icon}</div>}
      <h3 className="font-display text-lg font-semibold text-fg">{title}</h3>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ── Section heading ──────────────────────────────────────────────────────── */

export function SectionHeading({
  eyebrow, title, description, align = 'center',
}: { eyebrow?: string; title: ReactNode; description?: ReactNode; align?: 'center' | 'left' }) {
  return (
    <div className={cn('flex flex-col gap-3', align === 'center' ? 'items-center text-center' : 'items-start')}>
      {eyebrow && (
        <motion.span
          className="label-mono text-brand"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
        >
          {eyebrow}
        </motion.span>
      )}
      <motion.h2
        className="max-w-2xl font-display text-3xl font-semibold text-fg sm:text-4xl"
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {title}
      </motion.h2>
      {description && (
        <motion.p
          className="max-w-xl text-base text-fg-muted"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          {description}
        </motion.p>
      )}
    </div>
  )
}
