import { motion, type HTMLMotionProps } from 'motion/react'
import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLMotionProps<'div'> {
  /** Draws the brightening hairline across the top edge. */
  edge?: boolean
  /** Lift + border warm on hover. */
  interactive?: boolean
  inset?: boolean
  children?: ReactNode
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { edge = false, interactive = false, inset = false, className, children, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      whileHover={interactive ? { y: -3 } : undefined}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border-hair',
        inset ? 'bg-surface-inset' : 'bg-surface',
        interactive && 'cursor-pointer transition-colors hover:border-border-accent hover:shadow-[var(--shadow-lg)]',
        className,
      )}
      {...rest}
    >
      {edge && <span className="edge-light absolute inset-x-0 top-0 h-px" aria-hidden />}
      {children}
    </motion.div>
  )
})

export function CardHeader({
  title, subtitle, action, className,
}: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border-hair px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-base font-semibold text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}
