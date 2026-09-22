import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../api/client'
import { clearStoredConversationId, useChat } from './useChat'

vi.mock('../../api/chat', () => ({
  sendChatMessage: vi.fn(),
  getConversationMessages: vi.fn(),
}))

const { sendChatMessage, getConversationMessages } =
  await import('../../api/chat')
const sendChatMessageMock = vi.mocked(sendChatMessage)
const getConversationMessagesMock = vi.mocked(getConversationMessages)

const CONVERSATION_KEY = 'knowledge-agent-conversation-id'

beforeEach(() => {
  localStorage.clear()
  sendChatMessageMock.mockReset()
  getConversationMessagesMock.mockReset()
})

describe('useChat', () => {
  it('does not send a conversation_id on the first question', async () => {
    sendChatMessageMock.mockResolvedValue({
      conversation_id: 'c1',
      message_id: 'm1',
      answerable: true,
      answer: 'The notice period is 30 days.',
      sources: [],
    })

    const { result } = renderHook(() => useChat('token'))
    await waitFor(() => expect(result.current.restoring).toBe(false))

    await act(async () => {
      await result.current.send('What is the notice period?')
    })

    expect(sendChatMessageMock).toHaveBeenCalledWith(
      'token',
      { question: 'What is the notice period?' },
      expect.anything(),
    )
  })

  it('uses the conversation_id returned by the previous answer on the next question', async () => {
    sendChatMessageMock.mockResolvedValueOnce({
      conversation_id: 'c1',
      message_id: 'm1',
      answerable: true,
      answer: 'First answer.',
      sources: [],
    })
    sendChatMessageMock.mockResolvedValueOnce({
      conversation_id: 'c1',
      message_id: 'm2',
      answerable: true,
      answer: 'Second answer.',
      sources: [],
    })

    const { result } = renderHook(() => useChat('token'))
    await waitFor(() => expect(result.current.restoring).toBe(false))

    await act(async () => {
      await result.current.send('First question')
    })
    await act(async () => {
      await result.current.send('Second question')
    })

    expect(sendChatMessageMock).toHaveBeenNthCalledWith(
      2,
      'token',
      { question: 'Second question', conversation_id: 'c1' },
      expect.anything(),
    )
  })

  it('restores a persisted conversation on mount', async () => {
    localStorage.setItem(CONVERSATION_KEY, 'stored-c1')
    getConversationMessagesMock.mockResolvedValue([
      {
        id: 'm1',
        role: 'USER',
        content: 'What is the notice period?',
        sources: [],
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'm2',
        role: 'ASSISTANT',
        content: 'The notice period is 30 days.',
        sources: [
          {
            chunk_id: 'chunk-1',
            document_id: 'doc-1',
            filename: 'lease.pdf',
            page_number: 3,
            content: '30 days notice required.',
          },
        ],
        created_at: '2026-01-01T00:00:01Z',
      },
    ])

    const { result } = renderHook(() => useChat('token'))

    await waitFor(() => expect(result.current.restoring).toBe(false))
    expect(result.current.messages).toHaveLength(2)
    expect(getConversationMessagesMock).toHaveBeenCalledWith(
      'token',
      'stored-c1',
    )

    expect(result.current.latestSources).toHaveLength(1)
    expect(result.current.latestSources[0].filename).toBe('lease.pdf')

    sendChatMessageMock.mockResolvedValue({
      conversation_id: 'stored-c1',
      message_id: 'm3',
      answerable: true,
      answer: 'Follow-up answer.',
      sources: [],
    })

    await act(async () => {
      await result.current.send('Follow-up question')
    })

    expect(sendChatMessageMock).toHaveBeenCalledWith(
      'token',
      { question: 'Follow-up question', conversation_id: 'stored-c1' },
      expect.anything(),
    )
  })

  it('clears the id and opens an empty chat when history returns 404', async () => {
    localStorage.setItem(CONVERSATION_KEY, 'stale-c1')
    getConversationMessagesMock.mockRejectedValue(new ApiError(404, 'gone'))

    const { result } = renderHook(() => useChat('token'))

    await waitFor(() => expect(result.current.restoring).toBe(false))
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.restoreErrorKey).toBeNull()
    expect(localStorage.getItem(CONVERSATION_KEY)).toBeNull()
  })

  it('preserves the id and offers a retry when history fails with a 5xx', async () => {
    localStorage.setItem(CONVERSATION_KEY, 'kept-c1')
    getConversationMessagesMock.mockRejectedValue(new ApiError(500, 'boom'))

    const { result } = renderHook(() => useChat('token'))

    await waitFor(() => expect(result.current.restoring).toBe(false))
    expect(result.current.restoreErrorKey).toBe('conversationLoadError')
    expect(localStorage.getItem(CONVERSATION_KEY)).toBe('kept-c1')
  })

  it('clears the id and messages when starting a new conversation', async () => {
    sendChatMessageMock.mockResolvedValue({
      conversation_id: 'c1',
      message_id: 'm1',
      answerable: true,
      answer: 'An answer.',
      sources: [],
    })

    const { result } = renderHook(() => useChat('token'))
    await waitFor(() => expect(result.current.restoring).toBe(false))

    await act(async () => {
      await result.current.send('A question')
    })
    expect(result.current.hasThread).toBe(true)

    act(() => {
      result.current.startNewConversation()
    })

    expect(result.current.messages).toHaveLength(0)
    expect(localStorage.getItem(CONVERSATION_KEY)).toBeNull()

    sendChatMessageMock.mockClear()
    sendChatMessageMock.mockResolvedValue({
      conversation_id: 'c2',
      message_id: 'm2',
      answerable: true,
      answer: 'Another answer.',
      sources: [],
    })

    await act(async () => {
      await result.current.send('A new question')
    })

    expect(sendChatMessageMock).toHaveBeenCalledWith(
      'token',
      { question: 'A new question' },
      expect.anything(),
    )
  })

  it('keeps the user message when generating the answer fails', async () => {
    sendChatMessageMock.mockRejectedValue(new ApiError(503, 'unavailable'))

    const { result } = renderHook(() => useChat('token'))
    await waitFor(() => expect(result.current.restoring).toBe(false))

    await act(async () => {
      await result.current.send('A question that fails')
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'A question that fails',
    })
    expect(result.current.errorKey).toBe('chatUnavailable')
  })

  it('always reflects the sources of the latest assistant message', async () => {
    const source = {
      chunk_id: 'chunk-1',
      document_id: 'doc-1',
      filename: 'lease.pdf',
      page_number: 3,
      content: '30 days notice required.',
    }

    sendChatMessageMock.mockResolvedValueOnce({
      conversation_id: 'c1',
      message_id: 'm1',
      answerable: true,
      answer: 'The notice period is 30 days.',
      sources: [source],
    })

    const { result } = renderHook(() => useChat('token'))
    await waitFor(() => expect(result.current.restoring).toBe(false))

    await act(async () => {
      await result.current.send('What is the notice period?')
    })

    expect(result.current.latestSources).toEqual([source])

    sendChatMessageMock.mockResolvedValueOnce({
      conversation_id: 'c1',
      message_id: 'm2',
      answerable: false,
      answer: '',
      sources: [],
    })

    await act(async () => {
      await result.current.send('What is the meaning of life?')
    })

    expect(result.current.latestSources).toEqual([])

    sendChatMessageMock.mockResolvedValueOnce({
      conversation_id: 'c1',
      message_id: 'm3',
      answerable: true,
      answer: 'Reimbursement takes up to 10 business days.',
      sources: [{ ...source, chunk_id: 'chunk-2', filename: 'policy.pdf' }],
    })

    await act(async () => {
      await result.current.send('And reimbursement?')
    })

    expect(result.current.latestSources).toHaveLength(1)
    expect(result.current.latestSources[0].filename).toBe('policy.pdf')
  })
})

describe('clearStoredConversationId', () => {
  it('removes the stored conversation id', () => {
    localStorage.setItem(CONVERSATION_KEY, 'some-id')
    clearStoredConversationId()
    expect(localStorage.getItem(CONVERSATION_KEY)).toBeNull()
  })
})
