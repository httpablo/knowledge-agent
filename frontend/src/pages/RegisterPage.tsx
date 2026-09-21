import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { register } from '../api/auth'
import { ApiError } from '../api/client'
import ErrorMessage from '../components/ErrorMessage'
import SubmitButton from '../components/SubmitButton'
import TextField from '../components/TextField'
import TextLink from '../components/TextLink'
import { useAuth } from '../context/useAuth'

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128
const NAME_MAX_LENGTH = 255

function registrationErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return 'emailAlreadyExists'
    }

    if (error.status === 422) {
      return 'invalidInput'
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

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <TextField
          id="name"
          label={t('name')}
          type="text"
          autoComplete="name"
          required
          maxLength={NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

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
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

        <SubmitButton disabled={submitting}>
          {submitting ? t('creatingAccount') : t('createAccount')}
        </SubmitButton>
      </form>

      <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        <TextLink to="/login">{t('signIn')}</TextLink>
        <TextLink to="/">{t('home')}</TextLink>
      </nav>
    </>
  )
}

export default RegisterPage
