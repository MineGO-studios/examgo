/*
 * Preferences kept in this browser only (D9.3). They hold no personal or paper data, apply before sign-in,
 * and are shared by everyone using the device, so screens label them "on this device".
 */

export type PapersView = 'desk' | 'list'

const VIEW_KEY = 'examgo.papers.view'

/** The saved My papers view, or the screen-size default when nothing is saved or storage is blocked. */
export function readPapersView(): PapersView {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY)
    if (stored === 'desk' || stored === 'list') return stored
  } catch { /* Storage can be blocked; fall back to the screen size. */ }
  return window.matchMedia?.('(min-width: 40rem)').matches === false ? 'list' : 'desk'
}

/** Returns false when the browser will not remember the choice; it still applies to the open page. */
export function storePapersView(view: PapersView): boolean {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
    return true
  } catch {
    return false
  }
}

/** Whether this browser lets ExamGO remember device preferences. */
export function devicePreferencesAvailable(): boolean {
  try {
    const probe = 'examgo.probe'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}
