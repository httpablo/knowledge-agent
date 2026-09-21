import { useContext } from 'react'

import type { AuthContextValue } from './AuthContext'
import { AuthContext } from './AuthContext'

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }

  return context
}
