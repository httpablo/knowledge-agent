import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { login } from '../api/auth'
import { ApiError } from '../api/client'
import type { Language } from '../i18n'
import type { Translation } from '../i18n/en'
import AuthShell from '../components/acervo/AuthShell'
import Button from '../components/acervo/Button'
import Field from '../components/acervo/Field'
import Notice from '../components/acervo/Notice'
import { useAuth } from '../context/useAuth'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldErrors = Partial<Record<'email' | 'password', keyof Translation>>

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {}

  if (!email) {
    errors.email = 'fieldRequired'
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'invalidEmailFormat'
  }

  if (!password) {
    errors.password = 'fieldRequired'
  }

  return errors
}

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
  const { t, i18n } = useTranslation()
  const { establishSession } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [topErrorKey, setTopErrorKey] = useState<keyof Translation | null>(
    null,
  )
  const inFlight = useRef(false)

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value)
    setFieldErrors((current) => ({ ...current, email: undefined }))
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value)
    setFieldErrors((current) => ({ ...current, password: undefined }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (inFlight.current) {
      return
    }

    const validationErrors = validate(email, password)
    setFieldErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setTopErrorKey(null)

    try {
      const token = await login({ email, password })
      await establishSession(token.access_token)
      navigate('/')
    } catch (error) {
      setTopErrorKey(messageKeyFor(error))
      setSubmitting(false)
      inFlight.current = false
    }
  }

  return (
    <AuthShell
      language={i18n.language as Language}
      onLanguageChange={(language) => void i18n.changeLanguage(language)}
      footer={
        <p>
          {t('noAccountYet')}{' '}
          <Link
            to="/register"
            className="font-medium text-[var(--accent)] underline decoration-1 underline-offset-[3px] hover:text-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            {t('createAccount')}
          </Link>
        </p>
      }
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full max-w-[400px] flex-col gap-4"
      >
        <h1 className="font-[family-name:var(--font-serif)] text-[32px] leading-[38px] font-medium tracking-[-0.01em] min-[900px]:text-[40px] min-[900px]:leading-[44px]">
          {t('signIn')}
        </h1>
        <p className="-mt-2 mb-1 max-w-[56ch] font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink-muted)]">
          {t('loginLead')}
        </p>

        {topErrorKey && <Notice>{t(topErrorKey)}</Notice>}

        <Field
          label={t('email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={handleEmailChange}
          error={fieldErrors.email ? t(fieldErrors.email) : undefined}
        />

        <Field
          label={t('password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={handlePasswordChange}
          error={fieldErrors.password ? t(fieldErrors.password) : undefined}
          showLabel={t('showPassword')}
          hideLabel={t('hidePassword')}
        />

        <Button type="submit" block busy={submitting} disabled={submitting}>
          {submitting ? t('signingIn') : t('signIn')}
        </Button>
      </form>
    </AuthShell>
  )
}

export default LoginPage
