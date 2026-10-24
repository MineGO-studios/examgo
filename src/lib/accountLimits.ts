/**
 * Phase 15A per-teacher limits. The database raises SQLSTATE 53400 with a hint
 * `account-limit:<table>:total|rate`; this turns it into a teacher message.
 * Limit values live in the database and can change, so messages avoid numbers.
 */
export const ACCOUNT_LIMIT_CODE = '53400'

const TOTAL_MESSAGES: Readonly<Record<string, string>> = {
  question_banks: 'Your account has reached its limit of question banks. Archive a bank you no longer use, or contact MineGO to raise the limit.',
  questions: 'Your account has reached its limit of questions. Remove questions you no longer need, or contact MineGO to raise the limit.',
  exam_drafts: 'Your account has reached its limit of saved drafts. Delete drafts you no longer need, or contact MineGO to raise the limit.',
  exam_snapshots: 'Your account has reached its limit of finalized papers. Contact MineGO to raise the limit; your reviewed paper is still on this page.',
}
const RATE_MESSAGES: Readonly<Record<string, string>> = {
  exam_snapshots: 'You have finalized many papers in the last hour. Wait a while, then finalize again; your reviewed paper is still on this page.',
  catalogue_imports: 'You have started many imports today. Try again tomorrow, or contact MineGO if you need more.',
}
const FALLBACK = 'Your account has reached a usage limit. Contact MineGO to raise it.'

type ProviderError = { code?: unknown; hint?: unknown } | null | undefined

/** The teacher-facing error for a database account-limit rejection, or null for any other error. */
export function accountLimitError(error: ProviderError): Error | null {
  if (!error || error.code !== ACCOUNT_LIMIT_CODE) return null
  const match = typeof error.hint === 'string' ? /^account-limit:([a-z_]+):(total|rate)$/.exec(error.hint) : null
  const message = match ? (match[2] === 'rate' ? RATE_MESSAGES : TOTAL_MESSAGES)[match[1]] : undefined
  const limitError = new Error(message ?? FALLBACK)
  limitError.name = 'AccountLimitError'
  return limitError
}
