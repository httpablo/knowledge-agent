import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { getMe } from '../api/auth'
import { ApiError } from '../api/client'
import { AuthContext } from './AuthContext'
import type { AuthState } from './AuthContext'

const TOKEN_KEY = 'knowledge-agent-access-token'

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
  } catch {}
}

function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

function isExpiredSession(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
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

        if (isExpiredSession(error)) {
          clearToken()
          setState({ status: 'unauthenticated' })
          return
        }

        setState({ status: 'error', error })
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

  const value = useMemo(
    () => ({ ...state, establishSession, logout }),
    [state, establishSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
