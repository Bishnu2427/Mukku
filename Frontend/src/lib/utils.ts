import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware className merge. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/* ── Formatting ───────────────────────────────────────────────────────────── */

export const fmtNumber = (n: number) => Number(n ?? 0).toLocaleString()

export const fmtBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export function fmtDate(iso?: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en', opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** "just now" · "12m ago" · "3h ago" · "5d ago" */
export function relTime(iso?: string | null) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const mins = Math.floor((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

/** "Today" · "Yesterday" · "5d ago" — used in admin tables. */
export function relDate(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export const truncate = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n)}…` : s

export const initials = (name?: string | null) =>
  (name?.trim()?.[0] ?? 'U').toUpperCase()

export const firstName = (name?: string | null) =>
  (name ?? '').trim().split(/\s+/)[0] || 'there'

/** Password rules — must mirror backend/auth.py `_validate_password`. */
export function passwordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: /[!@#$%^&*()\-_=+[\]{};:'",.<>?/\\|`~]/.test(pw),
  }
}

export function passwordStrength(pw: string) {
  if (!pw) return { score: 0, label: 'Enter a password', pct: 0 }
  const c = passwordChecks(pw)
  let score = 0
  if (c.length) score++
  if (pw.length >= 12) score++
  if (c.upper) score++
  if (c.digit) score++
  if (c.special) score++
  const pct = [0, 25, 45, 65, 82, 100][score]
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][score]
  return { score, label, pct }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
