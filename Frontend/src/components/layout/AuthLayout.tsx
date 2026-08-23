import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'

interface Props {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Shared frame for sign-in, register and the password-reset flow. */
export function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-5 py-12">
      {/* Same dusk wash as the hero, dialled back so the form stays dominant */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="animate-drift absolute -left-[15%] -top-[20%] h-[60vh] w-[60vw] rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(circle, var(--aurora-1), transparent 70%)' }}
        />
        <div
          className="animate-drift absolute -bottom-[20%] -right-[10%] h-[50vh] w-[50vw] rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(circle, var(--aurora-2), transparent 70%)', animationDelay: '-11s' }}
        />
      </div>
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[420px]"
      >
        <Link to="/" className="mb-7 flex items-center justify-center gap-2.5">
          <img src="/static/mukku_logo.png" alt="" className="h-8 w-8 rounded-md" />
          <span className="font-display text-lg font-semibold tracking-tight text-fg">
            Mukku<span className="text-brand"> AI</span>
          </span>
        </Link>

        <Card edge className="p-7 sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </Card>

        {footer && <div className="mt-6 text-center text-sm text-fg-muted">{footer}</div>}
      </motion.div>
    </div>
  )
}

/** Google OAuth entry. A real link, not fetch — it is a browser redirect. */
export function GoogleButton({ label }: { label: string }) {
  return (
    <a
      href="/api/auth/google"
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-border-strong
                 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      {label}
    </a>
  )
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border-hair" />
      <span className="label-mono">{label}</span>
      <span className="h-px flex-1 bg-border-hair" />
    </div>
  )
}

export function Alert({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const danger = kind === 'error'
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 rounded-xl border px-4 py-3 text-sm"
      style={{
        borderColor: `color-mix(in oklab, var(${danger ? '--color-danger-500' : '--color-success-500'}) 32%, transparent)`,
        background: `color-mix(in oklab, var(${danger ? '--color-danger-500' : '--color-success-500'}) 10%, transparent)`,
        color: `var(${danger ? '--color-danger-500' : '--color-success-500'})`,
      }}
    >
      {children}
    </motion.div>
  )
}
