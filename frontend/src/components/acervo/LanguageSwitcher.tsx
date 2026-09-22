import { LANGUAGES } from '../../i18n'
import type { Language } from '../../i18n'

function LanguageSwitcher({
  language,
  onChange,
  label,
}: {
  language: Language
  onChange: (language: Language) => void
  label: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--line-strong)] bg-[var(--paper-raised)]"
    >
      {LANGUAGES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          lang={candidate}
          aria-pressed={language === candidate}
          onClick={() => onChange(candidate)}
          className="border-r border-[var(--line)] px-2.5 py-[5px] font-[family-name:var(--font-mono)] text-xs leading-4 font-medium text-[var(--ink-muted)] transition-colors duration-[120ms] last:border-r-0 hover:bg-[var(--paper-sunken)] focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--focus)] aria-pressed:bg-[var(--ink)] aria-pressed:text-[var(--paper)]"
        >
          {candidate.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export default LanguageSwitcher
