import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import Button from '../acervo/Button'
import Dropzone from '../acervo/Dropzone'
import Notice from '../acervo/Notice'
import { MAX_UPLOAD_SIZE_MB } from './useDocuments'
import type { ChatMessage, UseChatResult } from './useChat'
import SourcesColumn from './SourcesColumn'

const IME_KEY_CODE = 229
const MAX_QUESTION_LENGTH = 2000
const SUGGESTION_KEYS = ['suggestion1', 'suggestion2', 'suggestion3'] as const

function MessageBlock({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()

  if (message.role === 'user') {
    return (
      <p className="max-w-full self-start rounded-[var(--radius-md)] bg-[var(--paper-sunken)] px-4 py-3 font-[family-name:var(--font-serif)] text-[17px] leading-[26px] font-medium wrap-anywhere text-[var(--ink)]">
        {message.content}
      </p>
    )
  }

  const notFound = !message.answerable

  return (
    <div className="flex max-w-[var(--measure)] flex-col gap-3">
      <p
        className={`font-[family-name:var(--font-serif)] text-[17px] leading-7 wrap-anywhere ${notFound ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink)]'}`}
      >
        {notFound ? t('answerNotFound') : message.content}
      </p>
      <p className="font-[family-name:var(--font-sans)] text-xs leading-4 text-[var(--ink-muted)]">
        {t('aiGeneratedNote')}
      </p>
    </div>
  )
}

function ChatColumn({
  documentCount,
  readyCount,
  onFiles,
  chat,
}: {
  documentCount: number
  readyCount: number
  onFiles: (files: File[]) => void
  chat: UseChatResult
}) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [chat.messages, chat.errorKey])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const composing =
      event.nativeEvent.isComposing || event.keyCode === IME_KEY_CODE

    if (event.key === 'Enter' && !event.shiftKey && !composing) {
      event.preventDefault()
      void chat.send(chat.draft)
    }
  }

  const showComposer = readyCount > 0 && !chat.restoring
  const showSuggestions =
    readyCount > 0 && !chat.hasThread && !chat.restoring
  const showProcessing =
    documentCount > 0 &&
    readyCount === 0 &&
    !chat.hasThread &&
    !chat.restoring
  const showFirstRun =
    documentCount === 0 && !chat.hasThread && !chat.restoring

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {chat.restoring && (
          <p
            role="status"
            className="mx-auto max-w-[var(--measure)] pt-8 font-[family-name:var(--font-sans)] text-sm text-[var(--ink-muted)]"
          >
            {t('loadingConversation')}
          </p>
        )}

        {chat.restoreErrorKey && (
          <div className="mx-auto max-w-[var(--measure)] pt-8">
            <Notice
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={chat.retryRestore}
                  >
                    {t('tryAgain')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={chat.startNewConversation}
                  >
                    {t('newConversation')}
                  </Button>
                </div>
              }
            >
              {t(chat.restoreErrorKey)}
            </Notice>
          </div>
        )}

        {showFirstRun && (
          <div className="mx-auto flex max-w-[var(--measure)] flex-col gap-3 pt-8">
            <h1 className="font-[family-name:var(--font-serif)] text-[32px] leading-[38px] font-medium tracking-[-0.01em] text-[var(--ink)]">
              {t('firstRunTitle')}
            </h1>
            <p className="font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink-muted)]">
              {t('firstRunLead')}
            </p>
            <div className="mt-2">
              <Dropzone
                title={t('dropzoneTitle')}
                limits={t('supportedDocumentFormats', {
                  size: MAX_UPLOAD_SIZE_MB,
                })}
                actionLabel={t('chooseFiles')}
                onFiles={onFiles}
              />
            </div>
          </div>
        )}

        {showProcessing && (
          <div className="mx-auto flex max-w-[var(--measure)] flex-col gap-3 pt-8">
            <h1 className="font-[family-name:var(--font-serif)] text-[32px] leading-[38px] font-medium tracking-[-0.01em] text-[var(--ink)]">
              {t('processingTitle')}
            </h1>
            <p className="font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink-muted)]">
              {t('processingLead')}
            </p>
          </div>
        )}

        {showSuggestions && (
          <div className="mx-auto flex max-w-[var(--measure)] flex-col gap-3 pt-8">
            <h1 className="font-[family-name:var(--font-serif)] text-[32px] leading-[38px] font-medium tracking-[-0.01em] text-[var(--ink)]">
              {t('askYourDocuments')}
            </h1>
            <p className="font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink-muted)]">
              {t('askYourDocumentsHint')}
            </p>
            <p className="mt-2 font-[family-name:var(--font-sans)] text-xs leading-4 font-medium text-[var(--ink-muted)]">
              {t('suggestionsLabel')}
            </p>
            <ul className="flex flex-col border-t border-[var(--line)]">
              {SUGGESTION_KEYS.map((key) => (
                <li key={key} className="border-b border-[var(--line)]">
                  <button
                    type="button"
                    onClick={() => chat.setDraft(t(key))}
                    className="w-full py-3 text-left font-[family-name:var(--font-serif)] text-[17px] leading-[26px] text-[var(--ink)] transition-colors duration-[120ms] hover:text-[var(--accent)]"
                  >
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {chat.hasThread && (
          <div
            aria-live="polite"
            aria-atomic="false"
            className="mx-auto flex w-full max-w-[var(--measure)] flex-col gap-4"
          >
            {chat.messages.map((message) => (
              <MessageBlock key={message.id} message={message} />
            ))}
          </div>
        )}

        {chat.errorKey && (
          <div className="mx-auto mt-4 max-w-[var(--measure)]">
            <Notice
              action={
                <Button variant="secondary" size="sm" onClick={chat.retryLast}>
                  {t('tryAgain')}
                </Button>
              }
            >
              {t(chat.errorKey)}
            </Notice>
          </div>
        )}

        <SourcesColumn sources={chat.latestSources} variant="inline" />
      </div>

      {showComposer && (
        <div className="sticky bottom-0 mx-auto w-full max-w-[calc(var(--measure)+48px)] bg-[var(--paper)] px-6 pb-6 lg:static">
          <div className="mb-2 flex items-center gap-3">
            <p className="min-w-0 flex-1 font-[family-name:var(--font-sans)] text-xs leading-4 text-[var(--ink-muted)]">
              {t('searchingDocuments', { count: readyCount })}
            </p>
            {chat.hasThread && (
              <button
                type="button"
                onClick={chat.startNewConversation}
                disabled={chat.sending}
                className="shrink-0 font-[family-name:var(--font-sans)] text-xs leading-4 font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] disabled:cursor-not-allowed disabled:text-[var(--ink-muted)]"
              >
                {t('newConversation')}
              </button>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void chat.send(chat.draft)
            }}
            className="rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--paper-raised)] focus-within:border-[var(--accent)]"
          >
            <label htmlFor="chat-question" className="sr-only">
              {t('questionLabel')}
            </label>
            <textarea
              id="chat-question"
              rows={2}
              maxLength={MAX_QUESTION_LENGTH}
              value={chat.draft}
              onChange={(event) => chat.setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('askYourDocuments')}
              className="block w-full resize-none bg-transparent px-4 pt-4 pb-2 font-[family-name:var(--font-sans)] text-[15px] leading-[22px] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
            />
            <div className="flex items-center gap-3 px-3 pt-2 pb-3">
              <span className="min-w-0 flex-1 font-[family-name:var(--font-sans)] text-xs leading-4 text-[var(--ink-muted)]">
                {t('composerKeyboardHint')}
              </span>
              {chat.sending ? (
                <Button variant="secondary" icon="stop" onClick={chat.stop}>
                  {t('stop')}
                </Button>
              ) : (
                <Button type="submit" icon="send" disabled={!chat.draft.trim()}>
                  {t('send')}
                </Button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

export default ChatColumn
