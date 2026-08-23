import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react'
import { cn, initials } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { auth } from '@/lib/api'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: string | number
  /** Section label rendered above this item. */
  section?: string
}

interface Props {
  items: NavItem[]
  active: string
  onNavigate: (id: string) => void
  title: string
  /** Rendered in the sidebar above "Sign out" — quota bar, role badge, etc. */
  sidebarExtra?: ReactNode
  headerActions?: ReactNode
  children: ReactNode
  roleBadge?: ReactNode
}

export function AppShell({
  items, active, onNavigate, title, sidebarExtra, headerActions, children, roleBadge,
}: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  async function signOut() {
    try { await auth.logout() } catch { /* cookie is cleared server-side regardless */ }
    window.location.href = '/login'
  }

  const nav = (
    <>
      <Link to="/" className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border-hair px-5">
        <img src="/static/mukku_logo.png" alt="" className="h-7 w-7 rounded-md" />
        <span className="font-display text-[15px] font-semibold tracking-tight text-fg">
          Mukku<span className="text-brand"> AI</span>
        </span>
        {roleBadge}
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.id === active
          return (
            <div key={item.id}>
              {item.section && (
                <div className="label-mono px-2 pb-1.5 pt-4 first:pt-0">{item.section}</div>
              )}
              <button
                onClick={() => { onNavigate(item.id); setOpen(false) }}
                className={cn(
                  'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  isActive ? 'text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl border border-border-accent bg-brand-soft"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon size={16} className={cn('relative z-10 shrink-0', isActive && 'text-brand')} />
                <span className="relative z-10 font-medium">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="relative z-10 ml-auto rounded-md border border-border-hair bg-surface-2 px-1.5 font-mono text-2xs text-fg-subtle">
                    {item.badge}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-border-hair p-3">
        {sidebarExtra}
        <button
          onClick={signOut}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border-hair py-2.5
                     text-sm text-fg-muted transition-colors hover:border-[color-mix(in_oklab,var(--color-danger-500)_40%,transparent)]
                     hover:text-[var(--color-danger-500)]"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border-hair bg-surface lg:flex">
        {nav}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-[rgb(6_9_18/0.6)] backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border-hair bg-surface lg:hidden"
            >
              {nav}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="glass fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-3 border-b border-border-hair px-4 lg:left-64 lg:px-7">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          className="rounded-lg p-2 text-fg-muted hover:bg-surface-2 hover:text-fg lg:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
        <h1 className="font-display text-base font-semibold text-fg">{title}</h1>
        <div className="ml-auto flex items-center gap-2.5">
          {headerActions}
          <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,var(--color-primary-500),var(--color-lavender-400))] text-xs font-bold text-white">
            {user?.avatar?.startsWith('http')
              ? <img src={user.avatar} alt="" className="h-full w-full object-cover" />
              : initials(user?.name)}
          </span>
        </div>
      </header>

      <main className="px-4 pb-16 pt-24 lg:pl-[17.5rem] lg:pr-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
