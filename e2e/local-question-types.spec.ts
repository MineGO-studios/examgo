import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

test('the question type chooser groups types and says where each can be used', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  await page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'Question banks', exact: true }).click()
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  const chooser = page.getByRole('combobox', { name: 'Question type' })
  await expect(chooser.locator('optgroup')).toHaveCount(2)
  await expect(chooser.locator('option')).toHaveCount(9)
  await expect(page.locator('#question-type-use')).toHaveText('Used in: Pick questions by type.')
  await chooser.selectOption('rewrite')
  await expect(page.locator('#question-type-use')).toHaveText(/^Not in hosted papers yet/)
  await chooser.selectOption('matching')
  await expect(page.locator('#question-type-use')).toContainText('Not in hosted papers yet')
  await checkAccessibility(page)
  expect(state.unhandled).toEqual([])
})
