import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { register } from '../api/auth'
import { ApiError } from '../api/client'
import type { Language } from '../i18n'
import type { Translation } from '../i18n/en'
import AuthShell from '../components/acervo/AuthShell'
import Button from '../components/acervo/Button'
import Field from '../components/acervo/Field'
import Notice from '../components/acervo/Notice'
import { useAuth } from '../context/useAuth'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128
const NAME_MAX_LENGTH = 255

type FieldErrors = Partial<
  Record<
    'name' | 'email' | 'password' | 'confirmPassword',
    keyof Translation
  >
>

function validate(
  name: string,
  email: string,
  password: string,
  confirmPassword: string,
): FieldErrors {
  const errors: FieldErrors = {}

  if (!name) {
    errors.name = 'fieldRequired'
  }

  if (!email) {
    errors.email = 'fieldRequired'
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'invalidEmailFormat'
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = 'passwordTooShort'
  }

  if (confirmPassword !== password) {
    errors.confirmPassword = 'passwordMismatch'
  }

  return errors
}

function registrationErrorKey(error: unknown): keyof Translation {
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
  const { t, i18n } = useTranslation()
  const { establishSession } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [topErrorKey, setTopErrorKey] = useState<keyof Translation | null>(
    null,
  )
  const inFlight = useRef(false)

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    setName(event.target.value)
    clearFieldError('name')
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value)
    clearFieldError('email')
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value)
    clearFieldError('password')
    clearFieldError('confirmPassword')
  }

  function handleConfirmPasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setConfirmPassword(event.target.value)
    clearFieldError('confirmPassword')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (inFlight.current) {
      return
    }

    const validationErrors = validate(name, email, password, confirmPassword)
    setFieldErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setTopErrorKey(null)

    let token

    try {
      token = await register({ name, email, password })
    } catch (error) {
      setTopErrorKey(registrationErrorKey(error))
      setSubmitting(false)
      inFlight.current = false
      return
    }

    try {
      await establishSession(token.access_token)
    } catch {
      setTopErrorKey('accountCreatedSessionFailed')
      setSubmitting(false)
      inFlight.current = false
      return
    }

    navigate('/')
  }

  return (
    <AuthShell
      language={i18n.language as Language}
      onLanguageChange={(language) => void i18n.changeLanguage(language)}
      footer={
        <p>
          {t('alreadyHaveAccount')}{' '}
          <Link
            to="/login"
            className="font-medium text-[var(--accent)] underline decoration-1 underline-offset-[3px] hover:text-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            {t('signIn')}
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
          {t('createAccount')}
        </h1>
        <p className="-mt-2 mb-1 max-w-[56ch] font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink-muted)]">
          {t('signupLead')}
        </p>

        {topErrorKey && <Notice>{t(topErrorKey)}</Notice>}

        <Field
          label={t('name')}
          autoComplete="name"
          maxLength={NAME_MAX_LENGTH}
          value={name}
          onChange={handleNameChange}
          error={fieldErrors.name ? t(fieldErrors.name) : undefined}
        />

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
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={password}
          onChange={handlePasswordChange}
          hint={t('passwordHint')}
          error={fieldErrors.password ? t(fieldErrors.password) : undefined}
          showLabel={t('showPassword')}
          hideLabel={t('hidePassword')}
        />

        <Field
          label={t('confirmPassword')}
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          error={
            fieldErrors.confirmPassword
              ? t(fieldErrors.confirmPassword)
              : undefined
          }
          showLabel={t('showPassword')}
          hideLabel={t('hidePassword')}
        />

        <Button type="submit" block busy={submitting} disabled={submitting}>
          {submitting ? t('creatingAccount') : t('createAccount')}
        </Button>
      </form>
    </AuthShell>
  )
}

export default RegisterPage
