import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE =
  'w-full rounded-xl border border-border-hair bg-surface-inset text-fg placeholder:text-fg-subtle ' +
  'transition-[border-color,box-shadow,background] duration-200 outline-none ' +
  'focus:border-border-accent focus:bg-surface focus:shadow-[0_0_0_3px_var(--brand-ring)] ' +
  'disabled:cursor-not-allowed disabled:opacity-55'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: ReactNode
  error?: string | null
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, id, type = 'text', ...rest }, ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const isPassword = type === 'password'
  const [reveal, setReveal] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="label-mono">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={!!error}
          className={cn(
            BASE,
            'h-11 px-3.5 text-sm',
            icon && 'pl-10',
            isPassword && 'pr-10',
            error && 'border-[var(--color-danger-500)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-danger-500)_22%,transparent)]',
            className,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors hover:text-fg"
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error ? (
        <span className="text-xs text-[var(--color-danger-500)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-fg-subtle">{hint}</span>
      ) : null}
    </div>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: ReactNode
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, className, id, ...rest }, ref,
) {
  const auto = useId()
  const areaId = id ?? auto
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={areaId} className="label-mono">{label}</label>}
      <textarea
        ref={ref}
        id={areaId}
        className={cn(BASE, 'resize-none px-4 py-3 text-sm leading-relaxed', className)}
        {...rest}
      />
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  )
})
