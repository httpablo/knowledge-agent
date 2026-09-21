import { useTranslation } from 'react-i18next'

import LanguageSelector from '../components/LanguageSelector'
import { useAuth } from '../context/useAuth'

const PANEL_CLASS =
  'flex min-h-0 flex-col rounded-xl border border-border bg-surface p-4 sm:p-6'

function WorkspacePage() {
  const { t } = useTranslation()
  const auth = useAuth()

  if (auth.status !== 'authenticated') {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="mr-auto">
          <h1 className="font-semibold tracking-tight">Knowledge Agent</h1>
          <p className="text-sm text-muted-foreground">
            {auth.organization.name} ·{' '}
            {t('signedInAs', { name: auth.user.name })}
          </p>
        </div>
        <LanguageSelector />
        <button
          type="button"
          onClick={auth.logout}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t('logout')}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        <section className={`${PANEL_CLASS} lg:basis-[35%]`}>
          <h2 className="font-medium">{t('documents')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('documentsNotConnected')}
          </p>
        </section>

        <section className={`${PANEL_CLASS} lg:flex-1`}>
          <h2 className="font-medium">{t('chat')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('chatNotConnected')}
          </p>
        </section>
      </main>
    </div>
  )
}

export default WorkspacePage
