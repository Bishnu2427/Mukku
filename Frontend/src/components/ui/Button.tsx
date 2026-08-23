import { motion, type HTMLMotionProps } from 'motion/react'
import { forwardRef, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  // Gradient runs periwinkle → lavender, the two sky tones from the reference.
  primary:
    'text-white border-transparent shadow-[var(--shadow-glow)] ' +
    'bg-[linear-gradient(120deg,var(--color-primary-600),var(--color-primary-500)_55%,var(--color-lavender-500))] ' +
    'hover:brightness-110',
  // Amber is the single warm note — reserved for "make something happen".
  accent:
    'text-[#22160a] border-transparent ' +
    'bg-[linear-gradient(120deg,var(--color-amber-500),var(--color-amber-400))] ' +
    'hover:brightness-105 shadow-[0_8px_28px_-8px_rgb(224_168_92/0.5)]',
  secondary:
    'bg-surface-2 text-fg border-border-hair hover:border-border-strong hover:bg-surface-3',
  ghost:
    'bg-transparent text-fg-muted border-transparent hover:bg-surface-2 hover:text-fg',
  danger:
    'bg-[color-mix(in_oklab,var(--color-danger-500)_12%,transparent)] ' +
    'text-[var(--color-danger-500)] border-[color-mix(in_oklab,var(--color-danger-500)_32%,transparent)] ' +
    'hover:bg-[color-mix(in_oklab,var(--color-danger-500)_20%,transparent)]',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
}

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
  fullWidth?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, fullWidth,
    className, children, disabled, ...rest },
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <motion.button
      ref={ref}
      disabled={isDisabled}
      whileHover={isDisabled ? undefined : { y: -1 }}
      whileTap={isDisabled ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 480, damping: 30 }}
      className={cn(
        'relative inline-flex select-none items-center justify-center overflow-hidden',
        'border font-medium tracking-[-0.01em] whitespace-nowrap',
        'transition-[background,border-color,color,filter] duration-200',
        'disabled:pointer-events-none disabled:opacity-55',
        SIZES[size],
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </motion.button>
  )
})
