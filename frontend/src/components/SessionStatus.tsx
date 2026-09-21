import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/useAuth'
import CenteredPanel from './CenteredPanel'
import ErrorMessage from './ErrorMessage'

function SessionStatus({ status }: { status: 'checking' | 'error' }) {
  const { t } = useTranslation()
  const { retrySession } = useAuth()

  return (
    <CenteredPanel>
      {status === 'checking' ? (
        <p className="text-sm text-muted-foreground">{t('checkingSession')}</p>
      ) : (
        <>
          <ErrorMessage>{t('sessionUnavailable')}</ErrorMessage>
          <button
            type="button"
            onClick={retrySession}
            className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-background"
          >
            {t('tryAgain')}
          </button>
        </>
      )}
    </CenteredPanel>
  )
}

export default SessionStatus
