import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { sendChatMessage } from '../../api/chat'
import type { ChatSource } from '../../api/chat'
import { ApiError } from '../../api/client'
import type { Translation } from '../../i18n/en'
import ErrorMessage from '../ErrorMessage'
import SubmitButton from '../SubmitButton'
import MessageSources from './MessageSources'

const MAX_QUESTION_LENGTH = 2000
const IME_KEY_CODE = 229

type ChatMessage =
  | { id: string; role: 'user'; content: string }
  | {
      id: string
      role: 'assistant'
      content: string
      answerable: boolean
      sources: ChatSource[]
    }

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
      className={`flex max-w-[90%] flex-col gap-1 sm:max-w-[85%] ${
        isUser ? 'items-end self-end' : 'items-start self-start'
      }`}
    >
      <p className="text-meta font-medium text-muted-foreground">
        {isUser ? t('you') : t('assistant')}
      </p>
      <div
        className={`rounded-2xl border px-4 py-2.5 ${
          isUser
            ? 'rounded-tr-md border-primary-border bg-primary-subtle'
            : 'rounded-tl-md border-border bg-background'
        }`}
      >
        <p
          className={`text-[0.9375rem] leading-relaxed whitespace-pre-wrap wrap-anywhere ${
            notFound ? 'text-muted-foreground' : ''
          }`}
        >
          {notFound ? t('answerNotFound') : message.content}
        </p>
        {message.role === 'assistant' &&
          message.answerable &&
          message.sources.length > 0 && (
            <MessageSources sources={message.sources} />
          )}
      </div>
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
          sources: response.sources,
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={messageList}
        role="log"
        aria-label={t('chat')}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
          {messages.length === 0 ? (
            <div className="my-auto py-8 text-center">
              <p className="font-medium">{t('askYourDocuments')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('askYourDocumentsHint')}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-5">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex items-end gap-2"
          >
            <label htmlFor="chat-question" className="sr-only">
              {t('questionLabel')}
            </label>
            <textarea
              id="chat-question"
              required
              rows={2}
              maxLength={MAX_QUESTION_LENGTH}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              className="max-h-40 min-h-[3.25rem] w-full min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-base leading-snug hover:border-muted-foreground sm:text-[0.9375rem]"
            />
            <SubmitButton disabled={sending || !draft.trim()} fullWidth={false}>
              {sending ? t('sending') : t('send')}
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ChatPanel
