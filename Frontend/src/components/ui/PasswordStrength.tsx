import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { passwordChecks, passwordStrength } from '@/lib/utils'
import { cn } from '@/lib/utils'

const COLORS = ['#e05b72', '#e0763b', '#e0a85c', '#7fbf8f', '#3eaf8f', '#6478d4']

const RULES = [
  { key: 'length',  label: '8+ characters' },
  { key: 'upper',   label: 'Uppercase letter' },
  { key: 'digit',   label: 'Number' },
  { key: 'special', label: 'Special character' },
] as const

/** Mirrors backend/auth.py `_validate_password` so the client never promises
 *  something the server will reject. */
export function PasswordStrength({ value }: { value: string }) {
  const { score, label, pct } = passwordStrength(value)
  const checks = passwordChecks(value)
  const color = COLORS[Math.max(0, score - 1)] ?? COLORS[0]

  return (
    <div className="flex flex-col gap-2.5">
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full rounded-full"
          animate={{ width: `${pct}%`, backgroundColor: value ? color : 'transparent' }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <span className="text-xs" style={{ color: value ? color : 'var(--text-subtle)' }}>
        {label}
      </span>

      {value.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="grid grid-cols-2 gap-x-3 gap-y-1.5"
        >
          {RULES.map((r) => {
            const met = checks[r.key]
            return (
              <span
                key={r.key}
                className={cn(
                  'flex items-center gap-1.5 text-xs transition-colors',
                  met ? 'text-[var(--color-success-500)]' : 'text-fg-subtle',
                )}
              >
                <span
                  className={cn(
                    'grid h-3.5 w-3.5 place-items-center rounded-full border transition-colors',
                    met
                      ? 'border-[var(--color-success-500)] bg-[color-mix(in_oklab,var(--color-success-500)_20%,transparent)]'
                      : 'border-border-strong',
                  )}
                >
                  {met && <Check size={9} strokeWidth={3.5} />}
                </span>
                {r.label}
              </span>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
