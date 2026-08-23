import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { Alert, AuthLayout, GoogleButton, OrDivider } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { auth } from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_not_configured: 'Google sign-in is not configured on this server.',
  google_no_token: 'Google did not return a token. Please try again.',
  google_missing_info: 'Google did not share enough profile information.',
  account_disabled: 'Your account has been disabled. Contact support.',
}

export default function Login() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [params] = useSearchParams()

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const otpRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    const e = params.get('error')
    if (e) setError(GOOGLE_ERRORS[e] ?? 'Sign-in failed. Please try again.')
  }, [params])

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus()
  }, [step])

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Please fill in both fields.')
      return
    }
    setBusy(true)
    try {
      const res = await auth.login(email.trim(), password, remember)
      if (res.status === 'otp_required') {
        setOtpToken(res.otp_token)
        setStep('otp')
        submittedRef.current = false
      } else {
        await refresh()
        navigate(res.redirect || '/dashboard', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  async function submitOtp(code: string) {
    if (submittedRef.current) return
    submittedRef.current = true
    setError(null)
    setBusy(true)
    try {
      const res = await auth.verifyOtp(otpToken, code, remember)
      await refresh()
      navigate(res.redirect || '/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code.')
      setOtp('')
      submittedRef.current = false
      otpRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  /** Auto-submit the moment six digits are present — matches the old UX. */
  function onOtpChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 6)
    setOtp(digits)
    if (digits.length === 6) void submitOtp(digits)
  }

  return (
    <AuthLayout
      title={step === 'credentials' ? 'Welcome back' : 'Check your email'}
      subtitle={
        step === 'credentials' ? (
          <>New here? <Link to="/register" className="text-brand hover:underline">Create an account</Link></>
        ) : (
          'We sent a six-digit code to your email. It expires in 10 minutes.'
        )
      }
      footer={
        step === 'credentials' ? (
          <>Don't have an account? <Link to="/register" className="font-medium text-brand hover:underline">Sign up free</Link></>
        ) : null
      }
    >
      {error && <Alert kind="error">{error}</Alert>}

      <AnimatePresence mode="wait">
        {step === 'credentials' ? (
          <motion.div
            key="creds"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.25 }}
          >
            <GoogleButton label="Continue with Google" />
            <OrDivider label="or with email" />

            <form onSubmit={submitCredentials} className="flex flex-col gap-4">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                icon={<Mail size={15} />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                icon={<KeyRound size={15} />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--brand)]"
                  />
                  Remember me for 7 days
                </label>
                <Link to="/forgot-password" className="text-sm text-brand hover:underline">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" fullWidth loading={busy} iconRight={<ArrowRight size={15} />}>
                Continue
              </Button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.25 }}
          >
            <div className="mb-6 flex justify-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border-accent bg-brand-soft text-brand">
                <ShieldCheck size={24} />
              </span>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); if (otp.length === 6) void submitOtp(otp) }}
              className="flex flex-col gap-4"
            >
              <Input
                ref={otpRef}
                label="Verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={otp}
                onChange={(e) => onOtpChange(e.target.value)}
                className="text-center font-mono text-xl tracking-[0.4em]"
              />
              <Button type="submit" fullWidth loading={busy} disabled={otp.length !== 6}>
                Verify &amp; sign in
              </Button>
              <button
                type="button"
                onClick={() => { setStep('credentials'); setOtp(''); setError(null) }}
                className="mt-1 text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline"
              >
                ← Back to sign in
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
