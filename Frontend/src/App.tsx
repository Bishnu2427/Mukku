import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './providers/AuthProvider'
import { PageLoader } from './components/ui/PageLoader'
import { ThemeToggle } from './components/ui/ThemeToggle'

// Route-level code splitting keeps the landing bundle small — three.js and
// recharts only download when a route that needs them is opened.
const Landing        = lazy(() => import('./pages/Landing'))
const Studio         = lazy(() => import('./pages/Studio'))
const Dashboard      = lazy(() => import('./pages/Dashboard'))
const Admin          = lazy(() => import('./pages/Admin'))
const Login          = lazy(() => import('./pages/auth/Login'))
const Register       = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword  = lazy(() => import('./pages/auth/ResetPassword'))
const NotFound       = lazy(() => import('./pages/NotFound'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  return null
}

/** Gate for pages that require a session. Mirrors Flask's redirect to /login. */
function RequireAuth({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  // Backend answers 404 for non-admins hitting /admin; the SPA mirrors that
  // by sending them somewhere they can actually use.
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/** Signed-in users should never see the login or register screens. */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <PageLoader />
  if (user) return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <ThemeToggle />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/studio" element={<Studio />} />

          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth adminOnly>
                <Admin />
              </RequireAuth>
            }
          />

          <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
          <Route path="/register" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  )
}
