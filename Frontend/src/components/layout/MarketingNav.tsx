import { AnimatePresence, motion, useScroll, useMotionValueEvent } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { cn, firstName, initials } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#platforms', label: 'Platforms' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#contact', label: 'Contact' },
]

export function MarketingNav() {
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 40))

  return (
    <>
      <motion.header
        initial={{ y: -70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'fixed inset-x-0 top-0 z-[120] transition-[background,border-color,backdrop-filter] duration-300',
          scrolled
            ? 'glass border-b border-border-hair'
            : 'border-b border-transparent bg-transparent',
        )}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/static/mukku_logo.png" alt="" className="h-7 w-7 rounded-md" />
            <span className="font-display text-[15px] font-semibold tracking-tight text-fg">
              Mukku<span className="text-brand"> AI</span>
            </span>
          </Link>

          <div className="hidden flex-1 items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {user ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-2.5 rounded-full border border-border-hair py-1 pl-1 pr-3.5 transition-colors hover:border-border-accent"
              >
                <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,var(--color-primary-500),var(--color-lavender-400))] text-2xs font-bold text-white">
                  {user.avatar?.startsWith('http')
                    ? <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                    : initials(user.name)}
                </span>
                <span className="hidden text-sm font-medium text-fg sm:block">
                  {firstName(user.name)}
                </span>
              </Link>
            ) : (
              <Link to="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
            )}

            <Link to={user ? '/studio' : '/register'}>
              <Button size="sm">{user ? 'Open Studio' : 'Start free'}</Button>
            </Link>

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="glass fixed inset-x-0 top-16 z-[119] border-b border-border-hair px-5 py-4 lg:hidden"
          >
            <div className="flex flex-col gap-1">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  {l.label}
                </a>
              ))}
              {!user && (
                <Link to="/login" onClick={() => setOpen(false)} className="mt-1">
                  <Button variant="secondary" fullWidth size="sm">Sign in</Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
