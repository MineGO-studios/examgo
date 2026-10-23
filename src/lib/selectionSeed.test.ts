import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountSelectionSeed, isValidSelectionSeed, readSelectionSeed, storeSelectionSeed } from './selectionSeed'

function stubStorage(blocked = false) {
  const data = new Map<string, string>()
  const fail = () => { throw new Error('blocked') }
  vi.stubGlobal('window', { localStorage: blocked ? { getItem: fail, setItem: fail, removeItem: fail } : {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  } })
}

describe('teacher selection number', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('gives each account its own stable number', () => {
    const a = accountSelectionSeed('teacher-a'), b = accountSelectionSeed('teacher-b')
    expect(a).toBe(accountSelectionSeed('teacher-a'))
    expect(a).not.toBe(b)
    expect(isValidSelectionSeed(a) && isValidSelectionSeed(b)).toBe(true)
  })

  it('uses a saved number for that account only, and resets to the account number', () => {
    stubStorage()
    expect(storeSelectionSeed('teacher-a', 42)).toBe(true)
    expect(readSelectionSeed('teacher-a')).toBe(42)
    expect(readSelectionSeed('teacher-b')).toBe(accountSelectionSeed('teacher-b'))
    storeSelectionSeed('teacher-a', null)
    expect(readSelectionSeed('teacher-a')).toBe(accountSelectionSeed('teacher-a'))
  })

  it('keeps the choice for this visit when storage is blocked', () => {
    stubStorage(true)
    expect(storeSelectionSeed('teacher-c', 7)).toBe(false)
    expect(readSelectionSeed('teacher-c')).toBe(7)
  })
})
