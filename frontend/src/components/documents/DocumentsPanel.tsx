import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listDocuments } from '../../api/documents'
import type { DocumentResponse, DocumentStatus } from '../../api/documents'
import i18nInstance from '../../i18n'
import type { Translation } from '../../i18n/en'
import ErrorMessage from '../ErrorMessage'
import DocumentUploadForm from './DocumentUploadForm'

const DOCUMENT_POLL_INTERVAL_MS = 2000

type RefreshState = 'ok' | 'retrying' | 'failed'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'loaded'
      documents: DocumentResponse[]
      refresh: RefreshState
    }

const STATUS_LABEL_KEYS: Record<DocumentStatus, keyof Translation> = {
  PENDING: 'documentStatusPending',
  PROCESSING: 'documentStatusProcessing',
  READY: 'documentStatusReady',
  FAILED: 'documentStatusFailed',
}

const STATUS_BADGE_CLASSES: Record<DocumentStatus, string> = {
  PENDING: 'border-border text-muted-foreground',
  PROCESSING: 'border-warning text-warning',
  READY: 'border-success text-success',
  FAILED: 'border-destructive text-destructive',
}

function isActive(status: DocumentStatus): boolean {
  return status === 'PENDING' || status === 'PROCESSING'
}

// The API never removes documents, so one missing from a poll response was
// added (by an upload) after that response was produced and must be kept.
function mergeRefreshed(
  current: DocumentResponse[],
  fetched: DocumentResponse[],
): DocumentResponse[] {
  const fetchedIds = new Set(fetched.map((document) => document.id))

  return [
    ...current.filter((document) => !fetchedIds.has(document.id)),
    ...fetched,
  ]
}

function TryAgainButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {t('tryAgain')}
    </button>
  )
}

function DocumentItem({
  document,
  formatDate,
}: {
  document: DocumentResponse
  formatDate: (value: string) => string
}) {
  const { t } = useTranslation()

  return (
    <li className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
          {document.filename}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[document.status]}`}
        >
          {t(STATUS_LABEL_KEYS[document.status])}
        </span>
      </div>
      <time
        dateTime={document.created_at}
        className="mt-1 block text-xs text-muted-foreground"
      >
        {formatDate(document.created_at)}
      </time>
      {document.status === 'FAILED' && document.processing_error && (
        <p className="mt-2 text-sm text-destructive wrap-anywhere">
          {document.processing_error}
        </p>
      )}
    </li>
  )
}

function DocumentsPanel({ token }: { token: string }) {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    listDocuments(token, controller.signal)
      .then((documents) => {
        setState({ status: 'loaded', documents, refresh: 'ok' })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: 'error' })
        }
      })

    return () => {
      controller.abort()
    }
  }, [token, attempt])

  const documents = state.status === 'loaded' ? state.documents : null
  const refresh = state.status === 'loaded' ? state.refresh : 'ok'
  const polling =
    documents !== null &&
    refresh !== 'failed' &&
    documents.some((document) => isActive(document.status))

  // The module-level i18n instance (not the hook's) keeps the language out of
  // the dependencies, so switching language never restarts polling.
  // One timer-then-request cycle per list version: a new list (poll result or
  // upload) re-runs this effect, which aborts any stale request and re-arms.
  useEffect(() => {
    if (!polling || !documents) {
      return
    }

    const controller = new AbortController()
    const delay = refresh === 'retrying' ? 0 : DOCUMENT_POLL_INTERVAL_MS

    const timer = setTimeout(() => {
      listDocuments(token, controller.signal)
        .then((fetched) => {
          if (controller.signal.aborted) {
            return
          }

          const finished = fetched.filter((next) =>
            documents.some(
              (previous) =>
                previous.id === next.id &&
                isActive(previous.status) &&
                !isActive(next.status),
            ),
          )

          if (finished.length > 0) {
            setAnnouncement(
              finished
                .map((document) => {
                  const label = i18nInstance.t(
                    STATUS_LABEL_KEYS[document.status],
                  )
                  return `${document.filename}: ${label}`
                })
                .join('. '),
            )
          }

          setState((current) =>
            current.status === 'loaded'
              ? {
                  status: 'loaded',
                  documents: mergeRefreshed(current.documents, fetched),
                  refresh: 'ok',
                }
              : current,
          )
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setState((current) =>
              current.status === 'loaded'
                ? { ...current, refresh: 'failed' }
                : current,
            )
          }
        })
    }, delay)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [token, polling, documents, refresh])

  const formatDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    return (value: string) => formatter.format(new Date(value))
  }, [i18n.language])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  function retryRefresh() {
    setState((current) =>
      current.status === 'loaded'
        ? { ...current, refresh: 'retrying' }
        : current,
    )
  }

  function renderList() {
    if (state.status === 'loading') {
      return (
        <p role="status" className="text-sm text-muted-foreground">
          {t('loadingDocuments')}
        </p>
      )
    }

    if (state.status === 'error') {
      return (
        <div className="flex flex-col items-start gap-3">
          <ErrorMessage>{t('documentsLoadError')}</ErrorMessage>
          <TryAgainButton onClick={retry} />
        </div>
      )
    }

    if (state.documents.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">{t('noDocuments')}</p>
      )
    }

    return (
      <>
        {state.refresh !== 'ok' && (
          <div className="mb-3 flex flex-col items-start gap-3">
            <ErrorMessage>{t('documentsRefreshError')}</ErrorMessage>
            <TryAgainButton
              onClick={retryRefresh}
              disabled={state.refresh === 'retrying'}
            />
          </div>
        )}
        <ul
          aria-label={t('documents')}
          className="flex flex-col gap-2 lg:max-h-[70vh] lg:overflow-y-auto"
        >
          {state.documents.map((document) => (
            <DocumentItem
              key={document.id}
              document={document}
              formatDate={formatDate}
            />
          ))}
        </ul>
      </>
    )
  }

  function handleUploaded(document: DocumentResponse) {
    if (state.status !== 'loaded') {
      retry()
      return
    }

    setState((current) =>
      current.status === 'loaded'
        ? {
            status: 'loaded',
            refresh: 'ok',
            documents: [
              document,
              ...current.documents.filter(
                (existing) => existing.id !== document.id,
              ),
            ],
          }
        : current,
    )
  }

  return (
    <>
      <DocumentUploadForm token={token} onUploaded={handleUploaded} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="mt-4">{renderList()}</div>
    </>
  )
}

export default DocumentsPanel
