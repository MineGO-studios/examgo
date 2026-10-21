import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

test('an invalid paper shows one error summary that links to each field and keeps the teacher’s work', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  const title = page.getByRole('textbox', { name: 'Test title', exact: true })
  const school = page.getByRole('textbox', { name: 'School name', exact: true })
  await page.getByRole('textbox', { name: /^Teacher name for footer/ }).fill('Ms Hana')
  await title.fill('')
  await school.fill('')
  await page.getByRole('button', { name: 'Preview questions', exact: true }).click()

  const summary = page.getByRole('alert').filter({ hasText: 'There is a problem' })
  await expect(summary).toBeFocused()
  await expect(summary.getByRole('link')).toHaveCount(2)
  // No false success: the review does not appear, and other input is kept.
  await expect(page.getByRole('region', { name: 'Review the paper' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /^Teacher name for footer/ })).toHaveValue('Ms Hana')
  await expect(title).toHaveAttribute('aria-describedby', 'exam-title-error')
  await checkAccessibility(page)

  await summary.getByRole('link', { name: 'Test title is required.' }).click()
  await expect(title).toBeFocused()
  await title.fill('Recovered paper')
  await school.fill('Synthetic school')
  await page.getByRole('button', { name: 'Preview questions', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Review the paper' })).toBeVisible()
  await expect(page.getByText('There is a problem')).toHaveCount(0)
  expect(state.unhandled).toEqual([])
})
