import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

import Button from './Button'
import Icon from './Icon'

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function Dropzone({
  title,
  limits,
  actionLabel,
  onFiles,
}: {
  title: string
  limits: string
  actionLabel: string
  onFiles: (files: File[]) => void
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onDragEnter={(event) => {
        if (hasFiles(event)) {
          event.preventDefault()
          event.stopPropagation()
          setDragging(true)
        }
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDragging(false)
        const files = Array.from(event.dataTransfer.files)
        if (files.length > 0) {
          onFiles(files)
        }
      }}
      className={`flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-[1.5px] border-dashed px-6 py-8 text-center transition-colors duration-[120ms] ${
        dragging
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--line-strong)] bg-[var(--paper-sunken)]'
      }`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--ink)]">
        <Icon name="upload" size={18} />
      </span>
      <p className="font-[family-name:var(--font-sans)] text-[15px] leading-[22px] font-semibold text-[var(--ink)]">
        {title}
      </p>
      <Button variant="secondary" onClick={() => inputRef.current?.click()}>
        {actionLabel}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.docx"
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length > 0) {
            onFiles(files)
          }
          event.target.value = ''
        }}
      />
      <p
        className={`m-0 font-[family-name:var(--font-sans)] text-xs leading-4 ${dragging ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}
      >
        {limits}
      </p>
    </div>
  )
}

export default Dropzone
