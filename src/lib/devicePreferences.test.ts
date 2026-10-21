import { afterEach, describe, expect, it, vi } from 'vitest'
import { devicePreferencesAvailable, readPapersView, storePapersView } from './devicePreferences'

function stubWindow(storage: Partial<Storage> | 'blocked', wide = true) {
  const localStorage = storage === 'blocked'
    ? { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    : storage
  vi.stubGlobal('window', { localStorage, matchMedia: () => ({ matches: wide }) })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('device preferences', () => {
  it('remembers the My papers view', () => {
    const values = new Map<string, string>()
    stubWindow({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } })
    expect(storePapersView('list')).toBe(true)
    expect(readPapersView()).toBe('list')
    expect(devicePreferencesAvailable()).toBe(true)
  })

  it('falls back to the screen size and reports when storage is blocked', () => {
    stubWindow('blocked', false)
    expect(readPapersView()).toBe('list')
    expect(storePapersView('desk')).toBe(false)
    expect(devicePreferencesAvailable()).toBe(false)
  })
})
