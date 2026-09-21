import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { login } from '../api/auth'
import { ApiError } from '../api/client'
import type { Translation } from '../i18n/en'
import ErrorMessage from '../components/ErrorMessage'
import SubmitButton from '../components/SubmitButton'
import TextField from '../components/TextField'
import TextLink from '../components/TextLink'
import { useAuth } from '../context/useAuth'

function messageKeyFor(error: unknown): keyof Translation {
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
  const [errorKey, setErrorKey] = useState<keyof Translation | null>(null)
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

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <TextField
          id="email"
          label={t('email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <TextField
          id="password"
          label={t('password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

        <SubmitButton disabled={submitting}>
          {submitting ? t('signingIn') : t('signIn')}
        </SubmitButton>
      </form>

      <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        <TextLink to="/register">{t('createAccount')}</TextLink>
        <TextLink to="/">{t('home')}</TextLink>
      </nav>
    </>
  )
}

export default LoginPage
