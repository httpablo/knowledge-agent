import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { sendChatMessage } from '../../api/chat'
import { ApiError } from '../../api/client'
import type { Translation } from '../../i18n/en'
import ErrorMessage from '../ErrorMessage'
import SubmitButton from '../SubmitButton'

const MAX_QUESTION_LENGTH = 2000
const IME_KEY_CODE = 229

type ChatMessage =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; answerable: boolean }

function errorKeyFor(error: unknown): keyof Translation {
  if (error instanceof ApiError && error.status === 422) {
    return 'invalidQuestion'
  }

  return 'chatUnavailable'
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const notFound = message.role === 'assistant' && !message.answerable

  return (
    <li
      className={`max-w-[85%] rounded-xl border px-3 py-2 ${
        isUser
          ? 'self-end border-indigo-200 bg-indigo-50'
          : 'self-start border-border bg-surface'
      }`}
    >
      <p className="mb-0.5 text-xs font-medium text-muted-foreground">
        {isUser ? t('you') : t('assistant')}
      </p>
      <p
        className={`text-sm whitespace-pre-wrap wrap-anywhere ${
          notFound ? 'text-muted-foreground' : ''
        }`}
      >
        {notFound ? t('answerNotFound') : message.content}
      </p>
    </li>
  )
}

function ChatPanel({ token }: { token: string }) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [errorKey, setErrorKey] = useState<keyof Translation | null>(null)
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const messageList = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => {
      controller.current?.abort()
    }
  }, [])

  useEffect(() => {
    const list = messageList.current

    if (list) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages, errorKey])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const question = draft.trim()

    if (inFlight.current || !question) {
      return
    }

    inFlight.current = true
    setSending(true)
    setErrorKey(null)
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: question },
    ])
    setDraft('')

    const request = new AbortController()
    controller.current = request

    try {
      const response = await sendChatMessage(
        token,
        conversationId
          ? { question, conversation_id: conversationId }
          : { question },
        request.signal,
      )

      if (request.signal.aborted) {
        return
      }

      setConversationId(response.conversation_id)
      setMessages((current) => [
        ...current,
        {
          id: response.message_id,
          role: 'assistant',
          content: response.answer,
          answerable: response.answerable,
        },
      ])
    } catch (error) {
      if (request.signal.aborted) {
        return
      }

      setErrorKey(errorKeyFor(error))
    } finally {
      if (!request.signal.aborted) {
        setSending(false)
        inFlight.current = false
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const composing =
      event.nativeEvent.isComposing || event.keyCode === IME_KEY_CODE

    if (event.key === 'Enter' && !event.shiftKey && !composing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
      <div
        ref={messageList}
        role="log"
        aria-label={t('chat')}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('askYourDocuments')}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ul>
        )}
      </div>

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      <form onSubmit={handleSubmit} noValidate className="space-y-2">
        <label htmlFor="chat-question" className="sr-only">
          {t('questionLabel')}
        </label>
        <textarea
          id="chat-question"
          required
          rows={3}
          maxLength={MAX_QUESTION_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <SubmitButton disabled={sending || !draft.trim()}>
          {sending ? t('sending') : t('send')}
        </SubmitButton>
      </form>
    </div>
  )
}

export default ChatPanel
