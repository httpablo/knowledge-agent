import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

function HomePage() {
  const { t } = useTranslation()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Knowledge Agent</h1>
      <p className="mt-2 text-muted-foreground">{t('tagline')}</p>
      <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          to="/login"
          className="rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t('signIn')}
        </Link>
        <Link
          to="/register"
          className="rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t('createAccount')}
        </Link>
      </nav>
    </>
  )
}

export default HomePage
