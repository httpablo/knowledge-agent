import { useEffect, useRef, useState } from 'react'

import { getConversationMessages, sendChatMessage } from '../../api/chat'
import type { ChatSource, MessageResponse } from '../../api/chat'
import { ApiError } from '../../api/client'
import type { Translation } from '../../i18n/en'

const CONVERSATION_STORAGE_KEY = 'knowledge-agent-conversation-id'

export type ChatMessage =
  | { id: string; role: 'user'; content: string }
  | {
      id: string
      role: 'assistant'
      content: string
      answerable: boolean
      sources: ChatSource[]
    }

function readStoredConversationId(): string | null {
  try {
    return localStorage.getItem(CONVERSATION_STORAGE_KEY)
  } catch {
    return null
  }
}

function storeConversationId(conversationId: string): void {
  try {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId)
  } catch {}
}

export function clearStoredConversationId(): void {
  try {
    localStorage.removeItem(CONVERSATION_STORAGE_KEY)
  } catch {}
}

function toChatMessage(message: MessageResponse): ChatMessage {
  if (message.role === 'USER') {
    return { id: message.id, role: 'user', content: message.content }
  }

  return {
    id: message.id,
    role: 'assistant',
    content: message.content,
    answerable: message.content !== '' || message.sources.length > 0,
    sources: message.sources,
  }
}

function errorKeyFor(error: unknown): keyof Translation {
  if (error instanceof ApiError && error.status === 422) {
    return 'invalidQuestion'
  }

  return 'chatUnavailable'
}

export function useChat(token: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [errorKey, setErrorKey] = useState<keyof Translation | null>(null)
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(
    null,
  )
  const [restoring, setRestoring] = useState(
    () => readStoredConversationId() !== null,
  )
  const [restoreErrorKey, setRestoreErrorKey] = useState<
    keyof Translation | null
  >(null)
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      controller.current?.abort()
    }
  }, [])

  useEffect(() => {
    const storedId = readStoredConversationId()

    if (!storedId) {
      return
    }

    let cancelled = false

    getConversationMessages(token, storedId)
      .then((history) => {
        if (cancelled) {
          return
        }

        setConversationId(storedId)
        setMessages(history.map(toChatMessage))
        setRestoring(false)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        if (error instanceof ApiError && error.status === 404) {
          clearStoredConversationId()
          setRestoring(false)
          return
        }

        setRestoreErrorKey('conversationLoadError')
        setRestoring(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, restoreAttempt])

  async function send(question: string) {
    const trimmed = question.trim()

    if (inFlight.current || !trimmed) {
      return
    }

    inFlight.current = true
    setSending(true)
    setErrorKey(null)
    setLastFailedQuestion(null)
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: trimmed },
    ])
    setDraft('')

    const request = new AbortController()
    controller.current = request

    try {
      const response = await sendChatMessage(
        token,
        conversationId
          ? { question: trimmed, conversation_id: conversationId }
          : { question: trimmed },
        request.signal,
      )

      if (request.signal.aborted) {
        return
      }

      setConversationId(response.conversation_id)
      storeConversationId(response.conversation_id)
      setMessages((current) => [
        ...current,
        {
          id: response.message_id,
          role: 'assistant',
          content: response.answer,
          answerable: response.answerable,
          sources: response.sources,
        },
      ])
    } catch (error) {
      if (request.signal.aborted) {
        return
      }

      setErrorKey(errorKeyFor(error))
      setLastFailedQuestion(trimmed)
    } finally {
      if (!request.signal.aborted) {
        setSending(false)
        inFlight.current = false
      }
    }
  }

  function stop() {
    controller.current?.abort()
    setSending(false)
    inFlight.current = false
  }

  function retryLast() {
    if (lastFailedQuestion) {
      void send(lastFailedQuestion)
    }
  }

  function retryRestore() {
    setRestoring(true)
    setRestoreErrorKey(null)
    setRestoreAttempt((current) => current + 1)
  }

  function startNewConversation() {
    if (sending) {
      return
    }

    clearStoredConversationId()
    setConversationId(null)
    setMessages([])
    setErrorKey(null)
    setLastFailedQuestion(null)
    setRestoreErrorKey(null)
  }

  const lastSourcedAnswer = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' &&
        message.answerable &&
        message.sources.length > 0,
    ) as Extract<ChatMessage, { role: 'assistant' }> | undefined

  return {
    messages,
    hasThread: messages.length > 0,
    draft,
    setDraft,
    sending,
    errorKey,
    send,
    stop,
    retryLast,
    restoring,
    restoreErrorKey,
    retryRestore,
    startNewConversation,
    latestSources: lastSourcedAnswer?.sources ?? [],
  }
}

export type UseChatResult = ReturnType<typeof useChat>
