import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

test('New paper shows the shapes and keeps the empty shared source visible with its reason', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  await expect(page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'New paper', exact: true })).toHaveAttribute('aria-current', 'page')
  const shapes = page.getByRole('region', { name: 'What kind of paper?' })
  for (const name of ['Pick questions by type', 'Use an approved exercise', 'Iraqi exercises and writing']) {
    await expect(shapes.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(shapes.getByRole('button', { name: 'Pick questions by type', exact: true })).not.toHaveAttribute('aria-disabled', 'true')
  const shared = page.getByRole('group', { name: 'Shared MineGO questions' })
  await expect(shared).toContainText('No approved standalone questions are available yet')
  await checkAccessibility(page)
  expect(state.unhandled).toEqual([])
})

test('a teacher without banks sees Pick questions by type disabled with the fix', async ({ page }) => {
  const state = await syntheticBackend(page)
  state.tables.question_banks.splice(0)
  await syntheticSignIn(page, true, undefined, false)
  await page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'New paper', exact: true }).click()
  const pick = page.getByRole('region', { name: 'What kind of paper?' }).getByRole('button', { name: 'Pick questions by type', exact: true })
  await expect(pick).toHaveAttribute('aria-disabled', 'true')
  await expect(pick).toContainText('Add or import questions to a bank in Question banks first.')
  await expect(pick).toBeDisabled()
  await page.getByRole('button', { name: 'Use an approved exercise', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Use an approved exercise', exact: true })).toBeVisible()
  await expect(pick).not.toHaveAttribute('aria-pressed', 'true')
  // Activating the unavailable shape does not start it.
  await pick.dispatchEvent('click')
  await expect(page.getByRole('heading', { name: 'Use an approved exercise', exact: true })).toBeVisible()
  await checkAccessibility(page)
  expect(state.unhandled).toEqual([])
})
