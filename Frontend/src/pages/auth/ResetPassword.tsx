import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react'
import { Alert, AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { PageLoader } from '@/components/ui/PageLoader'
import { auth } from '@/lib/api'
import { passwordChecks } from '@/lib/utils'

type State = 'checking' | 'invalid' | 'form' | 'done'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [state, setState] = useState<State>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!token) { setState('invalid'); return }
    auth
      .verifyResetToken(token)
      .then((r) => { if (!cancelled) setState(r.valid ? 'form' : 'invalid') })
      .catch(() => { if (!cancelled) setState('invalid') })
    return () => { cancelled = true }
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const c = passwordChecks(password)
    if (!c.length) return setError('Password must be at least 8 characters.')
    if (!c.upper) return setError('Password must contain at least one uppercase letter.')
    if (!c.digit) return setError('Password must contain at least one number.')
    if (!c.special) return setError('Password must contain at least one special character.')
    if (password !== confirm) return setError('Passwords do not match.')

    setBusy(true)
    try {
      await auth.resetPassword(token, password)
      setState('done')
      setTimeout(() => navigate('/login', { replace: true }), 2600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.')
      setBusy(false)
    }
  }

  if (state === 'checking') return <PageLoader />

  if (state === 'invalid') {
    return (
      <AuthLayout title="Link expired" subtitle="This reset link is invalid or has already been used.">
        <div className="flex flex-col items-center gap-4 py-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[color-mix(in_oklab,var(--color-danger-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_11%,transparent)] text-[var(--color-danger-500)]">
            <ShieldAlert size={24} />
          </span>
          <p className="text-sm text-fg-muted">Reset links are valid for one hour and can be used once.</p>
          <Link to="/forgot-password" className="mt-1">
            <Button>Request a new link</Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  if (state === 'done') {
    return (
      <AuthLayout title="Password updated" subtitle="You can now sign in with your new password.">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 py-3 text-center"
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[color-mix(in_oklab,var(--color-success-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-success-500)_12%,transparent)] text-[var(--color-success-500)]">
            <CheckCircle2 size={24} />
          </span>
          <p className="text-sm text-fg-muted">
            All other sessions were signed out for your security. Redirecting…
          </p>
          <Link to="/login"><Button>Sign in</Button></Link>
        </motion.div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose something strong you have not used before."
      footer={<Link to="/login" className="text-brand hover:underline">← Back to sign in</Link>}
    >
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="8+ chars, uppercase, number, symbol"
            icon={<KeyRound size={15} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrength value={password} />
        </div>
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter password"
          icon={<KeyRound size={15} />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirm && password !== confirm ? 'Passwords do not match' : null}
        />
        <Button type="submit" fullWidth loading={busy}>Update password</Button>
      </form>
    </AuthLayout>
  )
}
