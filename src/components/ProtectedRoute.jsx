import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth-context'

export default function ProtectedRoute({ children }) {
  const { user, status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <div className="min-h-screen grid place-items-center text-sm text-gray-400" role="status">Restoring your session…</div>
  return user ? children : <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
}
