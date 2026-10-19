import type { Session } from '@supabase/supabase-js'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import AuthForm from './components/AuthForm'
import ExamBuilder from './components/ExamBuilder'
import MyDrafts from './components/MyDrafts'
import QuestionEditor from './components/QuestionEditor'
import type { ReopenedExamDraft } from './lib/examDraftRepository'
import { getQuestionBanks } from './lib/questionBankRepository'
import { reportSafeError } from './lib/safeErrorDetails'
import { signOutWithRetry, type SignOutScope } from './lib/signOut'
import { supabase } from './lib/supabase'
import './App.css'
import './workspace.css'
import './controls.css'
import './pages.css'
import './builders.css'
import { useSectionListLoads } from './components/savedWorkLoadState'
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
const PhaseNineSavedWork = lazy(() => import('./components/PhaseNineSavedWork'))
const PhaseTenCandidateBuilder = import.meta.env.DEV ? lazy(() => import('./components/PhaseTenCandidateBuilder')) : null
const PhaseTenCandidateSavedWork = import.meta.env.DEV ? lazy(() => import('./components/PhaseTenCandidateSavedWork')) : null
const EditableBlueprints = import.meta.env.DEV ? lazy(() => import('./components/BlueprintSavedWork').then(m => ({ default: m.EditableBlueprints }))) : null
const GeneratedBlueprintPapers = import.meta.env.DEV ? lazy(() => import('./components/BlueprintSavedWork').then(m => ({ default: m.GeneratedBlueprintPapers }))) : null
const ExamBlueprintBuilder = import.meta.env.DEV ? lazy(() => import('./components/ExamBlueprintBuilder').catch((error: unknown) => {
  const message = reportSafeError(error, 'Check that ExamGO is running, then reload the workspace. Your saved papers remain available.')
  return { default: function BlueprintLoadFailure() {
    return <section role="alert"><h2>Structured paper could not load</h2>
      <p>{message}</p>
      <button type="button" onClick={() => window.location.reload()}>Reload workspace</button>
    </section>
  } }
})) : null

/** Retrying removes this alert, so focus moves to the section heading instead of being lost. */
function SectionLoadFailure({ onRetry, headingId }: { onRetry: () => void; headingId: string }) {
  return <div className="section-load-failure" role="alert">
    <p>Some saved work in this section could not be loaded. Nothing was changed.</p>
    <button type="button" className="button-secondary" onClick={() => { document.getElementById(headingId)?.focus(); onRetry() }}>Retry loading</button>
  </div>
}

function App() {
  const { t } = useI18n()
  const [session, setSession] =
    useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] =
    useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<
    'exam' | 'drafts' | 'questions' | 'account'
  >('exam')
  const [reopenedDraft, setReopenedDraft] =
    useState<ReopenedExamDraft | null>(null)
  const [examMode, setExamMode] = useState<'simple' | 'phase-nine' | 'phase-ten-candidate' | 'presets' | 'blueprint'>('simple')
  const [blueprintStarted, setBlueprintStarted] = useState(false)
  const [initialBlueprint, setInitialBlueprint] = useState<SavedExamBlueprint | null>(null)
  const blueprintEditor = useRef<BlueprintEditorHandle>(null)
  const [reopenedStructured, setReopenedStructured] = useState<SavedPhaseNineWorkflow | null>(null)
  const [reopenedCandidate, setReopenedCandidate] = useState<SavedPhaseTenCandidate | null>(null)
  const activeOwner = useRef<string | null>(null)
  const explicitSignOut = useRef(false)
  const [workspaceUser, setWorkspaceUser] = useState<Pick<Session['user'], 'id' | 'email'> | null>(null)
  // Lists rendered in each My papers section; development builds add the structured and candidate lists.
  const editableLoads = useSectionListLoads(2 + (EditableBlueprints ? 1 : 0) + (PhaseTenCandidateSavedWork ? 1 : 0))
  const finalizedLoads = useSectionListLoads(1 + (GeneratedBlueprintPapers ? 1 : 0) + (PhaseTenCandidateSavedWork ? 1 : 0))

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

  const paperStarts = <PaperStarts current={examMode} showDevelopment={{ candidate: Boolean(PhaseTenCandidateBuilder), structured: Boolean(ExamBlueprintBuilder) }}
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
    return <AuthForm sessionNotice={authError} />
  }

  return (
    <>
    {!session && <AuthForm sessionNotice={authError} />}
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
          <button
            type="button"
            className="workspace-nav-secondary"
            aria-current={workspaceView === 'account' ? 'page' : undefined}
            onClick={() => setWorkspaceView('account')}
          >
            {t('account')}
          </button>
        </nav>
        <div className="shell-actions">
          <span className="shell-context">Private preview</span>
          <LanguageSwitch />
        </div>
      </header>
    <main className="workspace">
      {authError && (
        <p role="alert" className="session-notice">
          {authError}
        </p>
      )}
      {workspaceView === 'questions' && (
        <QuestionEditor ownerId={workspaceUser.id} />
      )}
      {workspaceView === 'drafts' && (
        <div className="my-papers">
          <header className="section-heading">
            <div>
              <h2 id="my-papers-title">My papers</h2>
              <p>Drafts stay editable. Finalized papers keep exactly what you downloaded.</p>
            </div>
          </header>
          <section className="paper-group" aria-labelledby="editable-papers-title">
            <h2 id="editable-papers-title" tabIndex={-1}>Drafts</h2>
            {editableLoads.failed && <SectionLoadFailure onRetry={editableLoads.retry} headingId="editable-papers-title" />}
            {editableLoads.empty && <div className="empty-state">
              <p>No drafts yet. Save a reviewed paper to come back to its settings and questions later.</p>
              <button type="button" onClick={() => { setReopenedDraft(null); setReopenedStructured(null); setReopenedCandidate(null); setExamMode('simple'); setWorkspaceView('exam') }}>Create an exam</button>
            </div>}
            {EditableBlueprints && <Suspense fallback={<p role="status">Loading structured paper blueprints…</p>}>
              <EditableBlueprints key={`${workspaceUser.id}:${editableLoads.attempt}`} ownerId={workspaceUser.id} onLoadState={editableLoads.reporter('blueprints')} onOpen={row => {
                if (blueprintEditor.current) blueprintEditor.current.open(row)
                else setInitialBlueprint(row)
                setBlueprintStarted(true); setExamMode('blueprint'); setWorkspaceView('exam')
              }} />
            </Suspense>}
            <MyDrafts
              key={`${workspaceUser.id}:drafts:${editableLoads.attempt}`}
              onLoadState={editableLoads.reporter('simple')}
              onCreateExam={() => {
                setReopenedDraft(null)
                setReopenedStructured(null)
                setReopenedCandidate(null)
                setExamMode('simple')
                setWorkspaceView('exam')
              }}
              onManageQuestions={() => setWorkspaceView('questions')}
              onOpenDraft={(draft) => {
                setReopenedDraft(draft)
                setExamMode('simple')
                setWorkspaceView('exam')
              }}
            />
            <Suspense fallback={<p role="status">Loading Iraqi exercises drafts…</p>}>
              <PhaseNineSavedWork key={`${workspaceUser.id}:editable:${editableLoads.attempt}`} finalized={false} onLoadState={editableLoads.reporter('iraqi')} onOpen={(saved) => { setReopenedStructured(saved); setExamMode('phase-nine'); setWorkspaceView('exam') }} />
            </Suspense>
            {PhaseTenCandidateSavedWork && <Suspense fallback={<p role="status">Loading candidate drafts…</p>}>
              <PhaseTenCandidateSavedWork key={`${workspaceUser.id}:editable:${editableLoads.attempt}`} finalized={false} onLoadState={editableLoads.reporter('candidate')} onOpen={(saved) => { setReopenedCandidate(saved); setExamMode('phase-ten-candidate'); setWorkspaceView('exam') }} />
            </Suspense>}
          </section>
          <section className="paper-group" aria-labelledby="finalized-papers-title">
            <h2 id="finalized-papers-title" tabIndex={-1}>Finalized papers</h2>
            <p className="field-help">Simple question papers download straight away and are not kept here.</p>
            {finalizedLoads.failed && <SectionLoadFailure onRetry={finalizedLoads.retry} headingId="finalized-papers-title" />}
            {finalizedLoads.empty && <p className="empty-state">No finalized papers yet.</p>}
            {GeneratedBlueprintPapers && <Suspense fallback={<p role="status">Loading structured papers…</p>}>
              <GeneratedBlueprintPapers key={`papers-${workspaceUser.id}:${finalizedLoads.attempt}`} ownerId={workspaceUser.id} onLoadState={finalizedLoads.reporter('blueprints')} />
            </Suspense>}
            <Suspense fallback={<p role="status">Loading finalized Iraqi exercises papers…</p>}>
              <PhaseNineSavedWork key={`${workspaceUser.id}:finalized:${finalizedLoads.attempt}`} finalized onLoadState={finalizedLoads.reporter('iraqi')} onOpen={(saved) => { setReopenedStructured(saved); setExamMode('phase-nine'); setWorkspaceView('exam') }} />
            </Suspense>
            {PhaseTenCandidateSavedWork && <Suspense fallback={<p role="status">Loading finalized complete papers…</p>}>
              <PhaseTenCandidateSavedWork key={`${workspaceUser.id}:finalized:${finalizedLoads.attempt}`} finalized onLoadState={finalizedLoads.reporter('candidate')} onOpen={(saved) => { setReopenedCandidate(saved); setExamMode('phase-ten-candidate'); setWorkspaceView('exam') }} />
            </Suspense>}
          </section>
        </div>
      )}
      {workspaceView === 'exam' && (
        <div className="create-exam">{examMode !== 'simple' && paperStarts}
        {examMode === 'blueprint' && ExamBlueprintBuilder ? null : examMode === 'presets' ? <Suspense fallback={<p role="status">Loading approved presets…</p>}>
          <SimplePresetExams key={workspaceUser.id} ownerId={workspaceUser.id}/>
        </Suspense> : examMode === 'phase-nine' ? <Suspense fallback={<p role="status">Loading source-specific builder…</p>}>
          <PhaseNineBuilder key={`${workspaceUser.id}:${reopenedStructured?.id ?? 'new'}`} ownerId={workspaceUser.id} reopened={reopenedStructured}
            onSavedWork={() => setWorkspaceView('drafts')} onAuthorQuestions={() => setWorkspaceView('questions')} />
        </Suspense> : examMode === 'phase-ten-candidate' && PhaseTenCandidateBuilder ? <Suspense fallback={<p role="status">Loading complete-paper candidate…</p>}>
          <PhaseTenCandidateBuilder key={`${workspaceUser.id}:${reopenedCandidate?.id ?? 'new'}`} ownerId={workspaceUser.id} reopened={reopenedCandidate}
            onSavedWork={() => setWorkspaceView('drafts')} onAuthorQuestions={() => setWorkspaceView('questions')} />
        </Suspense> : <ExamBuilder
          startOptions={paperStarts}
          reopenedDraft={reopenedDraft}
          onViewDrafts={() => setWorkspaceView('drafts')}
        />}</div>
      )}
      {ExamBlueprintBuilder && blueprintStarted && <div hidden={workspaceView !== 'exam' || examMode !== 'blueprint'}>
        <Suspense fallback={<p role="status">Loading structured paper…</p>}>
          <ExamBlueprintBuilder key={workspaceUser.id} ownerId={workspaceUser.id} initialBlueprint={initialBlueprint} editorRef={blueprintEditor} />
        </Suspense>
      </div>}
      {workspaceView === 'account' && (
        <section className="card account-view" aria-labelledby="account-title">
          <h2 id="account-title">Account</h2>
          <p>Signed in as {workspaceUser.email}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void handleSignOut('local')}
          >
            Sign out
          </button>{' '}
          <button
            type="button"
            className="button-secondary"
            aria-describedby="sign-out-all-hint"
            onClick={() => void handleSignOut('global')}
          >
            Sign out of all devices
          </button>
          <p id="sign-out-all-hint" className="field-hint">
            Ends ExamGO on every phone, tablet and computer where this account is signed in.
          </p>
        </section>
      )}
      {workspaceView === 'account' && (
        <details className="reviewer-tools">
          <summary>MineGO reviewer tools</summary>
          <Suspense fallback={<p role="status">Loading reviewer tools…</p>}>
            <PresetReviewTools key={workspaceUser.id} />
          </Suspense>
        </details>
      )}
    </main>
    </div>
    </>
  )
}

export default App
