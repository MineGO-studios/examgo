import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

test('Settings groups choices by scope and remembers device preferences', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  const nav = page.getByRole('navigation', { name: 'Teacher workspace' })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  for (const name of ['Account', 'Language and appearance on this device', 'My papers on this device', 'For MineGO reviewers']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Sign out of all devices', exact: true })).toBeVisible()
  await checkAccessibility(page)

  // Language applies at once, flips direction and confirms where it is kept.
  await page.getByRole('group', { name: 'Interface language' }).getByRole('radio', { name: 'العربية' }).check()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('status').filter({ hasText: 'حُفظ على هذا الجهاز.' })).toBeVisible()
  await checkAccessibility(page)
  await page.getByRole('group', { name: 'لغة الواجهة' }).getByRole('radio', { name: 'English' }).check()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')

  // The My papers default view is shared with the toggle on My papers.
  await page.getByRole('group', { name: 'Default view' }).getByRole('radio', { name: 'List' }).check()
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device.' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('examgo.papers.view'))).toBe('list')
  await nav.getByRole('button', { name: 'My papers', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Default view' }).getByRole('radio', { name: 'List' })).toBeChecked()
  expect(state.unhandled).toEqual([])
})
