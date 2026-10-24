import type { Session } from '@supabase/supabase-js'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import AuthForm from './components/AuthForm'
import ExamBuilder from './components/ExamBuilder'
import MyPapers from './components/MyPapers'
import SettingsPage from './components/SettingsPage'
import QuestionEditor from './components/QuestionEditor'
import type { ReopenedExamDraft } from './lib/examDraftRepository'
import { getQuestionBanks } from './lib/questionBankRepository'
import { localizeAppMessage } from './lib/appMessages'
import { reportSafeError } from './lib/safeErrorDetails'
import { signOutWithRetry, type SignOutScope } from './lib/signOut'
import { supabase } from './lib/supabase'
import './App.css'
import './workspace.css'
import './controls.css'
import './pages.css'
import './builders.css'
import './questionBanks.css'
import { LanguageSwitch } from './components/LanguageProvider'
import PaperStarts from './components/PaperStarts'
import { useI18n } from './lib/i18n'
import mineGoSymbol from './assets/brand/MineGO_H2_Symbol_Color.svg'
import type { SavedPhaseNineWorkflow } from './lib/phaseNineRepository'
import type { SavedPhaseTenCandidate } from './lib/phaseTenCandidateRepository'
import type { SavedExamBlueprint } from './lib/examBlueprintRepository'
import type { BlueprintEditorHandle } from './components/ExamBlueprintBuilder'

const PhaseNineBuilder = lazy(() => import('./components/PhaseNineBuilder'))
const SimplePresetExams = lazy(() => import('./components/SimplePresetExams'))
const PresetReviewTools = lazy(() => import('./components/PresetReviewTools'))
const PhaseTenCandidateBuilder = import.meta.env.DEV ? lazy(() => import('./components/PhaseTenCandidateBuilder')) : null
const ExamBlueprintBuilder = import.meta.env.DEV ? lazy(() => import('./components/ExamBlueprintBuilder').catch((error: unknown) => {
  const message = reportSafeError(error, 'Check that ExamGO is running, then reload the workspace. Your saved papers remain available.')
  return { default: function BlueprintLoadFailure() {
    return <section role="alert"><h2>Structured paper could not load</h2>
      <p>{message}</p>
      <button type="button" onClick={() => window.location.reload()}>Reload workspace</button>
    </section>
  } }
})) : null

function App() {
  const { t, language } = useI18n()
  const [session, setSession] =
    useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] =
    useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<
    'exam' | 'drafts' | 'questions' | 'account' | 'review'
  >('exam')
  const [reopenedDraft, setReopenedDraft] =
    useState<ReopenedExamDraft | null>(null)
  const [examMode, setExamMode] = useState<'simple' | 'shared' | 'phase-nine' | 'phase-ten-candidate' | 'presets' | 'blueprint'>('simple')
  /** Whether the teacher has any bank; null until known. "Pick questions by type" needs one. */
  const [hasBanks, setHasBanks] = useState<boolean | null>(null)
  const [blueprintStarted, setBlueprintStarted] = useState(false)
  const [initialBlueprint, setInitialBlueprint] = useState<SavedExamBlueprint | null>(null)
  const blueprintEditor = useRef<BlueprintEditorHandle>(null)
  const [reopenedStructured, setReopenedStructured] = useState<SavedPhaseNineWorkflow | null>(null)
  const [reopenedCandidate, setReopenedCandidate] = useState<SavedPhaseTenCandidate | null>(null)
  const activeOwner = useRef<string | null>(null)
  const explicitSignOut = useRef(false)
  const [workspaceUser, setWorkspaceUser] = useState<Pick<Session['user'], 'id' | 'email'> | null>(null)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setAuthReady(true)
        const nextOwner = nextSession?.user.id ?? null
        // Preserve mounted editors only across involuntary expiry in this tab.
        // Explicit sign-out and account changes discard all previous teacher intent.
        if (nextOwner !== null || explicitSignOut.current) {
          if (activeOwner.current !== nextOwner) { setReopenedDraft(null); setReopenedStructured(null); setReopenedCandidate(null); setInitialBlueprint(null); setBlueprintStarted(false); setExamMode('simple'); setWorkspaceView('exam') }
          activeOwner.current = nextOwner
          setWorkspaceUser(nextSession ? { id: nextSession.user.id, email: nextSession.user.email } : null)
          if (nextSession) setAuthError(null)
        } else if (activeOwner.current !== null) {
          setAuthError('Your session ended. Sign in with the same account to resume unsaved work in this tab. Reloading or closing this tab will discard it.')
        }
      },
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    if (!session) {
      return () => {
        active = false
      }
    }

    const chooseInitialWorkspace = async (): Promise<void> => {
      try {
        const banks = await getQuestionBanks()

        if (active) setHasBanks(banks.length > 0)
        if (active && banks.length === 0) {
          setWorkspaceView('questions')
        }
      } catch {
        // The destination view owns its actionable loading error.
      }
    }

    void chooseInitialWorkspace()

    return () => {
      active = false
    }
  }, [session])

  const handleSignOut = async (scope: SignOutScope): Promise<void> => {
    if (explicitSignOut.current) return
    setAuthError(null)
    explicitSignOut.current = true

    try {
      const { serverConfirmed, error } = await signOutWithRetry(supabase, scope)
      if (!serverConfirmed) {
        setAuthError(reportSafeError(error, activeOwner.current === null
          ? 'You are signed out on this device, but the server could not be reached to end the session. If this device may have been shared or compromised, sign in when connected and choose "Sign out of all devices".'
          : 'Server sign-out could not be confirmed. Check your connection and try again.'))
      }
    } catch (error) {
      setAuthError(reportSafeError(error, 'Sign-out could not be completed. Check your connection and try again.'))
    } finally {
      explicitSignOut.current = false
    }
  }

  const paperStarts = <PaperStarts current={examMode === 'shared' ? 'simple' : examMode} unavailable={hasBanks === false ? { simple: t('noBankReason') } : {}} showDevelopment={{ candidate: Boolean(PhaseTenCandidateBuilder), structured: Boolean(ExamBlueprintBuilder) }}
    onChoose={(start) => { if (start === 'blueprint') setBlueprintStarted(true); setExamMode(start) }} />

  if (!authReady) {
    return (
      <main className="session-check">
        <h1>ExamGO</h1>
        <p role="status">{t('checkingSession')}</p>
      </main>
    )
  }

  if (!workspaceUser) {
    return <AuthForm sessionNotice={authError && localizeAppMessage(language, authError)} />
  }

  return (
    <>
    {!session && <AuthForm sessionNotice={authError && localizeAppMessage(language, authError)} />}
    <div className="app-shell" key={workspaceUser.id} hidden={!session} inert={!session}>
      <header className="shell-bar">
        <div className="shell-brand">
          <span className="shell-symbol"><img src={mineGoSymbol} alt="" width="31" height="24" /></span>
          <div>
            <h1 className="shell-wordmark">ExamGO</h1>
            <p className="shell-family">{t('family')}</p>
          </div>
        </div>
        <nav className="workspace-nav" aria-label={t('workspaceNav')}>
          <button
            type="button"
            aria-current={workspaceView === 'exam' ? 'page' : undefined}
            onClick={() => {
              setReopenedDraft(null)
              setReopenedStructured(null)
              setReopenedCandidate(null)
              setWorkspaceView('exam')
            }}
          >
            {t('createExam')}
          </button>
          <button
            type="button"
            aria-current={workspaceView === 'drafts' ? 'page' : undefined}
            onClick={() => setWorkspaceView('drafts')}
          >
            {t('myPapers')}
          </button>
          <button
            type="button"
            aria-current={workspaceView === 'questions' ? 'page' : undefined}
            onClick={() => setWorkspaceView('questions')}
          >
            {t('questionBanks')}
          </button>
        </nav>
        <div className="shell-actions">
          <span className="shell-context">{t('privatePreview')}</span>
          <button
            type="button"
            className="shell-account"
            aria-current={workspaceView === 'account' || workspaceView === 'review' ? 'page' : undefined}
            onClick={() => setWorkspaceView('account')}
          >
            {t('account')}
          </button>
          <LanguageSwitch />
        </div>
      </header>
    <main className="workspace">
      {authError && (
        <p role="alert" className="session-notice">
          {localizeAppMessage(language, authError)}
        </p>
      )}
      {workspaceView === 'questions' && (
        <QuestionEditor ownerId={workspaceUser.id} onUsePresets={() => { setExamMode('presets'); setWorkspaceView('exam') }} />
      )}
      {workspaceView === 'drafts' && (
        <MyPapers
          key={workspaceUser.id}
          ownerId={workspaceUser.id}
          development={import.meta.env.DEV}
          onCreateExam={() => { setReopenedDraft(null); setReopenedStructured(null); setReopenedCandidate(null); setExamMode('simple'); setWorkspaceView('exam') }}
          onManageQuestions={() => setWorkspaceView('questions')}
          onOpenSimple={(draft) => { setReopenedDraft(draft); setExamMode('simple'); setWorkspaceView('exam') }}
          onOpenIraqi={(saved) => { setReopenedStructured(saved); setExamMode('phase-nine'); setWorkspaceView('exam') }}
          onOpenCandidate={(saved) => { setReopenedCandidate(saved); setExamMode('phase-ten-candidate'); setWorkspaceView('exam') }}
          onOpenBlueprint={(row) => {
            if (blueprintEditor.current) blueprintEditor.current.open(row)
            else setInitialBlueprint(row)
            setBlueprintStarted(true); setExamMode('blueprint'); setWorkspaceView('exam')
          }}
        />
      )}
      {workspaceView === 'exam' && (
        <div className="create-exam">{examMode !== 'simple' && paperStarts}
        {examMode === 'blueprint' && ExamBlueprintBuilder ? null : examMode === 'presets' ? <Suspense fallback={<p role="status">{t('loadingPresets')}</p>}>
          <SimplePresetExams key={workspaceUser.id} ownerId={workspaceUser.id} section="exercise"/>
        </Suspense> : examMode === 'shared' ? <Suspense fallback={<p role="status">{t('loadingShared')}</p>}>
          <SimplePresetExams key={`${workspaceUser.id}:shared`} ownerId={workspaceUser.id} section="standalone"/>
        </Suspense> : examMode === 'phase-nine' ? <Suspense fallback={<p role="status">{t('loadingIraqi')}</p>}>
          <PhaseNineBuilder key={`${workspaceUser.id}:${reopenedStructured?.id ?? 'new'}`} ownerId={workspaceUser.id} reopened={reopenedStructured}
            onSavedWork={() => setWorkspaceView('drafts')} onAuthorQuestions={() => setWorkspaceView('questions')} />
        </Suspense> : examMode === 'phase-ten-candidate' && PhaseTenCandidateBuilder ? <Suspense fallback={<p role="status">{t('loadingCandidate')}</p>}>
          <PhaseTenCandidateBuilder key={`${workspaceUser.id}:${reopenedCandidate?.id ?? 'new'}`} ownerId={workspaceUser.id} reopened={reopenedCandidate}
            onSavedWork={() => setWorkspaceView('drafts')} onAuthorQuestions={() => setWorkspaceView('questions')} />
        </Suspense> : <ExamBuilder
          startOptions={paperStarts}
          onUseSharedQuestions={() => setExamMode('shared')}
          reopenedDraft={reopenedDraft}
          onViewDrafts={() => setWorkspaceView('drafts')}
          ownerId={workspaceUser.id}
        />}</div>
      )}
      {ExamBlueprintBuilder && blueprintStarted && <div hidden={workspaceView !== 'exam' || examMode !== 'blueprint'}>
        <Suspense fallback={<p role="status">{t('loadingStructured')}</p>}>
          <ExamBlueprintBuilder key={workspaceUser.id} ownerId={workspaceUser.id} initialBlueprint={initialBlueprint} editorRef={blueprintEditor} />
        </Suspense>
      </div>}
      {workspaceView === 'account' && (
        <SettingsPage ownerId={workspaceUser.id} email={workspaceUser.email} onSignOut={(scope) => void handleSignOut(scope)} onOpenReviewer={() => setWorkspaceView('review')} />
      )}
      {workspaceView === 'review' && (
        <div className="reviewer-page">
          <button type="button" className="button-quiet" onClick={() => setWorkspaceView('account')}>{t('backToSettings')}</button>
          <Suspense fallback={<p role="status">{t('loadingReviewer')}</p>}>
            <PresetReviewTools key={workspaceUser.id} />
          </Suspense>
        </div>
      )}
    </main>
    </div>
    </>
  )
}

export default App
