import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import AuthForm from './components/AuthForm'
import ExamBuilder from './components/ExamBuilder'
import QuestionEditor from './components/QuestionEditor'
import { getSafeErrorDetails } from './lib/safeErrorDetails'
import { supabase } from './lib/supabase'
import './App.css'

const errorStyle = {
  color: '#e5484d',
  margin: 0,
} as const

function App() {
  const [session, setSession] =
    useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] =
    useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<
    'exam' | 'questions'
  >('exam')

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setAuthReady(true)
      },
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async (): Promise<void> => {
    setAuthError(null)

    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error(
        '[auth] Sign-out failed',
        getSafeErrorDetails(error),
      )
      setAuthError('Unable to sign out. Please try again.')
    }
  }

  if (!authReady) {
    return (
      <main>
        <h1>ExamGO</h1>
        <p role="status">Checking your session…</p>
      </main>
    )
  }

  if (!session) {
    return <AuthForm />
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <span className="eyebrow">MineGO Studio</span>
          <h1>ExamGO</h1>
          <p>Grade 6 Iraqi English monthly-test generator</p>
        </div>
        <div className="account-menu">
          <span>Signed in as {session.user.email}</span>
          <button
            type="button"
            className="button-secondary"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="workspace-nav" aria-label="Teacher workspace">
        <button
          type="button"
          aria-current={workspaceView === 'exam' ? 'page' : undefined}
          onClick={() => setWorkspaceView('exam')}
        >
          Build exam
        </button>
        <button
          type="button"
          aria-current={
            workspaceView === 'questions' ? 'page' : undefined
          }
          onClick={() => setWorkspaceView('questions')}
        >
          Question bank
        </button>
      </nav>

      {authError && (
        <p role="alert" style={errorStyle}>
          {authError}
        </p>
      )}
      {workspaceView === 'questions' ? (
        <QuestionEditor />
      ) : (
        <ExamBuilder />
      )}
    </main>
  )
}

export default App
