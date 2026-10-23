import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

test('New paper shows the shapes and keeps the empty shared source visible with its reason', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  await expect(page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'New paper', exact: true })).toHaveAttribute('aria-current', 'page')
  const shapes = page.getByRole('region', { name: 'What kind of paper?' })
  for (const name of ['Pick questions by type', 'Use a preset exam paper made by MineGO']) {
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
  await page.getByRole('button', { name: 'Use a preset exam paper made by MineGO', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Use a preset exam paper made by MineGO', exact: true })).toBeVisible()
  await expect(pick).not.toHaveAttribute('aria-pressed', 'true')
  // Activating the unavailable shape does not start it.
  await pick.dispatchEvent('click')
  await expect(page.getByRole('heading', { name: 'Use a preset exam paper made by MineGO', exact: true })).toBeVisible()
  await checkAccessibility(page)
  expect(state.unhandled).toEqual([])
})

test('a new teacher can start from MineGO presets, and an empty desk offers one action', async ({ page }) => {
  const state = await syntheticBackend(page)
  state.tables.question_banks.splice(0)
  await syntheticSignIn(page, true, undefined, false)
  const nav = page.getByRole('navigation', { name: 'Teacher workspace' })
  await nav.getByRole('button', { name: 'My papers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No papers yet' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: 'New paper', exact: true })).toHaveCount(1)
  await nav.getByRole('button', { name: 'Question banks', exact: true }).click()
  await expect(page.getByText('MineGO reviewers')).toHaveCount(0)
  await page.getByRole('button', { name: 'Use a preset exam paper made by MineGO', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Use a preset exam paper made by MineGO', exact: true })).toBeVisible()
  await checkAccessibility(page)
  expect(state.unhandled).toEqual([])
})

test('review tools are named icons with tooltips, and one button switches the language', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  await page.getByRole('button', { name: 'Preview questions', exact: true }).click()
  const lock = page.getByRole('button', { name: 'Lock question 1', exact: true })
  await expect(lock).toHaveAttribute('aria-pressed', 'false')
  await lock.hover()
  await expect(page.getByRole('tooltip').filter({ hasText: 'Lock question 1' })).toBeVisible()
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Replace question 1', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove question 1', exact: true })).toBeDisabled()
  const box = await lock.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  await checkAccessibility(page)

  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('button', { name: 'قفل السؤال 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  expect(state.unhandled).toEqual([])
})
