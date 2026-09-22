import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/client'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

vi.mock('../api/auth', () => ({
  getMe: vi.fn(),
}))

const { getMe } = await import('../api/auth')
const getMeMock = vi.mocked(getMe)

const TOKEN_KEY = 'knowledge-agent-access-token'
const CONVERSATION_KEY = 'knowledge-agent-conversation-id'

const ME_RESPONSE = {
  user: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
  organization: { id: 'o1', name: 'Ada Workspace' },
}

function Consumer() {
  const auth = useAuth()

  return (
    <div>
      <p data-testid="status">{auth.status}</p>
      {auth.status === 'authenticated' && (
        <p data-testid="user">{auth.user.name}</p>
      )}
      <button onClick={auth.retrySession}>retry</button>
      <button onClick={auth.logout}>logout</button>
    </div>
  )
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  getMeMock.mockReset()
})

describe('AuthProvider', () => {
  it('starts unauthenticated when there is no stored token', () => {
    renderAuth()

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    expect(getMeMock).not.toHaveBeenCalled()
  })

  it('authenticates when a stored token passes /me', async () => {
    localStorage.setItem(TOKEN_KEY, 'valid-token')
    getMeMock.mockResolvedValue(ME_RESPONSE)

    renderAuth()

    expect(screen.getByTestId('status')).toHaveTextContent('checking')
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(screen.getByTestId('user')).toHaveTextContent('Ada')
  })

  it('clears the token and goes unauthenticated when /me returns 401', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired-token')
    getMeMock.mockRejectedValue(new ApiError(401, 'expired'))

    renderAuth()

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent(
        'unauthenticated',
      ),
    )
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('preserves the token and reports an error when /me fails with a 5xx or network error', async () => {
    localStorage.setItem(TOKEN_KEY, 'kept-token')
    getMeMock.mockRejectedValue(new ApiError(500, 'boom'))

    renderAuth()

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )
    expect(localStorage.getItem(TOKEN_KEY)).toBe('kept-token')
  })

  it('retries verification on demand and recovers from the error state', async () => {
    const user = userEvent.setup()
    localStorage.setItem(TOKEN_KEY, 'kept-token')
    getMeMock.mockRejectedValueOnce(new ApiError(500, 'boom'))
    getMeMock.mockResolvedValueOnce(ME_RESPONSE)

    renderAuth()

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )

    await user.click(screen.getByText('retry'))

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(getMeMock).toHaveBeenCalledTimes(2)
  })

  it('ignores rapid repeated retry clicks while a check is already in flight', async () => {
    const user = userEvent.setup()
    localStorage.setItem(TOKEN_KEY, 'kept-token')
    const first = deferred<typeof ME_RESPONSE>()
    getMeMock.mockReturnValueOnce(first.promise)

    renderAuth()

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('checking'),
    )

    await user.click(screen.getByText('retry'))
    await user.click(screen.getByText('retry'))
    await user.click(screen.getByText('retry'))

    expect(getMeMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve(ME_RESPONSE)
    })

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(getMeMock).toHaveBeenCalledTimes(1)
  })

  it('clears the token and the conversation id on logout', async () => {
    const user = userEvent.setup()
    localStorage.setItem(TOKEN_KEY, 'valid-token')
    localStorage.setItem(CONVERSATION_KEY, 'conversation-1')
    getMeMock.mockResolvedValue(ME_RESPONSE)

    renderAuth()

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )

    await user.click(screen.getByText('logout'))

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(CONVERSATION_KEY)).toBeNull()
  })
})
