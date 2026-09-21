import { useTranslation } from 'react-i18next'

import CenteredPanel from './CenteredPanel'
import ErrorMessage from './ErrorMessage'

function SessionStatus({ status }: { status: 'checking' | 'error' }) {
  const { t } = useTranslation()

  return (
    <CenteredPanel>
      {status === 'checking' ? (
        <p className="text-sm text-muted-foreground">{t('checkingSession')}</p>
      ) : (
        <ErrorMessage>{t('sessionUnavailable')}</ErrorMessage>
      )}
    </CenteredPanel>
  )
}

export default SessionStatus
