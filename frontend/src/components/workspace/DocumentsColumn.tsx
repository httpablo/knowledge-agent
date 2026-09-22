import { useTranslation } from 'react-i18next'

import type { DocumentResponse, DocumentStatus } from '../../api/documents'
import Button from '../acervo/Button'
import Icon from '../acervo/Icon'
import StatusBadge from '../acervo/StatusBadge'
import type { BadgeStatus } from '../acervo/StatusBadge'
import { MAX_UPLOAD_SIZE_MB, STATUS_LABEL_KEYS } from './useDocuments'
import type { UseDocumentsResult } from './useDocuments'

const BADGE_STATUS: Record<DocumentStatus, BadgeStatus> = {
  PENDING: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
}

function DocumentRow({
  document,
  formatDate,
  deleting,
  deleteFailed,
  onDelete,
}: {
  document: DocumentResponse
  formatDate: (value: string) => string
  deleting: boolean
  deleteFailed: boolean
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const canDelete = document.status === 'READY' || document.status === 'FAILED'

  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-start gap-3 border-t border-[var(--line)] px-5 py-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--paper-sunken)] text-[var(--ink-muted)]">
        <Icon name="file" size={16} />
      </span>
      <div className="min-w-0">
        <p className="font-[family-name:var(--font-sans)] text-sm leading-5 font-semibold wrap-anywhere text-[var(--ink)]">
          {document.filename}
        </p>
        <time
          dateTime={document.created_at}
          className="mt-0.5 block font-[family-name:var(--font-mono)] text-xs leading-4 text-[var(--ink-muted)]"
        >
          {formatDate(document.created_at)}
        </time>
        <div className="mt-2">
          <StatusBadge status={BADGE_STATUS[document.status]}>
            {t(STATUS_LABEL_KEYS[document.status])}
          </StatusBadge>
        </div>
        {document.status === 'FAILED' && document.processing_error && (
          <p className="mt-2 max-w-[42ch] font-[family-name:var(--font-sans)] text-xs leading-4 wrap-anywhere text-[var(--danger)]">
            {document.processing_error}
          </p>
        )}
        {deleteFailed && (
          <p className="mt-2 max-w-[42ch] font-[family-name:var(--font-sans)] text-xs leading-4 wrap-anywhere text-[var(--danger)]">
            {t('deleteDocumentError')}
          </p>
        )}
      </div>
      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon="trash"
          busy={deleting}
          disabled={deleting}
          tooltip={t('deleteDocument')}
          aria-label={t('deleteDocumentAction', { name: document.filename })}
          onClick={() => {
            if (
              window.confirm(
                t('deleteDocumentConfirm', { name: document.filename }),
              )
            ) {
              onDelete()
            }
          }}
        />
      )}
    </li>
  )
}

function DocumentsColumn({
  documents,
  formatDate,
  state,
  retry,
  retryRefresh,
  onAdd,
  deleting,
  deleteErrors,
  onDelete,
}: {
  documents: DocumentResponse[]
  formatDate: (value: string) => string
  state: UseDocumentsResult['state']
  retry: () => void
  retryRefresh: () => void
  onAdd: () => void
  deleting: Record<string, boolean>
  deleteErrors: Record<string, boolean>
  onDelete: (documentId: string) => void
}) {
  const { t } = useTranslation()

  function renderBody() {
    if (state.status === 'loading') {
      return (
        <p role="status" className="px-5 py-8 text-center font-[family-name:var(--font-sans)] text-sm text-[var(--ink-muted)]">
          {t('loadingDocuments')}
        </p>
      )
    }

    if (state.status === 'error') {
      return (
        <div className="flex flex-col items-start gap-3 px-5 py-4">
          <p role="alert" className="font-[family-name:var(--font-sans)] text-sm text-[var(--danger)]">
            {t('documentsLoadError')}
          </p>
          <Button variant="secondary" size="sm" onClick={retry}>
            {t('tryAgain')}
          </Button>
        </div>
      )
    }

    if (documents.length === 0) {
      return (
        <p className="px-5 py-8 font-[family-name:var(--font-sans)] text-sm text-[var(--ink-muted)]">
          {t('noDocuments')}
        </p>
      )
    }

    return (
      <>
        {state.refresh !== 'ok' && (
          <div className="flex flex-col items-start gap-3 border-t border-[var(--line)] px-5 py-3">
            <p role="alert" className="font-[family-name:var(--font-sans)] text-sm text-[var(--danger)]">
              {t('documentsRefreshError')}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={retryRefresh}
              disabled={state.refresh === 'retrying'}
            >
              {t('tryAgain')}
            </Button>
          </div>
        )}
        <ul aria-label={t('documents')}>
          {documents.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              formatDate={formatDate}
              deleting={deleting[document.id] === true}
              deleteFailed={deleteErrors[document.id] === true}
              onDelete={() => onDelete(document.id)}
            />
          ))}
        </ul>
      </>
    )
  }

  return (
    <aside
      aria-label={t('documents')}
      className="flex min-h-0 w-full flex-1 flex-col border-[var(--line)] lg:w-80 lg:shrink-0 lg:border-r"
    >
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <h2 className="flex-1 font-[family-name:var(--font-serif)] text-xl leading-[26px] font-medium text-[var(--ink)]">
          {t('documents')}
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-xs leading-4 text-[var(--ink-muted)]">
          {documents.length}
        </span>
        <Button variant="secondary" size="sm" icon="plus" onClick={onAdd}>
          {t('addDocuments')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {renderBody()}
      </div>
      <p className="border-t border-[var(--line)] px-5 py-3 font-[family-name:var(--font-sans)] text-xs leading-4 text-[var(--ink-muted)]">
        {t('dropAnywhereHint')}{' '}
        {t('supportedDocumentFormats', { size: MAX_UPLOAD_SIZE_MB })}
      </p>
    </aside>
  )
}

export default DocumentsColumn
