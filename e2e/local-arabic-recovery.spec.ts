import { expect, test, type Page } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'
import { englishLeft } from './support/arabic.ts'

const owner = '10000000-0000-4000-8000-000000000001'
const bankId = '20000000-0000-4000-8000-000000000001'
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const draft = (n: number, title: string, updatedDaysAgo: number) => ({
  id: `a0000000-0000-4000-8000-00000000000${n}`, owner_id: owner, bank_id: bankId, bank_ids: null, exam_title: title, grade: 6, unit: 1,
  question_count: 4, marks_per_question: 5, school_name: 'Synthetic school', selection_seed: n, status: 'draft',
  created_at: daysAgo(updatedDaysAgo + 1), updated_at: daysAgo(updatedDaysAgo),
})

async function signInArabic(page: Page) {
  await syntheticSignIn(page)
  await page.getByRole('button', { name: 'العربية' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
}

for (const width of [390, 1280]) {
  test(`My papers and draft recovery read in Arabic at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await syntheticBackend(page)
    state.tables.exam_drafts.push(draft(1, 'First Monthly Test', 0), draft(2, 'Mid-year Exam', 3))
    await signInArabic(page)
    await page.getByRole('navigation', { name: 'مساحة عمل المعلم' }).getByRole('button', { name: 'أوراقي', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'أوراقي', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'متابعة Mid-year Exam', exact: true })).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)

    // The seeded drafts have no saved question rows, so reopening stops for review, in Arabic.
    await page.getByRole('button', { name: 'متابعة First Monthly Test', exact: true }).click()
    await expect(page.getByText('تحتاج مراجعة', { exact: true })).toBeVisible()
    await expect(page.getByText('سؤال محفوظ أو أكثر غير موجود أو لم يعد الوصول إليه ممكنًا.')).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)
    await page.getByRole('button', { name: 'العودة إلى أوراقي', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'أوراقي', exact: true })).toBeVisible()
    expect(state.unhandled).toEqual([])
  })
}

test('a failed save and a failed sign-out are explained in Arabic, with the reference kept', async ({ page }) => {
  const state = await syntheticBackend(page)
  await signInArabic(page)
  await page.getByRole('textbox', { name: 'عنوان الاختبار', exact: true }).fill('Recoverable synthetic paper')
  await page.getByRole('button', { name: 'معاينة الأسئلة', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'مراجعة الورقة', exact: true })).toBeVisible()
  state.failDraftSave = true
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click()
  const failure = page.getByRole('alert').filter({ hasText: 'تعذّر حفظ مسودة الامتحان' })
  await expect(failure).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'عنوان الاختبار', exact: true })).toHaveValue('Recoverable synthetic paper')
  expect(await englishLeft(page)).toEqual([])
  await checkAccessibility(page)
  state.failDraftSave = false

  state.failSignOut = true
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click()
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'البريد الإلكتروني', exact: true })).toBeVisible()
  const notice = page.getByRole('alert').filter({ hasText: 'تعذّر الوصول إلى الخادم' })
  await expect(notice).toContainText('تسجيل الخروج من كل الأجهزة')
  await expect(notice).toContainText('الرمز المرجعي: EG-')
  expect(await englishLeft(page)).toEqual([])
  await checkAccessibility(page)

})

test('an expired session asks to sign in again in Arabic', async ({ page }) => {
  const state = await syntheticBackend(page)
  await page.clock.install()
  await signInArabic(page)
  state.expireRefresh = true
  await page.clock.fastForward(3 * 60 * 60 * 1000)
  await expect(page.getByRole('textbox', { name: 'البريد الإلكتروني', exact: true })).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('سجّل الدخول بالحساب نفسه')
  expect(await englishLeft(page)).toEqual([])
  await checkAccessibility(page)
})
