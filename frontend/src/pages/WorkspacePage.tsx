import { useTranslation } from 'react-i18next'

import ChatPanel from '../components/chat/ChatPanel'
import DocumentsPanel from '../components/documents/DocumentsPanel'
import LanguageSelector from '../components/LanguageSelector'
import { useAuth } from '../context/useAuth'

const PANEL_TITLE_CLASS =
  'shrink-0 border-b border-border px-4 py-3 text-sm font-semibold tracking-tight sm:px-6'

function WorkspacePage() {
  const { t } = useTranslation()
  const auth = useAuth()

  if (auth.status !== 'authenticated') {
    return null
  }

  const context = `${auth.organization.name} · ${t('signedInAs', { name: auth.user.name })}`

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-sm font-semibold tracking-tight text-primary">
            Knowledge Agent
          </h1>
          <p className="text-sm wrap-anywhere sm:truncate" title={context}>
            <span className="font-medium">{auth.organization.name}</span>
            <span className="text-muted-foreground">
              {' · '}
              {t('signedInAs', { name: auth.user.name })}
            </span>
          </p>
        </div>
        <LanguageSelector />
        <button
          type="button"
          onClick={auth.logout}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-background"
        >
          {t('logout')}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 flex-col border-b border-border bg-background lg:w-[35%] lg:max-w-[30rem] lg:min-w-[22rem] lg:shrink-0 lg:border-r lg:border-b-0">
          <h2 className={PANEL_TITLE_CLASS}>{t('documents')}</h2>
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-5">
            <DocumentsPanel token={auth.token} />
          </div>
        </section>

        <section className="flex h-[70dvh] min-h-[26rem] min-w-0 flex-col bg-surface lg:h-auto lg:min-h-0 lg:flex-1">
          <h2 className={PANEL_TITLE_CLASS}>{t('chat')}</h2>
          <ChatPanel token={auth.token} />
        </section>
      </main>
    </div>
  )
}

export default WorkspacePage
