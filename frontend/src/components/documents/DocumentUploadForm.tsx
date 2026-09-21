import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { uploadDocument } from '../../api/documents'
import type { DocumentResponse } from '../../api/documents'
import { ApiError } from '../../api/client'
import type { Translation } from '../../i18n/en'
import ErrorMessage from '../ErrorMessage'
import SubmitButton from '../SubmitButton'

const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.docx']
const MAX_UPLOAD_SIZE_MB = 10
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

type Feedback =
  | { kind: 'error'; messageKey: keyof Translation }
  | { kind: 'success' }

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

function DocumentUploadForm({
  token,
  onUploaded,
}: {
  token: string
  onUploaded: (document: DocumentResponse) => void
}) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const inFlight = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      controller.current?.abort()
    }
  }, [])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setFeedback(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (inFlight.current || !file) {
      return
    }

    const validationError = validationErrorFor(file)

    if (validationError) {
      setFeedback({ kind: 'error', messageKey: validationError })
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setFeedback(null)

    const request = new AbortController()
    controller.current = request

    try {
      const document = await uploadDocument(token, file, request.signal)

      if (request.signal.aborted) {
        return
      }

      setFile(null)
      if (fileInput.current) {
        fileInput.current.value = ''
      }
      setFeedback({ kind: 'success' })
      onUploaded(document)
    } catch (error) {
      if (request.signal.aborted) {
        return
      }

      setFeedback({ kind: 'error', messageKey: uploadErrorFor(error) })
    } finally {
      if (!request.signal.aborted) {
        setSubmitting(false)
        inFlight.current = false
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 space-y-3 rounded-lg border border-border bg-surface p-3.5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="document-file" className="text-sm font-medium">
          {t('selectDocument')}
        </label>
        <input
          ref={fileInput}
          id="document-file"
          type="file"
          accept={ALLOWED_EXTENSIONS.join(',')}
          aria-describedby="document-file-hint"
          onChange={handleChange}
          className="w-full min-w-0 cursor-pointer text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-subtle file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary-border"
        />
        <p id="document-file-hint" className="text-meta text-muted-foreground">
          {t('supportedDocumentFormats', { size: MAX_UPLOAD_SIZE_MB })}
        </p>
      </div>

      {file && (
        <p className="text-meta wrap-anywhere">
          {t('selectedFile', { name: file.name })}
        </p>
      )}

      {feedback?.kind === 'error' && (
        <ErrorMessage>
          {t(feedback.messageKey, { size: MAX_UPLOAD_SIZE_MB })}
        </ErrorMessage>
      )}
      {feedback?.kind === 'success' && (
        <p
          role="status"
          className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success"
        >
          {t('uploadAccepted')}
        </p>
      )}

      <SubmitButton disabled={!file || submitting}>
        {submitting ? t('uploading') : t('upload')}
      </SubmitButton>
    </form>
  )
}

export default DocumentUploadForm
