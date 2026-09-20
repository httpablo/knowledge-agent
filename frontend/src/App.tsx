import { useTranslation } from 'react-i18next'

import LanguageSelector from './components/LanguageSelector'

function App() {
  const { t } = useTranslation()

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Knowledge Agent
        </h1>
        <p className="mt-2 text-muted-foreground">{t('tagline')}</p>
        <div className="mt-8 border-t border-border pt-6">
          <LanguageSelector />
        </div>
      </div>
    </main>
  )
}

export default App
