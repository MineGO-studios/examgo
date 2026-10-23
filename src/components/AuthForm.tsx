import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { localizeAppMessage } from '../lib/appMessages'
import { reportSafeError } from '../lib/safeErrorDetails'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { LanguageSwitch } from './LanguageProvider'
import mineGoSymbol from '../assets/brand/MineGO_H2_Symbol_Color.svg'

type AuthMode = 'sign-in' | 'sign-up'

type Feedback = {
  type: 'error' | 'success'
  message: string
}

const MINIMUM_PASSWORD_LENGTH = 12

export default function AuthForm({ sessionNotice }: { sessionNotice?: string | null } = {}) {
  const { t, language } = useI18n()
  const emailInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (sessionNotice) emailInput.current?.focus() }, [sessionNotice])
  const [mode, setMode] =
    useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] =
    useState<Feedback | null>(null)

  const changeMode = (nextMode: AuthMode): void => {
    setMode(nextMode)
    setPassword('')
    setFeedback(null)
  }

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setFeedback(null)

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setFeedback({
        type: 'error',
        message:
          `Password must contain at least ` +
          `${MINIMUM_PASSWORD_LENGTH} characters.`,
      })
      return
    }

    setLoading(true)

    try {
      const normalizedEmail = email.trim()

      if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        })

        if (error) {
          throw error
        }

        setFeedback({
          type: 'success',
          message:
            'Check your email to confirm your ExamGO account.',
        })
        setPassword('')
        return
      }

      const { error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

      if (error) {
        throw error
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: reportSafeError(error,
          mode === 'sign-in'
            ? 'Unable to sign in. Check your email and password.'
            : 'Unable to create the account. Check your details and try again.'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-brand" aria-labelledby="auth-title">
          <span className="shell-symbol auth-symbol"><img src={mineGoSymbol} alt="" width="31" height="24" /></span>
          <h1 id="auth-title">ExamGO</h1>
          <p className="auth-family">{t('family')}</p>
          <p className="auth-tagline">{t('productTagline')}</p>
          <p>{t('authAside')}</p>
          <LanguageSwitch />
        </section>

        <form className="card auth-form" onSubmit={handleSubmit}>
          <p className="auth-intro">{t('signInIntro')}</p>
          {sessionNotice && <p role="alert" className="session-notice">{sessionNotice}</p>}
          <div className="segmented auth-mode" role="group" aria-label={t('authMode')}>
            <button
              type="button"
              aria-pressed={mode === 'sign-in'}
              disabled={loading}
              onClick={() => { if (mode !== 'sign-in') changeMode('sign-in') }}
            >
              {t('signIn')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'sign-up'}
              disabled={loading}
              onClick={() => { if (mode !== 'sign-up') changeMode('sign-up') }}
            >
              {t('createAccount')}
            </button>
          </div>

          <label>
            {t('email')}
            <input
              ref={emailInput}
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            {t('password')}
            <input
              type="password"
              dir="ltr"
              required
              minLength={MINIMUM_PASSWORD_LENGTH}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <small>{t('passwordHint')}</small>
          </label>

          <button type="submit" disabled={loading}>
            {loading ? t('pleaseWait') : mode === 'sign-in' ? t('signIn') : t('createAccount')}
          </button>

          {feedback && (
            <p role={feedback.type === 'error' ? 'alert' : 'status'} aria-live="polite"
              className={feedback.type === 'error' ? 'saved-work-failure' : undefined}>
              {localizeAppMessage(language, feedback.message)}
            </p>
          )}
        </form>
      </div>
    </main>
  )
}
