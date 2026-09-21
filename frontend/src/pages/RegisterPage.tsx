import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { register } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../context/useAuth'

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128
const NAME_MAX_LENGTH = 255

function registrationErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return 'emailAlreadyExists'
    }

    if (error.status === 422) {
      return 'invalidRegistrationInput'
    }
  }

  return 'registrationUnavailable'
}

function RegisterPage() {
  const { t } = useTranslation()
  const { establishSession } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const inFlight = useRef(false)

  function fail(key: string) {
    setErrorKey(key)
    setSubmitting(false)
    inFlight.current = false
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (inFlight.current) {
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setErrorKey(null)

    let token

    try {
      token = await register({ name, email, password })
    } catch (error) {
      fail(registrationErrorKey(error))
      return
    }

    try {
      await establishSession(token.access_token)
    } catch {
      fail('accountCreatedSessionFailed')
      return
    }

    navigate('/')
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('createAccount')}
      </h1>

      <form onSubmit={handleSubmit} className="mt-6">
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            {t('name')}
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            maxLength={NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div className="mt-4">
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
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
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
          {submitting ? t('creatingAccount') : t('createAccount')}
        </button>
      </form>

      <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          to="/login"
          className="rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t('signIn')}
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

export default RegisterPage
