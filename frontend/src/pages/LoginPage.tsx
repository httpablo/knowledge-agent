import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

function LoginPage() {
  const { t } = useTranslation()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('signIn')}</h1>
      <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          to="/register"
          className="rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t('createAccount')}
        </Link>
        <Link
          to="/"
          className="rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t('home')}
        </Link>
      </nav>
    </>
  )
}

export default LoginPage
