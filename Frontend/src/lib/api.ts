/**
 * Typed client for the Mukku Flask backend.
 *
 * The backend is UNCHANGED by this migration. Every call here mirrors an
 * existing route exactly — see Frontend/MIGRATION_CONTRACT.md section 6.
 *
 * Auth is the httpOnly `mukku_token` cookie, so every request sends
 * credentials and the app must be served same-origin as Flask.
 */

import type {
  AdminHealth, AdminStats, AuthMe, GenerateResponse, LoginHistoryRow,
  Paginated, Project, ProjectStatus, SessionRow, Settings, UserMe, AdminUser,
} from './types'

/** Raised for any non-2xx response so callers can branch on status. */
export class ApiError extends Error {
  status: number
  payload: Record<string, unknown>
  constructor(status: number, payload: Record<string, unknown>) {
    super(
      (typeof payload?.error === 'string' && payload.error) ||
        (typeof payload?.message === 'string' && payload.message) ||
        `Request failed (${status})`,
    )
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** Pass a FormData to send multipart; Content-Type is left to the browser. */
  form?: FormData
  signal?: AbortSignal
}

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, form, signal } = opts

  const init: RequestInit = {
    method,
    credentials: 'include',
    signal,
    headers: {},
  }

  if (form) {
    init.body = form // browser sets multipart boundary
  } else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  const res = await fetch(path, init)

  // 204 / empty body
  const text = await res.text()
  let payload: unknown = {}
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: text.slice(0, 300) }
    }
  }

  if (!res.ok) throw new ApiError(res.status, payload as Record<string, unknown>)
  return payload as T
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) s.set(k, String(v))
  }
  const out = s.toString()
  return out ? `?${out}` : ''
}

/* ── Auth ─────────────────────────────────────────────────────────────────── */

export const auth = {
  /** Full user document (admin fields included). Used by dashboard + admin. */
  me: () => request<AuthMe>('/api/auth/me'),

  /** Slimmer shape with computed quota. Used by studio + landing nav. */
  userMe: () => request<UserMe>('/api/user/me'),

  register: (name: string, email: string, password: string) =>
    request<{ status: string; redirect: string }>('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
    }),

  /** Step 1. Returns either a completed login or `status: 'otp_required'`. */
  login: (email: string, password: string, remember: boolean) =>
    request<
      | { status: 'ok'; redirect: string }
      | { status: 'otp_required'; otp_token: string; message: string }
    >('/api/auth/login', { method: 'POST', body: { email, password, remember } }),

  /** Step 2. */
  verifyOtp: (otpToken: string, code: string, remember: boolean) =>
    request<{ status: string; redirect: string }>('/api/auth/verify-otp', {
      method: 'POST',
      body: { otp_token: otpToken, code, remember },
    }),

  logout: () =>
    request<{ status: string; redirect: string }>('/api/auth/logout', { method: 'POST' }),

  forgotPassword: (email: string) =>
    request<{ status: string; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    }),

  resetPassword: (token: string, password: string) =>
    request<{ status: string; redirect: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    }),

  verifyResetToken: (token: string) =>
    request<{ valid: boolean }>(`/api/auth/verify-reset-token${qs({ token })}`),

  /** Full page navigation — this is an OAuth redirect, not an XHR. */
  googleUrl: '/api/auth/google',
}

/* ── Current user self-service ────────────────────────────────────────────── */

export const user = {
  updateProfile: (name: string) =>
    request<{ status: string }>('/api/user/profile', { method: 'PUT', body: { name } }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ status: string }>('/api/user/change-password', {
      method: 'POST',
      body: { old_password: oldPassword, new_password: newPassword },
    }),

  sessions: () =>
    request<{ sessions: SessionRow[]; current_session_id: string }>('/api/user/sessions'),

  revokeSession: (sid: string) =>
    request<{ status: string }>(`/api/user/sessions/${encodeURIComponent(sid)}`, {
      method: 'DELETE',
    }),

  logoutAll: () =>
    request<{ status: string; revoked: number }>('/api/user/sessions/logout-all', {
      method: 'POST',
    }),

  loginHistory: (page = 1, limit = 20) =>
    request<{ logs: LoginHistoryRow[]; total: number; page: number }>(
      `/api/user/login-history${qs({ page, limit })}`,
    ),
}

/* ── Video generation ─────────────────────────────────────────────────────── */

export const videos = {
  /**
   * Multipart when files are attached, JSON otherwise — matching the branch in
   * `backend/app.py:generate`.
   */
  generate: (prompt: string, settings: Settings, files: File[] = []) => {
    if (files.length > 0) {
      const fd = new FormData()
      fd.append('prompt', prompt)
      fd.append('settings', JSON.stringify(settings))
      files.forEach((f) => fd.append('user_media', f))
      return request<GenerateResponse>('/generate', { method: 'POST', form: fd })
    }
    return request<GenerateResponse>('/generate', {
      method: 'POST',
      body: { prompt, settings },
    })
  },

  status: (projectId: string, signal?: AbortSignal) =>
    request<ProjectStatus>(`/status/${encodeURIComponent(projectId)}`, { signal }),

  list: (limit = 50) => request<{ projects: Project[]; total: number }>(`/projects${qs({ limit })}`),

  /** Permanently deletes the project and every artefact it produced. */
  remove: (id: string) =>
    request<{ status: string; deleted: string; files_removed: number }>(
      `/projects/${encodeURIComponent(id)}`, { method: 'DELETE' },
    ),

  /** Plain URLs — consumed by <video src> and <a href>, not fetched. */
  streamUrl: (id: string) => `/video/${encodeURIComponent(id)}`,
  downloadUrl: (id: string) => `/video/${encodeURIComponent(id)}?download=true`,
  thumbnailUrl: (id: string) => `/thumbnail/${encodeURIComponent(id)}`,
}

/* ── Enquiry (landing contact + enterprise form) ──────────────────────────── */

export const enquiry = (payload: {
  name: string
  email: string
  type?: string
  message: string
}) => request<{ status: string }>('/enquiry', { method: 'POST', body: payload })

/* ── Admin ────────────────────────────────────────────────────────────────── */

export interface BillingPlan {
  id: string
  amount: number | null   // paise; null = contact sales
  videos: number          // -1 = unlimited
  label: string
}

export interface RazorpayOrder {
  order_id: string
  amount: number
  currency: string
  key_id: string
  plan: string
  name: string
  email: string
}

export const billing = {
  plans: () =>
    request<{ configured: boolean; currency: string; plans: BillingPlan[] }>(
      '/api/billing/plans'),

  /** Creates a Razorpay order server-side. The client never sends an amount. */
  createOrder: (plan: string) =>
    request<RazorpayOrder>('/api/billing/order', { method: 'POST', body: { plan } }),

  status: () =>
    request<{
      plan: string; quota: number; configured: boolean
      payments: Array<{ order_id: string; plan: string; amount: number
                        status: string; created_at?: string; paid_at?: string }>
    }>('/api/billing/status'),
}

export const admin = {
  stats: () => request<AdminStats>('/api/admin/stats'),

  users: (page = 1, limit = 15, search = '', plan = '') =>
    request<Paginated<AdminUser, 'users'>>(`/api/admin/users${qs({ page, limit, search, plan })}`),

  updateUser: (id: string, updates: Partial<Pick<AdminUser, 'name' | 'plan' | 'is_active'>>) =>
    request<{ status: string }>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: updates,
    }),

  deleteUser: (id: string) =>
    request<{ status: string }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  admins: () =>
    request<{ admins: AdminUser[]; all_permissions: string[] }>('/api/admin/admins'),

  createAdmin: (name: string, email: string, permissions: string[], sendEmail: boolean) =>
    request<{ status: string; action: string; temp_password: string | null }>(
      '/api/admin/admins',
      { method: 'POST', body: { name, email, permissions, send_email: sendEmail } },
    ),

  updateAdmin: (id: string, updates: { permissions?: string[]; name?: string; is_active?: boolean }) =>
    request<{ status: string }>(`/api/admin/admins/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: updates,
    }),

  revokeAdmin: (id: string) =>
    request<{ status: string }>(`/api/admin/admins/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  projects: (page = 1, limit = 15, status = '') =>
    request<Paginated<Project, 'projects'>>(`/api/admin/projects${qs({ page, limit, status })}`),

  health: () => request<AdminHealth>('/api/admin/health'),

  loginHistory: (page = 1, limit = 50, search = '') =>
    request<Paginated<LoginHistoryRow, 'logs'>>(
      `/api/admin/login-history${qs({ page, limit, search })}`,
    ),

  sessions: (page = 1, limit = 50) =>
    request<Paginated<SessionRow, 'sessions'>>(`/api/admin/sessions${qs({ page, limit })}`),

  killSession: (id: string) =>
    request<{ status: string }>(`/api/admin/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  auditLog: (page = 1, limit = 50) =>
    request<Paginated<Record<string, string>, 'logs'>>(`/api/admin/audit-log${qs({ page, limit })}`),
}
