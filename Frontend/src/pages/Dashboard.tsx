import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, CreditCard, Film, LayoutGrid, Plus, Search, Shield, Sparkles, User as UserIcon, Zap,
} from 'lucide-react'
import { AppShell, type NavItem } from '@/components/layout/AppShell'
import { VideoCard } from '@/components/dashboard/VideoCard'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, EmptyState, ProgressBar, Skeleton } from '@/components/ui/Primitives'
import { Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { auth, enquiry, user as userApi, videos } from '@/lib/api'
import { PLAN_LIMITS, PRICING } from '@/lib/constants'
import { cn, fmtDate, fmtDateTime, firstName, greeting, relTime } from '@/lib/utils'
import type { Project, Status } from '@/lib/types'

const NAV: NavItem[] = [
  { id: 'overview', label: 'Overview',       icon: LayoutGrid,   section: 'Main' },
  { id: 'videos',   label: 'My Videos',      icon: Film },
  { id: 'profile',  label: 'Profile',        icon: UserIcon,     section: 'Account' },
  { id: 'plan',     label: 'Plan & Billing', icon: CreditCard },
  { id: 'security', label: 'Security',       icon: Shield },
]

const TITLES: Record<string, string> = {
  overview: 'Overview', videos: 'My Videos', profile: 'Profile Settings',
  plan: 'Plan & Billing', security: 'Security & Sessions',
}

export default function Dashboard() {
  const [page, setPage] = useState('overview')
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: projectData, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => videos.list(50),
  })
  const projects = projectData?.projects ?? []

  // Drop the deleted project from the cache immediately, then refetch so the
  // count badge and stats stay consistent.
  const handleDeleted = (id: string) => {
    type ProjectList = { projects: Project[]; total: number }
    qc.setQueryData(['projects'], (old: ProjectList | undefined) =>
      old
        ? { ...old,
            projects: old.projects.filter((p: Project) => p.project_id !== id),
            total: Math.max(0, old.total - 1) }
        : old)
    qc.invalidateQueries({ queryKey: ['projects'] })
  }

  const plan = user?.plan ?? 'free'
  const limit = PLAN_LIMITS[plan] ?? 3
  const used = user?.videos_this_month ?? 0
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100))

  const quotaPanel = (
    <div className="rounded-xl border border-border-hair bg-surface-inset p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-fg-muted">This month</span>
        <span className="font-mono text-xs font-semibold text-fg">
          {used} / {limit === -1 ? '∞' : limit}
        </span>
      </div>
      <ProgressBar value={pct} className={cn(pct >= 80 && '[&>div]:!bg-[var(--accent)]')} />
      {plan === 'free' && (
        <Button size="sm" fullWidth className="mt-3" variant="accent" onClick={() => setUpgradeOpen(true)}>
          <Zap size={13} /> Upgrade
        </Button>
      )}
    </div>
  )

  return (
    <AppShell
      items={NAV.map((n) => (n.id === 'videos' ? { ...n, badge: projects.length || undefined } : n))}
      active={page}
      onNavigate={setPage}
      title={TITLES[page]}
      sidebarExtra={quotaPanel}
      headerActions={
        <Link to="/studio" className="hidden sm:block">
          <Button size="sm" icon={<Plus size={14} />}>New video</Button>
        </Link>
      }
    >
      {page === 'overview' && (
        <Overview
          projects={projects}
          loading={projectsLoading}
          onDeleted={handleDeleted}
          onSeeAll={() => setPage('videos')}
          onUpgrade={() => setUpgradeOpen(true)}
        />
      )}
      {page === 'videos'   && <VideosPage projects={projects} loading={projectsLoading} onDeleted={handleDeleted} />}
      {page === 'profile'  && <ProfilePage />}
      {page === 'plan'     && <PlanPage onUpgrade={() => setUpgradeOpen(true)} />}
      {page === 'security' && <SecurityPage />}

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </AppShell>
  )
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function Overview({
  projects, loading, onSeeAll, onUpgrade, onDeleted,
}: {
  onDeleted?: (id: string) => void
  projects: Project[]
  loading: boolean
  onSeeAll: () => void
  onUpgrade: () => void
}) {
  const { user } = useAuth()
  const plan = user?.plan ?? 'free'
  const limit = PLAN_LIMITS[plan] ?? 3
  const month = user?.videos_this_month ?? 0
  const total = user?.total_videos_generated ?? 0

  const stats = [
    { label: 'Total videos', value: total, note: 'All time', icon: Film, tone: 'brand' as const },
    { label: 'This month', value: month, note: `of ${limit === -1 ? '∞' : limit} included`, icon: CalendarDays, tone: 'lavender' as const },
    { label: 'Current plan', value: plan, note: 'View details', icon: Zap, tone: 'accent' as const, text: true },
    { label: 'Member since', value: fmtDate(user?.created_at, { month: 'short', year: 'numeric' }), note: `Last login ${relTime(user?.last_login)}`, icon: UserIcon, tone: 'success' as const, text: true },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Card edge className="relative overflow-hidden p-7">
        <div
          className="animate-drift pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full blur-[90px]"
          style={{ background: 'radial-gradient(circle, var(--aurora-1), transparent 70%)' }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <span className="label-mono text-brand">{greeting()}</span>
            <h2 className="mt-1.5 font-display text-3xl font-semibold text-fg">
              {firstName(user?.name)}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {month} video{month === 1 ? '' : 's'} this month
              {limit !== -1 && ` · ${Math.max(0, limit - month)} remaining`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/studio">
              <Button icon={<Sparkles size={15} />}>Create video</Button>
            </Link>
            <Button variant="secondary" onClick={onSeeAll}>My library</Button>
            {plan === 'free' && (
              <Button variant="ghost" onClick={onUpgrade}>Plans</Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-border-hair bg-surface-inset text-brand">
                  <s.icon size={15} />
                </span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <div className={cn('font-display font-semibold text-fg', s.text ? 'text-xl capitalize' : 'text-3xl')}>
                {s.value}
              </div>
              <div className="mt-1 text-xs text-fg-subtle">{s.note}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Recent videos"
          action={<Button size="sm" variant="ghost" onClick={onSeeAll}>See all</Button>}
        />
        <CardBody>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<Film size={34} />}
              title="No videos yet"
              description="Head to the Studio and create your first AI video."
              action={<Link to="/studio"><Button icon={<Sparkles size={15} />}>Open Studio</Button></Link>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.slice(0, 6).map((p, i) => (
                <VideoCard key={p.project_id} project={p} index={i} onDeleted={onDeleted} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

/* ── My Videos ────────────────────────────────────────────────────────────── */

const FILTERS: { id: Status | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'processing', label: 'Processing' },
  { id: 'failed', label: 'Failed' },
]

function VideosPage({ projects, loading, onDeleted }: {
  projects: Project[]; loading: boolean; onDeleted?: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Status | 'all'>('all')

  const shown = useMemo(() => {
    let list = projects
    if (q.trim()) list = list.filter((p) => (p.prompt ?? '').toLowerCase().includes(q.toLowerCase()))
    if (filter !== 'all') {
      list = list.filter((p) =>
        filter === 'processing'
          ? p.status === 'processing' || p.status === 'queued'
          : p.status === filter,
      )
    }
    return list
  }, [projects, q, filter])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your videos…"
            className="h-10 w-full rounded-xl border border-border-hair bg-surface-inset pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-border-accent"
          />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                filter === f.id
                  ? 'border-border-accent bg-brand-soft text-brand'
                  : 'border-border-hair text-fg-muted hover:text-fg',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Film size={34} />}
            title={q || filter !== 'all' ? 'Nothing matches' : 'No videos yet'}
            description={q || filter !== 'all' ? 'Try a different search or filter.' : 'Create your first video in the Studio.'}
            action={!q && filter === 'all' ? <Link to="/studio"><Button>Open Studio</Button></Link> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p, i) => (
            <VideoCard key={p.project_id} project={p} index={i} onDeleted={onDeleted} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Profile ──────────────────────────────────────────────────────────────── */

function ProfilePage() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')

  const saveName = useMutation({
    mutationFn: () => userApi.updateProfile(name.trim()),
    onSuccess: async () => { toast.success('Profile saved'); await refresh() },
    onError: (e: Error) => toast.error(e.message),
  })

  const changePw = useMutation({
    mutationFn: () => userApi.changePassword(oldPw, newPw),
    onSuccess: () => { toast.success('Password updated'); setOldPw(''); setNewPw('') },
    onError: (e: Error) => toast.error(e.message),
  })

  const googleOnly = !!user?.google_id && !user?.name

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card>
        <CardHeader title="Personal information" />
        <CardBody>
          <form
            onSubmit={(e) => { e.preventDefault(); saveName.mutate() }}
            className="flex flex-col gap-4"
          >
            <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" value={user?.email ?? ''} disabled hint="Email address cannot be changed." />
            <Button type="submit" loading={saveName.isPending} className="self-start">
              Save changes
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Change password"
          subtitle={googleOnly ? 'Your account signs in with Google.' : undefined}
        />
        <CardBody>
          <form
            onSubmit={(e) => { e.preventDefault(); changePw.mutate() }}
            className="flex flex-col gap-4"
          >
            <Input
              label="Current password" type="password" autoComplete="current-password"
              value={oldPw} onChange={(e) => setOldPw(e.target.value)}
            />
            <Input
              label="New password" type="password" autoComplete="new-password"
              placeholder="8+ chars, uppercase, number, symbol"
              value={newPw} onChange={(e) => setNewPw(e.target.value)}
            />
            <Button
              type="submit"
              loading={changePw.isPending}
              disabled={!oldPw || !newPw}
              className="self-start"
            >
              Update password
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

/* ── Plan ─────────────────────────────────────────────────────────────────── */

function PlanPage({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useAuth()
  const plan = user?.plan ?? 'free'
  const limit = PLAN_LIMITS[plan] ?? 3
  const used = user?.videos_this_month ?? 0
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100))

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Card edge className="p-7">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <Badge tone="brand">{plan}</Badge>
            <h2 className="mt-3 font-display text-2xl font-semibold capitalize text-fg">{plan} plan</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {limit === -1
                ? 'Unlimited videos every month.'
                : `${limit} videos every month, all core features included.`}
            </p>
          </div>
          <Button variant="accent" icon={<Zap size={15} />} onClick={onUpgrade}>Upgrade</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Usage this month" />
        <CardBody>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-fg-muted">Videos generated</span>
            <span className="font-mono font-semibold text-fg">
              {used} / {limit === -1 ? '∞' : limit}
            </span>
          </div>
          <ProgressBar value={pct} />
          <p className="mt-3 text-xs text-fg-subtle">Resets on the 1st of each month.</p>
        </CardBody>
      </Card>
    </div>
  )
}

/* ── Security ─────────────────────────────────────────────────────────────── */

function SecurityPage() {
  const toast = useToast()
  const qc = useQueryClient()

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: userApi.sessions })
  const history = useQuery({ queryKey: ['login-history'], queryFn: () => userApi.loginHistory(1, 20) })

  const revoke = useMutation({
    mutationFn: (sid: string) => userApi.revokeSession(sid),
    onSuccess: () => { toast.success('Session signed out'); qc.invalidateQueries({ queryKey: ['sessions'] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  const logoutAll = useMutation({
    mutationFn: userApi.logoutAll,
    onSuccess: (d) => {
      toast.success(`Signed out ${d.revoked} other device${d.revoked === 1 ? '' : 's'}`)
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const ACTION_LABEL: Record<string, string> = {
    login: 'Sign in', register: 'Register', logout: 'Sign out',
    password_reset: 'Password reset', password_reset_request: 'Reset requested',
    google_login: 'Google sign-in',
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Card>
        <CardHeader
          title="Active sessions"
          subtitle="Devices currently signed in to your account."
          action={
            <Button size="sm" variant="danger" loading={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
              Sign out others
            </Button>
          }
        />
        <div className="divide-y divide-[var(--border)]">
          {sessions.isLoading && <div className="p-5"><Skeleton className="h-12" /></div>}
          {sessions.data?.sessions.map((s) => (
            <div key={s.session_id} className="flex items-center gap-4 px-5 py-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border-hair bg-surface-inset text-brand">
                {s.device === 'Mobile' || s.device === 'Tablet' ? '📱' : '💻'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm text-fg">
                  {s.browser} on {s.os}
                  {s.is_current && <Badge tone="success">This device</Badge>}
                </div>
                <div className="font-mono text-2xs text-fg-subtle">
                  {s.ip} · active {relTime(s.last_active)}
                </div>
              </div>
              {!s.is_current && (
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.session_id)}>
                  Sign out
                </Button>
              )}
            </div>
          ))}
          {sessions.data?.sessions.length === 0 && (
            <p className="px-5 py-6 text-sm text-fg-muted">No active sessions found.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Login history" subtitle="Recent activity on your account." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-border-hair">
                {['Time', 'Action', 'Device', 'IP', 'Result'].map((h) => (
                  <th key={h} className="label-mono px-5 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {history.data?.logs.map((l, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-2xs text-fg-subtle">{fmtDateTime(l.created_at)}</td>
                  <td className="px-5 py-3 text-sm text-fg">{ACTION_LABEL[l.action] ?? l.action}</td>
                  <td className="px-5 py-3 text-sm text-fg-muted">{l.device}</td>
                  <td className="px-5 py-3 font-mono text-2xs text-fg-subtle">{l.ip}</td>
                  <td className="px-5 py-3">
                    <span className={cn('font-mono text-2xs font-semibold', l.success ? 'text-[var(--color-success-500)]' : 'text-[var(--color-danger-500)]')}>
                      {l.success ? '✓ OK' : `✗ ${l.failure_reason || 'failed'}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.data?.logs.length === 0 && (
            <p className="px-5 py-6 text-sm text-fg-muted">No history yet.</p>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ── Upgrade modal ────────────────────────────────────────────────────────── */

function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const current = user?.plan ?? 'free'
  const [showEnt, setShowEnt] = useState(false)
  const [ent, setEnt] = useState({ name: '', email: '', company: '', team: '' })

  const [buying, setBuying] = useState<string | null>(null)

  // The webhook is what actually grants the plan, so after checkout closes we
  // poll our own /api/auth/me rather than trusting anything the browser saw.
  async function buy(plan: string) {
    setBuying(plan)
    try {
      const { startCheckout, awaitPlanChange } = await import('@/lib/razorpay')
      const result = await startCheckout(plan)

      if (!result.submitted) {
        setBuying(null)
        return                       // user dismissed the modal — say nothing
      }

      toast.info('Payment received — activating your plan…')
      const newPlan = await awaitPlanChange(
        current,
        async () => (await auth.me()).plan ?? current,
      )

      if (newPlan) {
        toast.success(`You're on the ${newPlan} plan.`)
        await refresh()
        onClose()
      } else {
        toast.info(
          'Payment confirmed. Your plan will update within a minute — refresh if it lags.',
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed.')
    } finally {
      setBuying(null)
    }
  }

  const send = useMutation({
    mutationFn: () =>
      enquiry({
        name: ent.name, email: ent.email, type: 'Enterprise',
        message: `Company: ${ent.company}, Team size: ${ent.team}`,
      }),
    onSuccess: () => { toast.success("Thanks — we'll reach out within 24h"); setShowEnt(false) },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Upgrade your plan" subtitle="More videos and longer runtimes each month.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRICING.map((p) => {
          const isCurrent = p.plan === current
          return (
            <Card key={p.plan} className={cn('p-4', p.popular && 'border-border-accent')}>
              <div className="flex items-center justify-between">
                <span className="label-mono">{p.plan}</span>
                {p.popular && <Badge tone="brand">Popular</Badge>}
              </div>
              <div className="mt-3 font-display text-2xl font-semibold text-fg">{p.price}</div>
              <div className="text-xs text-fg-subtle">{p.period}</div>
              <div className="mt-1.5 text-sm font-medium text-brand">{p.videos}</div>
              <Button
                fullWidth size="sm" className="mt-4"
                variant={isCurrent ? 'secondary' : p.popular ? 'primary' : 'secondary'}
                disabled={isCurrent}
                onClick={() => (p.plan === 'enterprise' ? setShowEnt(true) : buy(p.plan))}
                loading={buying === p.plan}
              >
                {isCurrent
                  ? 'Current plan'
                  : p.plan === 'enterprise'
                    ? 'Contact sales'
                    : buying === p.plan ? 'Opening checkout…' : `Get ${p.plan}`}
              </Button>
            </Card>
          )
        })}
      </div>

      {showEnt && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-6 overflow-hidden border-t border-border-hair pt-6"
        >
          <h4 className="font-display text-base font-semibold text-fg">Enterprise enquiry</h4>
          <p className="mb-4 mt-1 text-sm text-fg-muted">Tell us about your team and we'll send a custom quote.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Your name" value={ent.name} onChange={(e) => setEnt({ ...ent, name: e.target.value })} />
            <Input placeholder="Work email" type="email" value={ent.email} onChange={(e) => setEnt({ ...ent, email: e.target.value })} />
            <Input placeholder="Company" value={ent.company} onChange={(e) => setEnt({ ...ent, company: e.target.value })} />
            <Input placeholder="Team size" value={ent.team} onChange={(e) => setEnt({ ...ent, team: e.target.value })} />
          </div>
          <Button
            className="mt-4"
            loading={send.isPending}
            disabled={!ent.name || !ent.email || !ent.company}
            onClick={() => send.mutate()}
          >
            Contact sales
          </Button>
        </motion.div>
      )}
    </Modal>
  )
}
