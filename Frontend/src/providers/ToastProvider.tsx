import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; message: string }

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void
  success: (m: string) => void
  error: (m: string) => void
  info: (m: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)

const ICONS = { success: CheckCircle2, error: XCircle, info: Info } as const

const TONE: Record<ToastKind, string> = {
  success: 'border-[color-mix(in_oklab,var(--color-success-500)_38%,transparent)] text-[var(--color-success-500)]',
  error:   'border-[color-mix(in_oklab,var(--color-danger-500)_38%,transparent)] text-[var(--color-danger-500)]',
  info:    'border-border-accent text-brand',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const seq = useRef(0)

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++seq.current
    setItems((prev) => [...prev.slice(-3), { id, kind, message }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200)
  }, [])

  const api = useMemo<ToastCtx>(
    () => ({
      toast,
      success: (m) => toast(m, 'success'),
      error: (m) => toast(m, 'error'),
      info: (m) => toast(m, 'info'),
    }),
    [toast],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[200] flex flex-col items-end gap-2"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = ICONS[t.kind]
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 18, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className={cn(
                  'pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border',
                  'bg-surface px-4 py-3 text-sm shadow-[var(--shadow-lg)] backdrop-blur-xl',
                  TONE[t.kind],
                )}
              >
                <Icon size={16} className="shrink-0" />
                <span className="text-fg">{t.message}</span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
