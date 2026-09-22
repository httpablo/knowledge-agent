import { useId, useState } from 'react'
import type { ChangeEvent, FocusEvent } from 'react'

import Icon from './Icon'

type FieldType = 'text' | 'email' | 'password'

type FieldProps = {
  id?: string
  label: string
  hint?: string
  error?: string
  type?: FieldType
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  autoComplete?: string
  required?: boolean
  showLabel?: string
  hideLabel?: string
}

function Field({
  id,
  label,
  hint,
  error,
  type = 'text',
  value,
  onChange,
  onBlur,
  autoComplete,
  required,
  showLabel,
  hideLabel,
}: FieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const describedBy =
    [
      hint && !error ? `${fieldId}-hint` : null,
      error ? `${fieldId}-error` : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="font-[family-name:var(--font-sans)] text-[13px] leading-4 font-medium text-[var(--ink)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            'min-h-10 w-full rounded-[var(--radius-md)] border bg-[var(--paper-raised)] px-3 py-[9px] font-[family-name:var(--font-sans)] text-sm text-[var(--ink)] transition-colors duration-[120ms] placeholder:text-[var(--ink-subtle)] hover:border-[var(--ink-muted)] focus:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
            isPassword ? 'pr-[84px]' : '',
            error ? 'border-[var(--danger)]' : 'border-[var(--line-strong)]',
          ].join(' ')}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-pressed={revealed}
            className="absolute top-1 right-1 bottom-1 rounded-[var(--radius-sm)] px-2 font-[family-name:var(--font-sans)] text-[13px] leading-4 font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            {revealed ? hideLabel : showLabel}
          </button>
        )}
      </div>
      {hint && !error && (
        <p
          id={`${fieldId}-hint`}
          className="font-[family-name:var(--font-sans)] text-xs leading-4 text-[var(--ink-muted)]"
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${fieldId}-error`}
          className="flex items-center gap-1 font-[family-name:var(--font-sans)] text-xs leading-4 text-[var(--danger)]"
        >
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </div>
  )
}

export default Field
