import { expect, test, type Page } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

const owner = '10000000-0000-4000-8000-000000000001'
const bankId = '20000000-0000-4000-8000-000000000001'
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const draft = (n: number, title: string, updatedDaysAgo: number) => ({
  id: `a0000000-0000-4000-8000-00000000000${n}`, owner_id: owner, bank_id: bankId, bank_ids: null, exam_title: title, grade: 6, unit: 1,
  question_count: 4, marks_per_question: 5, school_name: 'Synthetic school', selection_seed: n, status: 'draft',
  created_at: daysAgo(updatedDaysAgo + 1), updated_at: daysAgo(updatedDaysAgo),
})

async function openMyPapers(page: Page) {
  const state = await syntheticBackend(page)
  state.tables.exam_drafts.push(draft(1, 'First Monthly Test', 0), draft(2, 'Mid-year Exam', 1), draft(3, 'Unit 2 Vocabulary Check', 6))
  await syntheticSignIn(page)
  await page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'My papers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My papers', exact: true })).toBeVisible()
  return state
}

for (const width of [320, 1280]) {
  test(`My papers desk, timeline and list at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await openMyPapers(page)
    const timeline = page.getByRole('region', { name: 'Your papers over time' })
    await expect(timeline.getByRole('button', { name: /^First Monthly Test, Edited / })).toBeVisible()
    await expect(timeline.getByRole('button')).toHaveCount(3)
    await expect(page.getByRole('heading', { name: /On the desk/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue Mid-year Exam', exact: true })).toBeVisible()
    await checkAccessibility(page)

    // A dot pins its name and leads to its paper.
    const dot = timeline.getByRole('button', { name: /^Unit 2 Vocabulary Check, / })
    await dot.click()
    await expect(dot).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await expect(dot).toHaveAttribute('aria-pressed', 'false')

    // Search filters the papers and dims the other dots; the list view keeps the same papers.
    await page.getByRole('searchbox', { name: 'Search papers' }).fill('vocab')
    await expect(page.getByRole('button', { name: /^Continue / })).toHaveCount(1)
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).click()
    await expect(page.getByRole('button', { name: 'Continue Unit 2 Vocabulary Check', exact: true })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search papers' }).fill('nothing like this')
    await expect(page.getByRole('status').filter({ hasText: 'No papers match' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear search', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Continue / })).toHaveCount(3)
    await checkAccessibility(page)
    expect(state.unhandled).toEqual([])
  })
}

test('My papers keeps a draft with missing questions for review', async ({ page }) => {
  // The seeded drafts have no saved question rows, so reopening must stop for review instead of guessing.
  const state = await openMyPapers(page)
  await page.getByRole('button', { name: 'Continue First Monthly Test', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'First Monthly Test', exact: true })).toBeVisible()
  await expect(page.getByText('Review required', { exact: true })).toBeVisible()
  await checkAccessibility(page)
  await page.getByRole('button', { name: 'Return to My papers', exact: true }).click()
  await expect(page.getByRole('heading', { name: /On the desk/ })).toBeVisible()
  expect(state.unhandled).toEqual([])
})

for (const width of [320, 1280]) {
  test(`dark appearance passes automated WCAG checks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: 'dark' })
    const state = await openMyPapers(page)
    await checkAccessibility(page)
    await page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'New paper', exact: true }).click()
    await page.getByRole('button', { name: 'Preview questions', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Review the paper' })).toBeVisible()
    await checkAccessibility(page)
    await page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'Question banks', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Question banks', exact: true })).toBeVisible()
    await checkAccessibility(page)
    expect(state.unhandled).toEqual([])
  })
}

test('a busy day becomes one numbered dot that lists its papers', async ({ page }) => {
  const state = await syntheticBackend(page)
  state.tables.exam_drafts.push(draft(1, 'First Monthly Test', 0), draft(2, 'Mid-year Exam', 0), draft(3, 'Unit 2 Vocabulary Check', 0), draft(4, 'Reading Quiz', 9))
  await syntheticSignIn(page)
  await page.getByRole('navigation', { name: 'Teacher workspace' }).getByRole('button', { name: 'My papers', exact: true }).click()
  const timeline = page.getByRole('region', { name: 'Your papers over time' })
  const cluster = timeline.getByRole('button', { name: '3 papers, Today', exact: true })
  await expect(timeline.getByRole('button')).toHaveCount(2)
  await cluster.click()
  const list = page.getByRole('dialog', { name: '3 papers, Today' })
  await expect(list.getByRole('button')).toHaveCount(3)
  await expect(list.getByRole('button').first()).toBeFocused()
  await checkAccessibility(page)
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(cluster).toBeFocused()
  await cluster.click()
  await page.getByRole('dialog').getByRole('button', { name: /Unit 2 Vocabulary Check/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.unhandled).toEqual([])
})
