import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import Button from '../acervo/Button'
import Dropzone from '../acervo/Dropzone'
import Icon from '../acervo/Icon'
import { MAX_UPLOAD_SIZE_MB } from './useDocuments'
import type { RejectedFile } from './useDocuments'

function UploadModal({
  open,
  rejected,
  onFiles,
  onClose,
}: {
  open: boolean
  rejected: RejectedFile[]
  onFiles: (files: File[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current

    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose()
        }
      }}
      className="m-auto w-[560px] max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-raised)] p-6 text-[var(--ink)] shadow-[var(--shadow-pop)] backdrop:bg-[rgba(20,23,21,0.5)]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h2 className="font-[family-name:var(--font-serif)] text-2xl leading-[34px] font-medium text-[var(--ink)]">
              {t('addDocumentsModalTitle')}
            </h2>
            <p className="mt-1 font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink-muted)]">
              {t('addDocumentsModalLead')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink)] transition-colors duration-[120ms] hover:bg-[var(--paper-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <Dropzone
          title={t('dropzoneTitle')}
          limits={t('supportedDocumentFormats', { size: MAX_UPLOAD_SIZE_MB })}
          actionLabel={t('chooseFiles')}
          onFiles={onFiles}
        />

        {rejected.length > 0 && (
          <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-4 py-3">
            <span className="flex pt-px text-[var(--danger)]">
              <Icon name="alert" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-[family-name:var(--font-sans)] text-sm leading-5 font-semibold text-[var(--danger)]">
                {t('filesRejectedTitle')}
              </p>
              {rejected.map((file) => (
                <p
                  key={file.id}
                  className="mt-1 font-[family-name:var(--font-sans)] text-sm leading-5 wrap-anywhere text-[var(--ink)]"
                >
                  <span className="font-semibold">{file.name}</span>
                  {': '}
                  {file.reason}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <p className="flex-1 font-[family-name:var(--font-sans)] text-xs leading-4 text-[var(--ink-muted)]">
            {t('modalCloseHint')}
          </p>
          <Button variant="ghost" onClick={onClose}>
            {t('close')}
          </Button>
        </div>
      </div>
    </dialog>
  )
}

export default UploadModal
