import {
  type FormEvent,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'

type AuthMode = 'sign-in' | 'sign-up'

type Feedback = {
  type: 'error' | 'success'
  message: string
}

const MINIMUM_PASSWORD_LENGTH = 12

const formStyle = {
  display: 'grid',
  gap: '1rem',
  maxWidth: '28rem',
  margin: '0 auto',
} as const

const fieldStyle = {
  display: 'grid',
  gap: '0.35rem',
  textAlign: 'left',
} as const

const inputStyle = {
  padding: '0.7rem',
  font: 'inherit',
} as const

export default function AuthForm() {
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
      console.error('[auth] Request failed', error)

      setFeedback({
        type: 'error',
        message:
          mode === 'sign-in'
            ? 'Unable to sign in. Check your email and password.'
            : 'Unable to create the account. Check your details and try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <h1>ExamGO</h1>
      <p>Sign in to access your teacher workspace.</p>

      <form
        className="card"
        onSubmit={handleSubmit}
        style={formStyle}
      >
        <div
          role="group"
          aria-label="Authentication mode"
        >
          <button
            type="button"
            disabled={loading || mode === 'sign-in'}
            onClick={() => changeMode('sign-in')}
          >
            Sign in
          </button>{' '}
          <button
            type="button"
            disabled={loading || mode === 'sign-up'}
            onClick={() => changeMode('sign-up')}
          >
            Create account
          </button>
        </div>

        <label style={fieldStyle}>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          Password
          <input
            type="password"
            required
            minLength={MINIMUM_PASSWORD_LENGTH}
            autoComplete={
              mode === 'sign-in'
                ? 'current-password'
                : 'new-password'
            }
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            style={inputStyle}
          />
          <small>
            Minimum {MINIMUM_PASSWORD_LENGTH} characters.
          </small>
        </label>

        <button type="submit" disabled={loading}>
          {loading
            ? 'Please wait…'
            : mode === 'sign-in'
              ? 'Sign in'
              : 'Create account'}
        </button>

        {feedback && (
          <p
            role={
              feedback.type === 'error'
                ? 'alert'
                : 'status'
            }
            aria-live="polite"
          >
            {feedback.message}
          </p>
        )}
      </form>
    </main>
  )
}