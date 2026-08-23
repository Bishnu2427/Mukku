import { useState } from 'react'
import { motion } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, ClipboardList, Film, LayoutGrid, Radio, Search, ShieldCheck,
  Trash2, UserCog, Users, X,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AppShell, type NavItem } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, EmptyState, PulseDot, Skeleton } from '@/components/ui/Primitives'
import { Pagination, Td, Th } from '@/components/ui/Pagination'
import { Input } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { useDebounced } from '@/hooks'
import { admin } from '@/lib/api'
import { cn, fmtDateTime, fmtNumber, relDate, truncate } from '@/lib/utils'
import type { AdminUser } from '@/lib/types'

const ALL_NAV: (NavItem & { perm: string })[] = [
  { id: 'overview', label: 'Dashboard',     icon: LayoutGrid,     perm: 'view_dashboard', section: 'Overview' },
  { id: 'health',   label: 'System Health', icon: Activity,       perm: 'view_health' },
  { id: 'users',    label: 'Users',         icon: Users,          perm: 'view_users', section: 'Management' },
  { id: 'admins',   label: 'Admins',        icon: UserCog,        perm: 'manage_admins' },
  { id: 'projects', label: 'Projects',      icon: Film,           perm: 'view_projects' },
  { id: 'audit',    label: 'Audit Log',     icon: ClipboardList,  perm: 'view_audit_log', section: 'Logs' },
  { id: 'logins',   label: 'Login History', icon: ShieldCheck,    perm: 'view_audit_log' },
  { id: 'sessions', label: 'Live Sessions', icon: Radio,          perm: 'view_sessions' },
]

const TITLES: Record<string, string> = {
  overview: 'Admin Dashboard', health: 'System Health', users: 'User Management',
  admins: 'Admin Accounts', projects: 'Project Management', audit: 'Audit Log',
  logins: 'Login History', sessions: 'Live Sessions',
}

export default function Admin() {
  const { can, isSuperAdmin } = useAuth()
  const nav = ALL_NAV.filter((n) => can(n.perm))
  const [page, setPage] = useState(nav[0]?.id ?? 'overview')

  return (
    <AppShell
      items={nav}
      active={page}
      onNavigate={setPage}
      title={TITLES[page] ?? 'Admin'}
      roleBadge={
        <Badge tone={isSuperAdmin ? 'accent' : 'brand'} className="ml-auto">
          {isSuperAdmin ? 'Super' : 'Admin'}
        </Badge>
      }
    >
      {page === 'overview' && <OverviewTab />}
      {page === 'health'   && <HealthTab />}
      {page === 'users'    && <UsersTab />}
      {page === 'admins'   && <AdminsTab />}
      {page === 'projects' && <ProjectsTab />}
      {page === 'audit'    && <AuditTab />}
      {page === 'logins'   && <LoginsTab />}
      {page === 'sessions' && <SessionsTab />}
    </AppShell>
  )
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewTab() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'stats'], queryFn: admin.stats })

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    )
  }
  if (!data) return null

  const stats = [
    { label: 'Total users',   value: data.total_users,   note: `+${data.new_today} today`, tone: 'brand' as const },
    { label: 'Active users',  value: data.active_users,  note: `${data.total_users ? Math.round((data.active_users / data.total_users) * 100) : 0}% of total`, tone: 'success' as const },
    { label: 'Total videos',  value: data.total_videos,  note: `${data.completed_projects} completed`, tone: 'lavender' as const },
    { label: 'Pro users',     value: data.pro_users,     note: `${data.total_users ? Math.round((data.pro_users / data.total_users) * 100) : 0}% conversion`, tone: 'accent' as const },
    { label: 'New this week', value: data.new_this_week, note: `${data.failed_logins_today} failed logins today`, tone: 'danger' as const },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="p-5">
              <Badge tone={s.tone}>{s.label}</Badge>
              <div className="mt-3 font-display text-3xl font-semibold text-fg">{fmtNumber(s.value)}</div>
              <div className="mt-1 text-xs text-fg-subtle">{s.note}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader title="New signups" subtitle="Last 30 days" />
        <CardBody>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.signup_trend} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'var(--brand-soft)' }}
                  contentStyle={{
                    background: 'var(--surface)', border: '1px solid var(--border-strong)',
                    borderRadius: 12, fontSize: 12, color: 'var(--text)',
                  }}
                />
                <Bar dataKey="count" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent users" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px]">
              <thead><tr className="border-b border-border-hair"><Th>User</Th><Th>Plan</Th><Th>Joined</Th></tr></thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.recent_users.map((u) => (
                  <tr key={u.user_id}>
                    <Td className="!text-fg">
                      <div className="font-medium">{u.name || '—'}</div>
                      <div className="text-2xs text-fg-subtle">{u.email}</div>
                    </Td>
                    <Td><Badge tone={u.plan === 'free' ? 'neutral' : 'brand'}>{u.plan}</Badge></Td>
                    <Td className="whitespace-nowrap text-2xs">{relDate(u.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent projects" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px]">
              <thead><tr className="border-b border-border-hair"><Th>Prompt</Th><Th>Status</Th><Th>Date</Th></tr></thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.recent_projects.map((p) => (
                  <tr key={p.project_id}>
                    <Td className="max-w-[200px] truncate !text-fg">{truncate(p.prompt || '—', 46)}</Td>
                    <Td>
                      <Badge tone={p.status === 'completed' ? 'success' : p.status === 'failed' ? 'danger' : 'brand'}>
                        {p.status}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-2xs">{relDate(p.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ── Health ───────────────────────────────────────────────────────────────── */

function HealthTab() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: admin.health,
    refetchInterval: 30_000, // same cadence as the legacy poll
  })

  const queueOk = data?.queue === 'ok'
  const queueLabel =
    data?.queue_backend === 'redis'
      ? `Redis · ${data?.queue_depth ?? 0} queued · ${data?.queue_workers ?? 0} worker(s)`
      : (data?.queue_detail || 'in-process')

  const services = [
    { label: 'MongoDB',     ok: data?.mongodb === 'ok', detail: data?.mongodb },
    { label: 'Ollama AI',   ok: data?.ollama === 'ok',  detail: data?.ollama },
    { label: 'Job queue',   ok: queueOk,                detail: queueLabel },
    { label: 'Auth system', ok: true, detail: 'ok' },
    { label: 'API server',  ok: true, detail: 'ok' },
  ]

  return (
    <Card>
      <CardHeader
        title="System health"
        subtitle="Live status of connected services · refreshes every 30s"
        action={<Button size="sm" variant="secondary" loading={isFetching} onClick={() => refetch()}>Refresh</Button>}
      />
      <CardBody>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((s) => (
              <div key={s.label} className="flex items-center gap-4 rounded-xl border border-border-hair p-4">
                <span
                  className={cn(
                    'grid h-11 w-11 place-items-center rounded-xl border',
                    s.ok
                      ? 'border-[color-mix(in_oklab,var(--color-success-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-success-500)_12%,transparent)]'
                      : 'border-[color-mix(in_oklab,var(--color-danger-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_12%,transparent)]',
                  )}
                >
                  <PulseDot tone={s.ok ? 'success' : 'danger'} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">{s.label}</div>
                  <div className={cn('truncate font-mono text-2xs', s.ok ? 'text-[var(--color-success-500)]' : 'text-[var(--color-danger-500)]')}>
                    {s.ok ? (s.detail && s.detail !== 'ok' ? s.detail : 'Operational') : (s.detail ?? 'offline')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

/* ── Users ────────────────────────────────────────────────────────────────── */

function UsersTab() {
  const toast = useToast()
  const qc = useQueryClient()
  const { can } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState('')
  const debounced = useDebounced(search, 400)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', page, debounced, plan],
    queryFn: () => admin.users(page, 15, debounced, plan),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AdminUser> }) => admin.updateUser(id, patch),
    onSuccess: () => { toast.success('User updated'); setEditing(null); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => admin.deleteUser(id),
    onSuccess: () => { toast.success('User deleted'); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <>
      <Card>
        <CardHeader
          title={`Users${data ? ` (${data.total})` : ''}`}
          action={
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Search name or email…"
                  className="h-9 w-52 rounded-lg border border-border-hair bg-surface-inset pl-9 pr-3 text-sm text-fg outline-none focus:border-border-accent"
                />
              </div>
              <select
                value={plan}
                onChange={(e) => { setPlan(e.target.value); setPage(1) }}
                className="h-9 rounded-lg border border-border-hair bg-surface-inset px-2.5 text-sm text-fg outline-none focus:border-border-accent"
              >
                <option value="">All plans</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border-hair">
                <Th>User</Th><Th>Plan</Th><Th>Status</Th><Th>Videos</Th><Th>Joined</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {isLoading && (
                <tr><td colSpan={6} className="p-5"><Skeleton className="h-10" /></td></tr>
              )}
              {data?.users.map((u) => (
                <tr key={u.user_id}>
                  <Td className="!text-fg">
                    <div className="font-medium">{u.name || '—'}</div>
                    <div className="text-2xs text-fg-subtle">{u.email}</div>
                  </Td>
                  <Td><Badge tone={u.plan === 'free' ? 'neutral' : 'brand'}>{u.plan}</Badge></Td>
                  <Td>
                    <Badge tone={u.is_active !== false ? 'success' : 'danger'}>
                      {u.is_active !== false ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-xs">{fmtNumber(u.total_videos_generated ?? 0)}</Td>
                  <Td className="whitespace-nowrap text-2xs">{relDate(u.created_at)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" disabled={!can('edit_users')} onClick={() => setEditing(u)}>
                        Edit
                      </Button>
                      <Button
                        size="sm" variant="ghost" disabled={!can('edit_users')}
                        onClick={() => update.mutate({ id: u.user_id, patch: { is_active: !(u.is_active !== false) } })}
                      >
                        {u.is_active !== false ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!can('delete_users')} onClick={() => setDeleting(u)}>
                        <Trash2 size={13} className="text-[var(--color-danger-500)]" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pagination page={page} pages={data.pages} total={data.total} limit={15} onChange={setPage} />}
        {data?.users.length === 0 && <EmptyState icon={<Users size={30} />} title="No users found" />}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit user"
        subtitle={editing?.email}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              loading={update.isPending}
              onClick={() =>
                editing && update.mutate({
                  id: editing.user_id,
                  patch: { name: editing.name, plan: editing.plan, is_active: editing.is_active },
                })
              }
            >
              Save changes
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Input
              label="Name" value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <div className="flex flex-col gap-1.5">
              <span className="label-mono">Plan</span>
              <select
                value={editing.plan}
                onChange={(e) => setEditing({ ...editing, plan: e.target.value as AdminUser['plan'] })}
                className="h-11 rounded-xl border border-border-hair bg-surface-inset px-3.5 text-sm text-fg outline-none focus:border-border-accent"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="label-mono">Status</span>
              <select
                value={editing.is_active ? 'active' : 'inactive'}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.value === 'active' })}
                className="h-11 rounded-xl border border-border-hair bg-surface-inset px-3.5 text-sm text-fg outline-none focus:border-border-accent"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.user_id)}
        title={`Delete ${deleting?.email}?`}
        message="This permanently removes the account and all of its sessions. It cannot be undone."
        confirmLabel="Delete user"
      />
    </>
  )
}

/* ── Admins ───────────────────────────────────────────────────────────────── */

function AdminsTab() {
  const toast = useToast()
  const qc = useQueryClient()
  const { isSuperAdmin, user } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'admins'], queryFn: admin.admins })

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [revoking, setRevoking] = useState<AdminUser | null>(null)
  const [form, setForm] = useState({ name: '', email: '', permissions: [] as string[], sendEmail: true })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'admins'] })

  const create = useMutation({
    mutationFn: () => admin.createAdmin(form.name, form.email, form.permissions, form.sendEmail),
    onSuccess: (d) => {
      toast.success(d.action === 'promoted' ? 'User promoted to admin' : 'Admin created')
      setCreating(false); setForm({ name: '', email: '', permissions: [], sendEmail: true }); invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) => admin.updateAdmin(id, { permissions }),
    onSuccess: () => { toast.success('Permissions updated'); setEditing(null); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => admin.revokeAdmin(id),
    onSuccess: () => { toast.success('Admin role revoked'); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const allPerms = data?.all_permissions ?? []
  const selected = editing ? (editing.permissions ?? []) : form.permissions
  const setSelected = (next: string[]) =>
    editing ? setEditing({ ...editing, permissions: next }) : setForm({ ...form, permissions: next })

  const permGrid = (
    <div className="grid gap-2 sm:grid-cols-2">
      {allPerms.map((p) => {
        const checked = selected.includes(p)
        const locked = p === 'manage_admins' && !isSuperAdmin
        return (
          <label
            key={p}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors',
              checked ? 'border-border-accent bg-brand-soft text-fg' : 'border-border-hair text-fg-muted',
              locked && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="checkbox" checked={checked} disabled={locked}
              onChange={(e) => setSelected(e.target.checked ? [...selected, p] : selected.filter((x) => x !== p))}
              className="h-3.5 w-3.5 accent-[var(--brand)]"
            />
            <span className="font-mono text-2xs">{p}</span>
          </label>
        )
      })}
    </div>
  )

  return (
    <>
      <Card>
        <CardHeader
          title="Admin accounts"
          subtitle="Roles and privileges"
          action={<Button size="sm" onClick={() => setCreating(true)}>New admin</Button>}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border-hair">
                <Th>Admin</Th><Th>Role</Th><Th>Permissions</Th><Th>Status</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {isLoading && <tr><td colSpan={5} className="p-5"><Skeleton className="h-10" /></td></tr>}
              {data?.admins.map((a) => {
                const isSuper = a.role === 'super_admin'
                const isMe = a.user_id === user?.user_id
                return (
                  <tr key={a.user_id}>
                    <Td className="!text-fg">
                      <div className="font-medium">
                        {a.name || '—'} {isMe && <span className="text-2xs text-fg-subtle">(you)</span>}
                      </div>
                      <div className="text-2xs text-fg-subtle">{a.email}</div>
                    </Td>
                    <Td><Badge tone={isSuper ? 'accent' : 'brand'}>{isSuper ? 'Super admin' : 'Admin'}</Badge></Td>
                    <Td>
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {isSuper ? (
                          <Badge tone="accent">All permissions</Badge>
                        ) : (a.permissions ?? []).length ? (
                          (a.permissions ?? []).map((p) => (
                            <span key={p} className="rounded border border-border-hair px-1.5 py-0.5 font-mono text-2xs text-fg-subtle">
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-2xs text-fg-subtle">none</span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={a.is_active !== false ? 'success' : 'danger'}>
                        {a.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" disabled={isSuper} onClick={() => setEditing(a)}>Edit</Button>
                        <Button size="sm" variant="ghost" disabled={isSuper || isMe} onClick={() => setRevoking(a)}>
                          <X size={13} className="text-[var(--color-danger-500)]" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={creating} onClose={() => setCreating(false)}
        title="Create admin" subtitle="Grant admin access with specific permissions"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={!form.name || !form.email} onClick={() => create.mutate()}>
              Create admin
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="flex flex-col gap-2">
            <span className="label-mono">Permissions</span>
            {permGrid}
          </div>
          {form.permissions.includes('manage_admins') && (
            <p className="rounded-lg border border-[color-mix(in_oklab,var(--color-amber-500)_34%,transparent)] bg-accent-soft px-3 py-2 text-xs text-accent">
              Granting <strong>manage_admins</strong> lets this account create and modify other admins.
            </p>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox" checked={form.sendEmail}
              onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--brand)]"
            />
            Send invite email with a temporary password
          </label>
        </div>
      </Modal>

      <Modal
        open={!!editing} onClose={() => setEditing(null)}
        title="Edit permissions" subtitle={editing?.email}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              loading={update.isPending}
              onClick={() => editing && update.mutate({ id: editing.user_id, permissions: editing.permissions ?? [] })}
            >
              Save permissions
            </Button>
          </>
        }
      >
        {permGrid}
      </Modal>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.user_id)}
        title="Revoke admin role?"
        message={`${revoking?.email} will lose all admin access and become a regular user.`}
        confirmLabel="Revoke"
      />
    </>
  )
}

/* ── Projects ─────────────────────────────────────────────────────────────── */

function ProjectsTab() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'projects', page, status],
    queryFn: () => admin.projects(page, 15, status),
  })

  return (
    <Card>
      <CardHeader
        title={`Projects${data ? ` (${data.total})` : ''}`}
        action={
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="h-9 rounded-lg border border-border-hair bg-surface-inset px-2.5 text-sm text-fg outline-none focus:border-border-accent"
          >
            <option value="">All status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
          </select>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className="border-b border-border-hair">
              <Th>ID</Th><Th>Prompt</Th><Th>Status</Th><Th>Language</Th><Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {isLoading && <tr><td colSpan={5} className="p-5"><Skeleton className="h-10" /></td></tr>}
            {data?.projects.map((p) => (
              <tr key={p.project_id}>
                <Td className="font-mono text-2xs">{p.project_id.slice(0, 12)}…</Td>
                <Td className="max-w-[280px] truncate !text-fg">{truncate(p.prompt || '—', 60)}</Td>
                <Td>
                  <Badge tone={p.status === 'completed' ? 'success' : p.status === 'failed' ? 'danger' : 'brand'}>
                    {p.status}
                  </Badge>
                </Td>
                <Td className="font-mono text-2xs">{p.settings?.language ?? p.language ?? '—'}</Td>
                <Td className="whitespace-nowrap text-2xs">{relDate(p.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={page} pages={data.pages} total={data.total} limit={15} onChange={setPage} />}
      {data?.projects.length === 0 && <EmptyState icon={<Film size={30} />} title="No projects found" />}
    </Card>
  )
}

/* ── Audit log ────────────────────────────────────────────────────────────── */

function AuditTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: () => admin.auditLog(page, 50),
  })

  return (
    <Card>
      <CardHeader title="Audit log" subtitle="Every admin action is recorded here" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-border-hair">
              <Th>Time</Th><Th>Admin</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th><Th>IP</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {isLoading && <tr><td colSpan={6} className="p-5"><Skeleton className="h-10" /></td></tr>}
            {data?.logs.map((l, i) => (
              <tr key={i}>
                <Td className="whitespace-nowrap font-mono text-2xs">{fmtDateTime(l.created_at)}</Td>
                <Td className="!text-fg">{l.admin_email}</Td>
                <Td><Badge tone="brand">{l.action}</Badge></Td>
                <Td className="text-2xs">{l.target_email || l.target_id || '—'}</Td>
                <Td className="max-w-[220px] truncate text-2xs">{l.details}</Td>
                <Td className="font-mono text-2xs">{l.ip}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={page} pages={data.pages} total={data.total} limit={50} onChange={setPage} />}
      {data?.logs.length === 0 && <EmptyState icon={<ClipboardList size={30} />} title="No audit entries yet" />}
    </Card>
  )
}

/* ── Login history ────────────────────────────────────────────────────────── */

function LoginsTab() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 400)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'logins', page, debounced],
    queryFn: () => admin.loginHistory(page, 50, debounced),
  })

  return (
    <Card>
      <CardHeader
        title="Login history"
        subtitle="Every login attempt across all users"
        action={
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search email or IP…"
              className="h-9 w-52 rounded-lg border border-border-hair bg-surface-inset pl-9 pr-3 text-sm text-fg outline-none focus:border-border-accent"
            />
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-border-hair">
              <Th>Time</Th><Th>Email</Th><Th>Action</Th><Th>Device</Th><Th>Browser / OS</Th><Th>IP</Th><Th>Result</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {isLoading && <tr><td colSpan={7} className="p-5"><Skeleton className="h-10" /></td></tr>}
            {data?.logs.map((l, i) => (
              <tr key={i}>
                <Td className="whitespace-nowrap font-mono text-2xs">{fmtDateTime(l.created_at)}</Td>
                <Td className="!text-fg">{l.email || '—'}</Td>
                <Td className="text-2xs">{l.action}</Td>
                <Td className="text-2xs">{l.device}</Td>
                <Td className="text-2xs">{l.browser} / {l.os}</Td>
                <Td className="font-mono text-2xs">{l.ip}</Td>
                <Td>
                  <span className={cn('font-mono text-2xs font-semibold', l.success ? 'text-[var(--color-success-500)]' : 'text-[var(--color-danger-500)]')}>
                    {l.success ? '✓ OK' : `✗ ${l.failure_reason || 'failed'}`}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={page} pages={data.pages} total={data.total} limit={50} onChange={setPage} />}
    </Card>
  )
}

/* ── Live sessions ────────────────────────────────────────────────────────── */

function SessionsTab() {
  const toast = useToast()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sessions', page],
    queryFn: () => admin.sessions(page, 50),
  })

  const kill = useMutation({
    mutationFn: (id: string) => admin.killSession(id),
    onSuccess: () => { toast.success('Session terminated'); qc.invalidateQueries({ queryKey: ['admin', 'sessions'] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Card>
      <CardHeader title={`Live sessions${data ? ` (${data.total})` : ''}`} subtitle="All currently authenticated sessions" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-border-hair">
              <Th>User</Th><Th>Device</Th><Th>Browser / OS</Th><Th>IP</Th><Th>Started</Th><Th>Last active</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {isLoading && <tr><td colSpan={7} className="p-5"><Skeleton className="h-10" /></td></tr>}
            {data?.sessions.map((s) => (
              <tr key={s.session_id}>
                <Td className="font-mono text-2xs">{s.user_id}</Td>
                <Td className="text-2xs">{s.device}</Td>
                <Td className="text-2xs">{s.browser} / {s.os}</Td>
                <Td className="font-mono text-2xs">{s.ip}</Td>
                <Td className="whitespace-nowrap text-2xs">{fmtDateTime(s.created_at)}</Td>
                <Td className="whitespace-nowrap text-2xs">{fmtDateTime(s.last_active)}</Td>
                <Td>
                  <Button size="sm" variant="ghost" onClick={() => kill.mutate(s.session_id)}>
                    <X size={13} className="text-[var(--color-danger-500)]" />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={page} pages={data.pages} total={data.total} limit={50} onChange={setPage} />}
      {data?.sessions.length === 0 && <EmptyState icon={<Radio size={30} />} title="No active sessions" />}
    </Card>
  )
}
