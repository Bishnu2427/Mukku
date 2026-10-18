/**
 * Dedicated contact page.
 *
 * Separate from the landing page's contact section because payment processors
 * require a reachable, directly-linkable contact page during merchant review,
 * and because someone with a billing problem should not have to scroll a
 * marketing page to find an address.
 */

import { useState } from 'react'
import { motion } from 'motion/react'
import { Clock, CreditCard, LifeBuoy, Mail, ShieldAlert } from 'lucide-react'
import { MarketingNav } from '@/components/layout/MarketingNav'
import { Footer } from '@/components/layout/Footer'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Field'
import { Seo } from '@/components/Seo'
import { useToast } from '@/providers/ToastProvider'
import { enquiry } from '@/lib/api'
import { EASE_OUT } from '@/lib/motion'

const ROUTES = [
  {
    icon: LifeBuoy,
    label: 'Support',
    address: 'support@mukku.ai',
    detail: 'Account problems, failed renders, anything that is not working.',
    sla: 'Within 1 business day',
  },
  {
    icon: CreditCard,
    label: 'Billing & refunds',
    address: 'support@mukku.ai',
    detail: 'Payments, plan changes, cancellations and refund requests.',
    sla: 'Acknowledged within 2 business days',
  },
  {
    icon: ShieldAlert,
    label: 'Security',
    address: 'security@mukku.ai',
    detail: 'Vulnerability reports. Please do not open a public issue.',
    sla: 'Within 48 hours',
  },
]

const TOPICS = ['Support', 'Billing', 'Enterprise', 'Security', 'Something else']

export default function Contact() {
  const toast = useToast()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', type: 'Support', message: '' })

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error('Name, email and message are all needed.')
      return
    }
    setSending(true)
    try {
      await enquiry(form)
      setSent(true)
      toast.success('Message sent — we will reply by email.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send. Email us directly.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <Seo
        title="Contact — Mukku AI Studio"
        description="Reach Mukku AI Studio for support, billing and refunds, security reports or enterprise enquiries."
        canonical="/contact"
      />
      <MarketingNav />

      <main className="mx-auto max-w-7xl px-5 pb-28 pt-32 lg:px-8">
        <div className="max-w-2xl">
          <span className="label-mono text-brand">Contact</span>
          <h1 className="mt-3 font-display text-[clamp(2.1rem,4.4vw,3.2rem)] font-semibold leading-[1.03] tracking-[-0.038em] text-fg">
            Talk to a person.
          </h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-fg-muted">
            We are a small team, so you will get a real reply rather than a ticket number.
            Pick whichever address fits — or use the form and we will route it.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          {/* Addresses */}
          <div className="space-y-3">
            {ROUTES.map((r, i) => (
              <motion.a
                key={r.label}
                href={`mailto:${r.address}`}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.5, ease: EASE_OUT }}
                className="group flex gap-4 rounded-xl border border-border-hair bg-surface/50 p-5 transition-colors hover:border-border-accent"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <r.icon size={16} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-[0.95rem] font-semibold text-fg">{r.label}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{r.detail}</p>
                  <p className="mt-2 break-all font-mono text-xs text-brand">{r.address}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
                    <Clock size={10} />
                    {r.sla}
                  </p>
                </div>
              </motion.a>
            ))}

            <div className="rounded-xl border border-border-hair bg-surface-2 p-5 text-sm leading-relaxed text-fg-muted">
              <p className="mb-1.5 font-display font-semibold text-fg">Registered details</p>
              <p>
                Mukku AI Studio
                <br />
                India
              </p>
              <p className="mt-2.5 text-xs text-fg-subtle">
                Full registered address and GSTIN appear on every invoice.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="glass relative overflow-hidden rounded-2xl border border-border-hair p-6 sm:p-8">
            <span className="edge-light absolute inset-x-0 top-0 h-px" aria-hidden />
            {sent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex min-h-[320px] flex-col items-center justify-center text-center"
              >
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
                  <Mail size={20} />
                </span>
                <h2 className="font-display text-lg font-semibold text-fg">Message sent</h2>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-fg-muted">
                  We will reply to {form.email} — usually within a business day.
                </p>
                <Button
                  variant="ghost"
                  className="mt-5"
                  onClick={() => { setSent(false); setForm({ name: '', email: '', type: 'Support', message: '' }) }}
                >
                  Send another
                </Button>
              </motion.div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Your name" value={form.name} onChange={set('name')} autoComplete="name" />
                  <Input label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
                </div>

                <div>
                  <label className="label-mono mb-2 block">What is it about?</label>
                  <div className="flex flex-wrap gap-2">
                    {TOPICS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, type: t }))}
                        className={
                          'rounded-lg border px-3 py-1.5 text-xs transition-colors ' +
                          (form.type === t
                            ? 'border-border-accent bg-brand-soft text-brand'
                            : 'border-border-hair text-fg-muted hover:border-border-accent hover:text-fg')
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <Textarea
                  label="Message"
                  rows={6}
                  value={form.message}
                  onChange={set('message')}
                  placeholder="If it is a failed render, paste the project id from your dashboard — it makes this much faster to trace."
                />

                <Button type="submit" fullWidth size="lg" loading={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </Button>

                <p className="text-center text-xs text-fg-subtle">
                  We use your message only to reply. See our{' '}
                  <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a>.
                </p>
              </form>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
