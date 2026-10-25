import { expect, test, type Page } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'
import { englishLeft } from './support/arabic.ts'

const owner = '10000000-0000-4000-8000-000000000001'
const bankId = '20000000-0000-4000-8000-000000000001'
const now = new Date().toISOString()
const binary = (n: number) => ({ id: `30000000-0000-4000-8000-00000000001${n}`, owner_id: owner, bank_id: bankId,
  external_id: `E2E-TF-${n}`, unit: 1, lesson: '1', question_type: 'binary', difficulty: 'easy', prompt: `Synthetic statement ${n}.`,
  marks: 1, schema_version: 1, current_revision: 1, is_active: true, options: [], correct_option_label: null,
  content: { type: 'binary', schemaVersion: 1, labelMode: 'true-false' }, answer: { type: 'binary', schemaVersion: 1, isTrue: true },
  created_at: now, updated_at: now })

async function previewMixedPaper(page: Page, arabic: boolean) {
  const state = await syntheticBackend(page)
  state.tables.questions.push(binary(1), binary(2), binary(3))
  await syntheticSignIn(page)
  await page.getByRole('spinbutton', { name: /True\/false or yes\/no|True/ }).first().fill('3')
  await page.getByRole('spinbutton', { name: /^Short answer/ }).fill('1')
  if (arabic) await page.getByRole('button', { name: 'العربية' }).click()
  await page.getByRole('button', { name: arabic ? 'معاينة الأسئلة' : 'Preview questions', exact: true }).click()
  return state
}

for (const width of [390, 1280]) {
  test(`the paper plan is one bar by question type with details on demand at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await previewMixedPaper(page, false)
    const plan = page.getByRole('region', { name: 'Paper plan' })
    await expect(plan).toContainText('Paper plan · 4 questions')
    const segments = plan.locator('.paper-plan-seg')
    await expect(segments).toHaveCount(2)
    await page.screenshot({ path: `output/paper-plan/plan-${width}.png` })

    // Clicking a colour pins its details; each listed question jumps to the paper.
    const shortAnswer = plan.getByRole('button', { name: /^Short answer: 1 mark, 1 item/ })
    await shortAnswer.click()
    await expect(shortAnswer).toHaveAttribute('aria-expanded', 'true')
    const details = page.getByRole('region', { name: 'Short answer details' })
    await expect(details).toContainText('1 mark · 1 item · 25% of the paper')
    await page.screenshot({ path: `output/paper-plan/details-${width}.png` })
    await checkAccessibility(page)
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()
    await expect(shortAnswer).toBeFocused()

    await shortAnswer.click()
    const row = details.getByRole('button', { name: /^Go to Q\d on the paper$/ })
    const label = (await row.textContent())!
    await row.click()
    await expect(details).toBeHidden()
    await expect(page.locator(`#paper-question-${label.slice(1)}`)).toBeFocused()
    expect(state.unhandled).toEqual([])
  })
}

test('the paper plan reads in Arabic, right to left', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await previewMixedPaper(page, true)
  const plan = page.getByRole('region', { name: 'خطة الورقة' })
  await expect(plan).toContainText('4 أسئلة')
  await plan.locator('.paper-plan-seg').first().click()
  await expect(page.getByRole('region', { name: /^تفاصيل / })).toContainText('75‎%‎ من الورقة')
  await page.screenshot({ path: 'output/paper-plan/details-ar-390.png' })
  expect(await englishLeft(page)).toEqual([])
  await checkAccessibility(page)
})
