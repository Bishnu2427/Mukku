import { useState } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowRight, Mail, MailCheck } from 'lucide-react'
import { Alert, AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { auth } from '@/lib/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) return setError('Please enter your email address.')
    setBusy(true)
    try {
      await auth.forgotPassword(email.trim())
      // The backend always answers OK to prevent email enumeration, so the
      // success state is unconditional by design.
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" subtitle="If that address has an account, a reset link is on its way.">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 py-4 text-center"
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border-accent bg-brand-soft text-brand">
            <MailCheck size={24} />
          </span>
          <p className="text-sm text-fg-muted">
            We sent a reset link to <strong className="text-fg">{email}</strong>.
            <br />
            It expires in one hour. Check spam if it does not appear.
          </p>
          <Link to="/login" className="mt-2">
            <Button variant="secondary">Back to sign in</Button>
          </Link>
        </motion.div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter the email on your account and we'll send a reset link valid for one hour."
      footer={<Link to="/login" className="text-brand hover:underline">← Back to sign in</Link>}
    >
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon={<Mail size={15} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" fullWidth loading={busy} iconRight={<ArrowRight size={15} />}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
