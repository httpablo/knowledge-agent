import { useEffect, useRef } from 'react'

import Button from './Button'
import Icon from './Icon'

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
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
      onClose={onCancel}
      onCancel={(event) => {
        if (busy) {
          event.preventDefault()
        }
      }}
      onClick={(event) => {
        if (!busy && event.target === dialogRef.current) {
          onCancel()
        }
      }}
      className="m-auto w-[420px] max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-raised)] p-6 text-[var(--ink)] shadow-[var(--shadow-pop)] backdrop:bg-[rgba(20,23,21,0.5)]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--danger-soft)] text-[var(--danger)]">
            <Icon name="alert" size={18} />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="font-[family-name:var(--font-serif)] text-xl leading-[26px] font-medium text-[var(--ink)]">
              {title}
            </h2>
            <p className="mt-1 font-[family-name:var(--font-sans)] text-sm leading-5 wrap-anywhere text-[var(--ink-muted)]">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            busy={busy}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}

export default ConfirmDialog
