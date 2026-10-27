import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'

export default function ProtectedRoute({ children }) {
  const { user, status } = useAuth()
  if (status === 'loading') return null
  return user ? children : <Navigate to="/login" replace />
}