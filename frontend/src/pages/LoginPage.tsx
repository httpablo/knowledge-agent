import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { login } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../context/useAuth'

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

function messageKeyFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'invalidCredentials'
    }

    if (error.status === 422) {
      return 'invalidInput'
    }
  }

  return 'signInUnavailable'
}

function LoginPage() {
  const { t } = useTranslation()
  const { establishSession } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (inFlight.current) {
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setErrorKey(null)

    try {
      const token = await login({ email, password })
      await establishSession(token.access_token)
      navigate('/')
    } catch (error) {
      setErrorKey(messageKeyFor(error))
      setSubmitting(false)
      inFlight.current = false
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('signIn')}</h1>

      <form onSubmit={handleSubmit} className="mt-6">
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            {t('email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="password" className="text-sm font-medium">
            {t('password')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        {errorKey && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
          >
            {t(errorKey)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? t('signingIn') : t('signIn')}
        </button>
      </form>

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
