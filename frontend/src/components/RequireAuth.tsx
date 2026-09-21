import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../context/useAuth'
import CenteredPanel from './CenteredPanel'
import SessionStatus from './SessionStatus'

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'checking' || status === 'error') {
    return (
      <CenteredPanel>
        <SessionStatus status={status} />
      </CenteredPanel>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default RequireAuth
