import { expect, test, type Page } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

const owner = '10000000-0000-4000-8000-000000000001', bankId = '20000000-0000-4000-8000-000000000001'
const draft = { id: 'a0000000-0000-4000-8000-000000000001', owner_id: owner, bank_id: bankId, bank_ids: null, exam_title: 'First Monthly Test', grade: 6, unit: 1,
  question_count: 4, marks_per_question: 5, school_name: 'S', selection_seed: 1, status: 'draft', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }

async function papers(page: Page) {
  const state = await syntheticBackend(page)
  state.tables.exam_drafts.push(draft)
  await syntheticSignIn(page)
  await page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'My papers', exact: true }).click()
  return state
}

test('a help tip opens on focus and hover, stays readable, and closes with Escape', async ({ page }) => {
  const state = await papers(page)
  const help = page.getByRole('button', { name: 'More about Your papers over time', exact: true })
  await help.focus()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('Drafts sit on the day you last edited them')
  await checkAccessibility(page)
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  await help.hover()
  await expect(page.getByRole('tooltip')).toBeVisible()
  const box = await help.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(state.unhandled).toEqual([])
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('a tap opens the help tip and a second tap closes it', async ({ page }) => {
    await papers(page)
    const help = page.getByRole('button', { name: 'More about Your papers over time', exact: true })
    await help.tap()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await help.tap()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    // After a tap, tapping elsewhere still dismisses the tip.
    await help.tap()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await page.getByRole('heading', { name: 'My papers', exact: true }).tap()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })
})
