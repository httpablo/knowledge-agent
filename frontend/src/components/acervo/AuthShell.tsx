import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Language } from '../../i18n'
import LanguageSwitcher from './LanguageSwitcher'

function AuthShell({
  language,
  onLanguageChange,
  footer,
  children,
}: {
  language: Language
  onLanguageChange: (language: Language) => void
  footer: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-[var(--paper)] font-[family-name:var(--font-sans)] text-[var(--ink)] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex flex-col px-4 py-6 min-[900px]:px-12 min-[900px]:py-6">
        <header className="flex items-center justify-end gap-4">
          <LanguageSwitcher
            language={language}
            onChange={onLanguageChange}
            label={t('languageLabel')}
          />
        </header>

        <div className="flex flex-1 items-center py-8">{children}</div>

        <footer className="font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink-muted)]">
          {footer}
        </footer>
      </section>

      <aside
        aria-hidden="true"
        className="hidden flex-col justify-between gap-8 border-l border-[var(--line)] bg-[var(--paper-sunken)] p-12 min-[900px]:flex"
      >
        <p className="max-w-[14em] font-[family-name:var(--font-serif)] text-[40px] leading-[44px] font-medium tracking-[-0.01em]">
          {t('brandTagline')}
        </p>

        <div className="flex max-w-[460px] flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-raised)] p-4">
          <p className="max-w-full self-start rounded-[var(--radius-md)] bg-[var(--paper-sunken)] px-4 py-3 font-[family-name:var(--font-serif)] text-[17px] leading-[26px] font-medium">
            {t('brandSpecimenQuestion')}
          </p>

          <p className="font-[family-name:var(--font-serif)] text-[17px] leading-7">
            {t('brandSpecimenAnswer')}
            <span className="mx-0.5 inline-block min-w-[22px] rounded-[var(--radius-sm)] bg-[var(--accent)] px-[5px] text-center align-[2px] font-[family-name:var(--font-mono)] text-xs leading-5 font-medium text-[var(--on-accent)]">
              1
            </span>
          </p>

          <div className="flex flex-col gap-2">
            <p className="font-[family-name:var(--font-mono)] text-xs leading-4 text-[var(--ink-muted)]">
              {t('brandSpecimenDocument')} · {t('brandSpecimenPage', { page: 7 })}
            </p>
            <blockquote className="rounded-[var(--radius-sm)] bg-[var(--paper-sunken)] p-3 font-[family-name:var(--font-serif)] text-[15px] leading-6">
              <span className="text-[var(--ink-muted)]">…{t('brandSpecimenContext')}</span>
              <mark className="rounded-[var(--radius-sm)] bg-[var(--mark)] px-0.5 py-px text-[var(--ink)] [box-decoration-break:clone]">
                {t('brandSpecimenHighlight')}
              </mark>
            </blockquote>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default AuthShell
