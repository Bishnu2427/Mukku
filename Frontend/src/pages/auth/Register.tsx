import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, Mail, User } from 'lucide-react'
import { Alert, AuthLayout, GoogleButton, OrDivider } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { auth } from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'
import { passwordChecks } from '@/lib/utils'

export default function Register() {
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) return setError('Please enter your full name.')
    if (name.trim().length < 2) return setError('Name must be at least 2 characters.')
    if (!email.trim()) return setError('Please enter your email address.')

    const c = passwordChecks(password)
    if (!c.length) return setError('Password must be at least 8 characters.')
    if (!c.upper) return setError('Password must contain at least one uppercase letter.')
    if (!c.digit) return setError('Password must contain at least one number.')
    if (!c.special) return setError('Password must contain at least one special character.')
    if (!terms) return setError('Please accept the Terms of Service to continue.')

    setBusy(true)
    try {
      const res = await auth.register(name.trim(), email.trim(), password)
      setOk(true)
      await refresh()
      setTimeout(() => navigate(res.redirect || '/dashboard', { replace: true }), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Three free videos every month. No credit card required."
      footer={
        <>Already have an account? <Link to="/login" className="font-medium text-brand hover:underline">Sign in</Link></>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      {ok && <Alert kind="success">Account created — taking you to your dashboard…</Alert>}

      <GoogleButton label="Sign up with Google" />
      <OrDivider label="or with email" />

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label="Full name"
          autoComplete="name"
          placeholder="Your name"
          icon={<User size={15} />}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon={<Mail size={15} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-2.5">
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="8+ chars, uppercase, number, symbol"
            icon={<KeyRound size={15} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrength value={password} />
        </div>

        <label className="flex cursor-pointer select-none items-start gap-2.5 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
          />
          <span>
            I agree to the <a href="#" className="text-brand hover:underline">Terms of Service</a>
            {' and '}
            <a href="#" className="text-brand hover:underline">Privacy Policy</a>
          </span>
        </label>

        <Button type="submit" fullWidth loading={busy} iconRight={<ArrowRight size={15} />}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
