import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'
import { englishLeft } from './support/arabic.ts'

for (const width of [390, 1280]) {
  test(`reviewer tools read in Arabic at ${width}px, with source records left as written`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await syntheticBackend(page)
    state.curationReviewer = true
    await syntheticSignIn(page)
    await page.getByRole('button', { name: 'العربية' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await page.getByRole('button', { name: 'الإعدادات', exact: true }).click()
    await page.getByRole('button', { name: 'فتح أدوات المراجعة', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'مراجعة الأوراق الجاهزة ونشرها', exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'اختر بنكًا لفتح سجلات مراجعة أسئلته الجاهزة.' })).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)

    await page.getByRole('combobox', { name: 'البنك', exact: true }).selectOption({ label: 'Browser synthetic bank' })
    await page.getByText('موثوقية الأسئلة الجاهزة ومصدرها ومراجعتها').click()
    await expect(page.getByText('المراجع المخوَّل: Synthetic reviewer')).toBeVisible()
    await expect(page.getByText('تعرض قائمة السجلات 25 من 1606 سجلًا مطابقًا.', { exact: false })).toBeVisible()

    await page.getByText('استيراد مصادر الفهرس الموثَّقة', { exact: true }).click()
    await expect(page.getByRole('group', { name: 'تجهيز الإصدار المحفوظ الدقيق' })).toBeVisible()
    expect(await englishLeft(page)).toEqual([])

    // An exact source revision, its question variety form and one record with its history.
    await page.getByRole('combobox', { name: 'تنطبق الأدلة على' }).selectOption({ index: 2 })
    await expect(page.getByRole('heading', { name: 'النسخة الدقيقة من المصدر' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'تنوّع الأسئلة' })).toBeVisible()
    const record = page.locator('.preset-curation > div > details').first()
    await record.locator('summary').first().click()
    await expect(record).toContainText('مسودة، نسخة المراجعة 1')
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)
    expect(state.unhandled).toEqual([])
  })
}
