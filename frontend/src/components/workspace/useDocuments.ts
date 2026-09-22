import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { deleteDocument, listDocuments, uploadDocument } from '../../api/documents'
import type { DocumentResponse, DocumentStatus } from '../../api/documents'
import { ApiError } from '../../api/client'
import i18nInstance from '../../i18n'
import type { Translation } from '../../i18n/en'

export const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.docx']
export const MAX_UPLOAD_SIZE_MB = 10
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
const DOCUMENT_POLL_INTERVAL_MS = 2000

export const STATUS_LABEL_KEYS: Record<DocumentStatus, keyof Translation> = {
  PENDING: 'documentStatusPending',
  PROCESSING: 'documentStatusProcessing',
  READY: 'documentStatusReady',
  FAILED: 'documentStatusFailed',
}

export type RejectedFile = { id: string; name: string; reason: string }

type RefreshState = 'ok' | 'retrying' | 'failed'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; documents: DocumentResponse[]; refresh: RefreshState }

function isActive(status: DocumentStatus): boolean {
  return status === 'PENDING' || status === 'PROCESSING'
}

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

function hasAllowedExtension(filename: string): boolean {
  const lowerCased = filename.toLowerCase()

  return ALLOWED_EXTENSIONS.some((extension) => lowerCased.endsWith(extension))
}

function validationErrorFor(file: File): keyof Translation | null {
  if (!hasAllowedExtension(file.name)) {
    return 'unsupportedFileType'
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return 'fileTooLarge'
  }

  return null
}

function uploadErrorFor(error: unknown): keyof Translation {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return 'fileTooLarge'
    }

    if (error.status === 422) {
      return 'documentUploadInvalid'
    }
  }

  return 'documentUploadUnavailable'
}

export function useDocuments(token: string) {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [deleteErrors, setDeleteErrors] = useState<Record<string, boolean>>({})

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

  async function uploadFiles(files: File[]): Promise<RejectedFile[]> {
    const rejected: RejectedFile[] = []

    await Promise.all(
      files.map(async (file) => {
        const validationError = validationErrorFor(file)

        if (validationError) {
          rejected.push({
            id: crypto.randomUUID(),
            name: file.name,
            reason: t(validationError, { size: MAX_UPLOAD_SIZE_MB }),
          })
          return
        }

        try {
          const document = await uploadDocument(token, file)

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
        } catch (error) {
          rejected.push({
            id: crypto.randomUUID(),
            name: file.name,
            reason: t(uploadErrorFor(error), { size: MAX_UPLOAD_SIZE_MB }),
          })
        }
      }),
    )

    return rejected
  }

  async function removeDocument(documentId: string) {
    if (deleting[documentId]) {
      return
    }

    setDeleting((current) => ({ ...current, [documentId]: true }))
    setDeleteErrors((current) => ({ ...current, [documentId]: false }))

    try {
      await deleteDocument(token, documentId)
      setState((current) =>
        current.status === 'loaded'
          ? {
              ...current,
              documents: current.documents.filter(
                (document) => document.id !== documentId,
              ),
            }
          : current,
      )
    } catch {
      setDeleteErrors((current) => ({ ...current, [documentId]: true }))
    } finally {
      setDeleting((current) => {
        const next = { ...current }
        delete next[documentId]
        return next
      })
    }
  }

  const readyCount = documents?.filter((d) => d.status === 'READY').length ?? 0

  return {
    state,
    documents: documents ?? [],
    readyCount,
    announcement,
    formatDate,
    retry,
    retryRefresh,
    uploadFiles,
    removeDocument,
    deleting,
    deleteErrors,
  }
}

export type UseDocumentsResult = ReturnType<typeof useDocuments>
