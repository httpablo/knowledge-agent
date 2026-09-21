import { createContext, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import type { AuthenticatedUser, Organization } from '../api/auth'
import { getMe } from '../api/auth'
import { ApiError } from '../api/client'

const TOKEN_KEY = 'knowledge-agent-access-token'

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
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    return
  }
}

function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    return
  }
}

function stateForFailure(error: unknown): AuthState {
  if (error instanceof ApiError && error.status === 401) {
    clearToken()
    return { status: 'unauthenticated' }
  }

  return { status: 'error', error }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    readToken() ? { status: 'checking' } : { status: 'unauthenticated' },
  )

  useEffect(() => {
    const token = readToken()

    if (!token) {
      return
    }

    const controller = new AbortController()

    getMe(token, controller.signal)
      .then((me) => {
        setState({ status: 'authenticated', token, ...me })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setState(stateForFailure(error))
      })

    return () => {
      controller.abort()
    }
  }, [])

  const establishSession = useCallback(async (accessToken: string) => {
    const me = await getMe(accessToken)

    storeToken(accessToken)
    setState({ status: 'authenticated', token: accessToken, ...me })
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setState({ status: 'unauthenticated' })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, establishSession, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
