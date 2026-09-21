import { createContext } from 'react'

import type { AuthenticatedUser, Organization } from '../api/auth'

export type AuthState =
  | { status: 'checking' }
  | { status: 'unauthenticated' }
  | { status: 'error'; error: unknown }
  | {
      status: 'authenticated'
      token: string
      user: AuthenticatedUser
      organization: Organization
    }

export type AuthContextValue = AuthState & {
  establishSession: (accessToken: string) => Promise<void>
  retrySession: () => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
