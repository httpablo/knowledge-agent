import { useTranslation } from 'react-i18next'

function SessionStatus({ status }: { status: 'checking' | 'error' }) {
  const { t } = useTranslation()

  if (status === 'checking') {
    return <p className="text-sm text-muted-foreground">{t('checkingSession')}</p>
  }

  return (
    <p
      role="alert"
      className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
    >
      {t('sessionUnavailable')}
    </p>
  )
}

export default SessionStatus
