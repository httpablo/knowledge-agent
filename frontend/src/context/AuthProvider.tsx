import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { getMe } from '../api/auth'
import { ApiError } from '../api/client'
import { clearStoredConversationId } from '../components/workspace/useChat'
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

  const verification = useRef<AbortController | null>(null)

  const cancelVerification = useCallback(() => {
    verification.current?.abort()
    verification.current = null
  }, [])

  const verifySession = useCallback(
    (token: string) => {
      cancelVerification()
      const controller = new AbortController()
      verification.current = controller

      getMe(token, controller.signal)
        .then((me) => {
          if (controller.signal.aborted) {
            return
          }

          verification.current = null
          setState({ status: 'authenticated', token, ...me })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return
          }

          verification.current = null

          if (isExpiredSession(error)) {
            clearToken()
            setState({ status: 'unauthenticated' })
            return
          }

          setState({ status: 'error', error })
        })
    },
    [cancelVerification],
  )

  useEffect(() => {
    const token = readToken()

    if (token) {
      verifySession(token)
    }

    return cancelVerification
  }, [verifySession, cancelVerification])

  const retrySession = useCallback(() => {
    if (verification.current) {
      return
    }

    const token = readToken()

    if (token) {
      setState({ status: 'checking' })
      verifySession(token)
    } else {
      setState({ status: 'unauthenticated' })
    }
  }, [verifySession])

  const establishSession = useCallback(async (accessToken: string) => {
    const me = await getMe(accessToken)

    storeToken(accessToken)
    setState({ status: 'authenticated', token: accessToken, ...me })
  }, [])

  const logout = useCallback(() => {
    cancelVerification()
    clearToken()
    clearStoredConversationId()
    setState({ status: 'unauthenticated' })
  }, [cancelVerification])

  const value = useMemo(
    () => ({ ...state, establishSession, retrySession, logout }),
    [state, establishSession, retrySession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
