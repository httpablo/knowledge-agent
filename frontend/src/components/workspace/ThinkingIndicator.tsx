import { useTranslation } from 'react-i18next'

function ThinkingIndicator() {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 self-start font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink-muted)]"
    >
      <span>{t('thinkingIndicator')}</span>
      <span aria-hidden="true" className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      </span>
    </div>
  )
}

export default ThinkingIndicator
