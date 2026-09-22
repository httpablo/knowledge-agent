import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ChatColumn from './ChatColumn'
import type { ChatMessage, UseChatResult } from './useChat'

function makeChat(overrides: Partial<UseChatResult> = {}): UseChatResult {
  return {
    messages: [],
    hasThread: false,
    draft: '',
    setDraft: vi.fn(),
    sending: false,
    errorKey: null,
    send: vi.fn(),
    stop: vi.fn(),
    retryLast: vi.fn(),
    restoring: false,
    restoreErrorKey: null,
    retryRestore: vi.fn(),
    startNewConversation: vi.fn(),
    latestSources: [],
    ...overrides,
  }
}

function renderChat(chat: UseChatResult) {
  return render(
    <ChatColumn
      documentCount={1}
      readyCount={1}
      uploading={false}
      onFiles={vi.fn()}
      chat={chat}
    />,
  )
}

describe('ChatColumn', () => {
  it('renders the localized not-found message when the answer is not answerable', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        answerable: false,
        sources: [],
      },
    ]

    renderChat(makeChat({ messages, hasThread: true }))

    expect(
      screen.getByText('I couldn’t find that in your documents.'),
    ).toBeInTheDocument()
  })

  it('shows the sources returned with the latest answer', () => {
    renderChat(
      makeChat({
        latestSources: [
          {
            chunk_id: 'chunk-1',
            document_id: 'doc-1',
            filename: 'lease.pdf',
            page_number: 3,
            content: '30 days notice required.',
          },
        ],
      }),
    )

    expect(screen.getByText('lease.pdf')).toBeInTheDocument()
  })

  it('sends the question on Enter', () => {
    const send = vi.fn()
    renderChat(makeChat({ draft: 'What is the notice period?', send }))

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(send).toHaveBeenCalledWith('What is the notice period?')
  })

  it('does not send on Shift+Enter', () => {
    const send = vi.fn()
    renderChat(makeChat({ draft: 'A new line, please', send }))

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      shiftKey: true,
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('does not send while composing with an IME', () => {
    const send = vi.fn()
    renderChat(makeChat({ draft: 'こんにちは', send }))

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      keyCode: 229,
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('shows the thinking indicator while a question is pending', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'What is the notice period?' },
    ]

    renderChat(makeChat({ messages, hasThread: true, sending: true }))

    expect(
      screen.getByText('Searching your documents…'),
    ).toBeInTheDocument()
  })

  it('hides the thinking indicator once the answer arrives', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'What is the notice period?' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'The notice period is 30 days.',
        answerable: true,
        sources: [],
      },
    ]

    renderChat(makeChat({ messages, hasThread: true, sending: false }))

    expect(
      screen.queryByText('Searching your documents…'),
    ).not.toBeInTheDocument()
  })

  it('hides the thinking indicator when the request errors out', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'What is the notice period?' },
    ]

    renderChat(
      makeChat({
        messages,
        hasThread: true,
        sending: false,
        errorKey: 'chatUnavailable',
      }),
    )

    expect(
      screen.queryByText('Searching your documents…'),
    ).not.toBeInTheDocument()
  })

  it('hides the thinking indicator once the request is cancelled', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'What is the notice period?' },
    ]

    renderChat(makeChat({ messages, hasThread: true, sending: false }))

    expect(
      screen.queryByText('Searching your documents…'),
    ).not.toBeInTheDocument()
  })

  it('does not persist the thinking indicator as a message', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'What is the notice period?' },
    ]

    renderChat(makeChat({ messages, hasThread: true, sending: true }))

    expect(messages).toHaveLength(1)
  })
})
