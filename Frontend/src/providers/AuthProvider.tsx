import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, auth } from '@/lib/api'
import type { AuthMe } from '@/lib/types'

interface AuthCtx {
  user: AuthMe | null
  loading: boolean
  /** True only once the first /api/auth/me round-trip has settled. */
  resolved: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  can: (perm: string) => boolean
  refresh: () => Promise<unknown>
  clear: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: auth.me,
    // A 401 is a legitimate "logged out" answer, not a transient failure.
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })

  const user = (q.data as AuthMe | undefined) ?? null
  const isSuperAdmin = user?.is_super_admin === true || user?.role === 'super_admin'
  const isAdmin = isSuperAdmin || user?.is_admin === true || user?.role === 'admin'

  const can = (perm: string) => {
    if (!user) return false
    if (isSuperAdmin) return true
    return (user.permissions ?? []).includes(perm)
  }

  const value: AuthCtx = {
    user,
    loading: q.isLoading,
    resolved: !q.isLoading && q.fetchStatus !== 'fetching',
    isAdmin,
    isSuperAdmin,
    can,
    refresh: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
    clear: () => qc.setQueryData(['auth', 'me'], null),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
