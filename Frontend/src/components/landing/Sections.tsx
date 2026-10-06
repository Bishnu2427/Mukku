import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, Film, Music, Sparkles, Upload, Wand2, Languages as LangIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge, SectionHeading } from '@/components/ui/Primitives'
import { Input, Textarea } from '@/components/ui/Field'
import { LANGUAGES, PLATFORMS, PRICING } from '@/lib/constants'
import { useCycle, useTilt } from '@/hooks'
import { enquiry } from '@/lib/api'
import { cn } from '@/lib/utils'

const reveal = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
}

function Section({ id, children, alt = false }: { id?: string; children: React.ReactNode; alt?: boolean }) {
  return (
    <section id={id} className={cn('relative py-24 sm:py-32', alt && 'bg-bg-deep')}>
      <div className="mx-auto max-w-7xl px-5 lg:px-8">{children}</div>
    </section>
  )
}

/* ── How it works — the 8 stages ──────────────────────────────────────────── */

/* ── Features ─────────────────────────────────────────────────────────────── */

const FEATURES = [
  { icon: LangIcon, title: 'Twelve languages',  body: 'English plus eleven Indian languages, with narration recorded natively in each.' },
  { icon: Upload,   title: 'Bring your own media', body: 'Attach your own photos and clips. They replace generated scenes; the rest is filled in for you.' },
  { icon: Film,     title: 'Real motion',       body: 'Scenes animate with genuine camera movement, not a static image with a zoom slapped on.' },
  { icon: Sparkles, title: 'Platform presets',  body: 'One click sets aspect ratio, length, tone and style for the platform you are posting to.' },
  { icon: Music,    title: 'Original score',    body: 'Background music composed for your topic and mood, mixed under the narration.' },
  { icon: Wand2,    title: 'Edit and remake',   body: 'Adjust the prompt or any setting and regenerate without starting over.' },
]

function FeatureCard({ f, i }: { f: (typeof FEATURES)[number]; i: number }) {
  const tilt = useTilt(4)
  return (
    <motion.div
      variants={reveal}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: i * 0.05 }}
    >
      <div ref={tilt} className="h-full transition-transform duration-300 ease-out">
        <Card edge className="h-full p-6">
          <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-border-hair bg-surface-inset text-brand">
            <f.icon size={18} />
          </span>
          <h3 className="font-display text-lg font-semibold text-fg">{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.body}</p>
        </Card>
      </div>
    </motion.div>
  )
}

export function Features() {
  return (
    <Section id="features" alt>
      <SectionHeading
        eyebrow="Capabilities"
        title="Everything a finished video needs"
        description="Not a storyboard tool or a stock-clip stitcher. Mukku produces the whole thing."
      />
      <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} f={f} i={i} />
        ))}
      </div>
    </Section>
  )
}

/* ── Platforms ────────────────────────────────────────────────────────────── */

const PLATFORM_META: Record<string, { ratio: string; len: string }> = {
  youtube:         { ratio: '16:9', len: '2 min' },
  youtube_shorts:  { ratio: '9:16', len: '1 min' },
  tiktok:          { ratio: '9:16', len: '1 min' },
  instagram_reels: { ratio: '9:16', len: '30 s' },
  instagram_post:  { ratio: '1:1',  len: '1 min' },
  linkedin:        { ratio: '16:9', len: '90 s' },
  twitter:         { ratio: '16:9', len: '1 min' },
}

export function Platforms() {
  return (
    <Section id="platforms">
      <SectionHeading
        eyebrow="Built to post"
        title="Sized for where it is going"
        description="Pick a platform and the aspect ratio, duration, tone and visual style are configured for you."
      />
      <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLATFORMS.filter((p) => p.value).map((p, i) => {
          const meta = PLATFORM_META[p.value]
          const vertical = meta?.ratio === '9:16'
          const square = meta?.ratio === '1:1'
          return (
            <motion.div
              key={p.value}
              variants={reveal}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: i * 0.04 }}
            >
              <Card interactive className="flex items-center gap-4 p-4">
                {/* Little frame that mirrors the real output ratio */}
                <div
                  className={cn(
                    'shrink-0 rounded-md border border-border-accent bg-brand-soft',
                    vertical ? 'h-11 w-[26px]' : square ? 'h-10 w-10' : 'h-[26px] w-11',
                  )}
                />
                <div className="min-w-0">
                  <div className="font-display text-sm font-semibold text-fg">{p.label}</div>
                  <div className="font-mono text-2xs text-fg-subtle">
                    {meta?.ratio} · {meta?.len}
                  </div>
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </Section>
  )
}

/* ── Languages ────────────────────────────────────────────────────────────── */

export function Languages() {
  const active = useCycle(LANGUAGES.length, 1200)
  return (
    <Section id="languages" alt>
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Reach"
            title="Speak to more of India"
            description="Narration is generated natively in twelve languages, so your video sounds right to the people you made it for."
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {LANGUAGES.map((l, i) => (
            <motion.span
              key={l.value}
              animate={{
                scale: i === active ? 1.06 : 1,
                borderColor: i === active ? 'var(--border-accent)' : 'var(--border)',
                color: i === active ? 'var(--brand)' : 'var(--text-muted)',
              }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="rounded-full border bg-surface px-4 py-2 text-sm"
            >
              <span className="font-medium">{l.native}</span>
              <span className="ml-2 font-mono text-2xs opacity-60">{l.value}</span>
            </motion.span>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ── Pricing ──────────────────────────────────────────────────────────────── */

const PLAN_FEATURES: Record<string, string[]> = {
  free:       ['3 videos per month', 'All 12 languages', 'Every platform preset', 'Watch and share'],
  starter:    ['5 videos per month', 'Everything in Free', 'Download as MP4', 'Priority queue'],
  pro:        ['25 videos per month', 'Everything in Starter', 'Longer 5-minute videos', 'Bring your own media'],
  enterprise: ['Unlimited videos', 'Everything in Pro', 'Dedicated support', 'Custom integrations'],
}

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow="Pricing"
        title="Start free, scale when it works"
        description="No credit card to begin. Upgrade only once Mukku is earning its place in your workflow."
      />
      <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PRICING.map((p, i) => (
          <motion.div
            key={p.plan}
            variants={reveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-50px' }}
            transition={{ delay: i * 0.06 }}
          >
            <Card
              edge={p.popular}
              className={cn(
                'flex h-full flex-col p-6',
                p.popular && 'border-border-accent shadow-[var(--shadow-glow)]',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="label-mono">{p.plan}</span>
                {p.popular && <Badge tone="brand">Popular</Badge>}
                {p.plan === 'enterprise' && <Badge tone="accent">Team</Badge>}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-3xl font-semibold text-fg">{p.price}</span>
                <span className="text-sm text-fg-subtle">{p.period}</span>
              </div>
              <div className="mt-1 text-sm font-medium text-brand">{p.videos}</div>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {PLAN_FEATURES[p.plan].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-fg-muted">
                    <Check size={14} className="mt-1 shrink-0 text-[var(--color-success-500)]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to={p.plan === 'enterprise' ? '#contact' : '/register'} className="mt-7">
                <Button fullWidth variant={p.popular ? 'primary' : 'secondary'}>
                  {p.plan === 'free' ? 'Start free' : p.plan === 'enterprise' ? 'Contact sales' : `Get ${p.plan}`}
                </Button>
              </Link>
            </Card>
          </motion.div>
        ))}
      </div>
    </Section>
  )
}

/* ── FAQ ──────────────────────────────────────────────────────────────────── */

const FAQS = [
  { q: 'What is Mukku AI Studio?', a: 'An AI video generator that turns a text prompt into a finished MP4. It runs an eight-stage pipeline covering prompt analysis, scripting, scene planning, image generation, clip animation, voiceover, music and final assembly.' },
  { q: 'Which languages are supported?', a: 'Twelve: English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Odia and Assamese. Both the script and the narration are produced in the language you choose.' },
  { q: 'Is it free?', a: 'The Free plan gives you three videos a month with no credit card. Starter is ₹177 a month for five, and Pro is ₹577 a month for twenty-five.' },
  { q: 'How long does a video take?', a: 'A one-minute video usually finishes in three to eight minutes depending on load. Three to five minute videos can take ten to twenty.' },
  { q: 'Can I use my own footage?', a: 'Yes. Attach up to ten photos or clips, 50 MB each. They replace generated scenes in order, and anything left over is generated for you.' },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <Section id="faq" alt>
      <SectionHeading eyebrow="Questions" title="Good to know" />
      <div className="mx-auto mt-14 flex max-w-3xl flex-col gap-2.5">
        {FAQS.map((f, i) => {
          const isOpen = open === i
          return (
            <Card key={f.q} className="overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-display text-base font-medium text-fg">{f.q}</span>
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
                  <ChevronDown size={17} className="shrink-0 text-fg-subtle" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <p className="px-5 pb-5 text-sm leading-relaxed text-fg-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          )
        })}
      </div>
    </Section>
  )
}

/* ── Contact ──────────────────────────────────────────────────────────────── */

const ENQUIRY_TYPES = ['General', 'Enterprise', 'Support', 'Partnership', 'Feedback']

export function Contact() {
  const [form, setForm] = useState({ name: '', email: '', type: 'General', message: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setState('error'); setMsg('Please fill in name, email and message.')
      return
    }
    setState('sending')
    try {
      await enquiry(form)
      setState('sent'); setMsg("Thanks — we'll reply within 24 hours.")
      setForm({ name: '', email: '', type: 'General', message: '' })
    } catch (err) {
      setState('error')
      setMsg(err instanceof Error ? err.message : 'Could not send. Please try again.')
    }
  }

  return (
    <Section id="contact">
      <div className="grid gap-14 lg:grid-cols-2">
        <SectionHeading
          align="left"
          eyebrow="Contact"
          title="Talk to us"
          description="Questions about the product, enterprise pricing, or something you wish it did? Send a note and a human will reply."
        />
        <Card edge className="p-6 sm:p-8">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" value={form.name} onChange={set('name')} placeholder="Your name" autoComplete="name" />
              <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="enq-type" className="label-mono">Topic</label>
              <select
                id="enq-type"
                value={form.type}
                onChange={set('type')}
                className="h-11 w-full rounded-xl border border-border-hair bg-surface-inset px-3.5 text-sm text-fg outline-none transition-colors focus:border-border-accent"
              >
                {ENQUIRY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Textarea label="Message" rows={5} value={form.message} onChange={set('message')} placeholder="How can we help?" />
            <Button type="submit" loading={state === 'sending'} iconRight={<ArrowRight size={15} />}>
              {state === 'sent' ? 'Sent' : 'Send message'}
            </Button>
            {msg && (
              <p className={cn('text-sm', state === 'sent' ? 'text-[var(--color-success-500)]' : 'text-[var(--color-danger-500)]')}>
                {msg}
              </p>
            )}
          </form>
        </Card>
      </div>
    </Section>
  )
}

/* ── Closing CTA ──────────────────────────────────────────────────────────── */

export function ClosingCta() {
  return (
    <Section alt>
      <Card edge className="relative overflow-hidden px-6 py-16 text-center sm:px-16">
        <div
          className="animate-drift pointer-events-none absolute -top-1/2 left-1/2 h-[120%] w-[70%] -translate-x-1/2 blur-[100px]"
          style={{ background: 'radial-gradient(circle, var(--aurora-1), transparent 70%)' }}
        />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold text-fg sm:text-4xl">
            Your next video is one sentence away
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-fg-muted">
            Three free videos every month. No card, no trial timer.
          </p>
          <Link to="/register" className="mt-8 inline-block">
            <Button size="lg" icon={<Sparkles size={16} />} iconRight={<ArrowRight size={16} />}>
              Start creating free
            </Button>
          </Link>
        </div>
      </Card>
    </Section>
  )
}
