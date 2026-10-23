import { EXAM_LIMITS } from '../types/exam'

/*
 * The teacher's selection number (seed). It decides which questions a new paper picks when
 * several fit, so two teachers with the same settings get different papers. Each account starts
 * with its own number derived from the account id; a teacher may change it once in Settings.
 * The choice is kept on this device for that account until account settings exist (MIN-261).
 */

const KEY_PREFIX = 'examgo.selectionSeed.'
// Holds the choice for this visit when the browser blocks storage.
const visit = new Map<string, number>()

/** A stable 32-bit number from the account id (FNV-1a), different for each teacher. */
export function accountSelectionSeed(ownerId: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < ownerId.length; i++) {
    hash ^= ownerId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function isValidSelectionSeed(value: number): boolean {
  return Number.isSafeInteger(value) && value >= EXAM_LIMITS.minimumSelectionSeed && value <= EXAM_LIMITS.maximumSelectionSeed
}

/** The teacher's chosen number on this device, or the account's own default. */
export function readSelectionSeed(ownerId: string): number {
  try {
    const stored = Number(window.localStorage.getItem(KEY_PREFIX + ownerId) ?? NaN)
    if (isValidSelectionSeed(stored)) return stored
  } catch { /* Storage can be blocked; fall back to this visit's choice. */ }
  return visit.get(ownerId) ?? accountSelectionSeed(ownerId)
}

/** Returns false when the browser will not remember it; the number still applies for this visit. */
export function storeSelectionSeed(ownerId: string, seed: number | null): boolean {
  if (seed === null) visit.delete(ownerId)
  else visit.set(ownerId, seed)
  try {
    if (seed === null) window.localStorage.removeItem(KEY_PREFIX + ownerId)
    else window.localStorage.setItem(KEY_PREFIX + ownerId, String(seed))
    return true
  } catch {
    return false
  }
}
