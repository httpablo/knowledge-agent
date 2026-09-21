import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../context/useAuth'
import SessionStatus from './SessionStatus'

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'checking' || status === 'error') {
    return <SessionStatus status={status} />
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default RequireAuth
