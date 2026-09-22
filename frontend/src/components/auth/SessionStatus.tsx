import { useTranslation } from 'react-i18next'

import { useAuth } from '../../context/useAuth'
import type { Language } from '../../i18n'
import Button from '../acervo/Button'
import LanguageSwitcher from '../acervo/LanguageSwitcher'
import Notice from '../acervo/Notice'

function SessionStatus({ status }: { status: 'checking' | 'error' }) {
  const { t, i18n } = useTranslation()
  const { retrySession } = useAuth()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-[var(--paper)] px-4 py-6 font-[family-name:var(--font-sans)] text-[var(--ink)]">
      <div className="w-full max-w-sm">
        {status === 'checking' ? (
          <p className="text-center text-sm leading-5 text-[var(--ink-muted)]">
            {t('checkingSession')}
          </p>
        ) : (
          <Notice
            action={
              <Button variant="secondary" size="sm" onClick={retrySession}>
                {t('tryAgain')}
              </Button>
            }
          >
            {t('sessionUnavailable')}
          </Notice>
        )}
      </div>

      <LanguageSwitcher
        language={i18n.language as Language}
        onChange={(language) => void i18n.changeLanguage(language)}
        label={t('languageLabel')}
      />
    </main>
  )
}

export default SessionStatus
