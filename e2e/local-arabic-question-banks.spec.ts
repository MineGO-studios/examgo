import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'
import { englishLeft } from './support/arabic.ts'

for (const width of [390, 1280]) {
  test(`Question banks read in Arabic at ${width}px, with question content left as written`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await syntheticBackend(page)
    await syntheticSignIn(page)
    await page.getByRole('button', { name: 'العربية' }).click()
    await page.getByRole('navigation', { name: 'مساحة عمل المعلم' }).getByRole('button', { name: 'بنوك الأسئلة', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'بنوك الأسئلة', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'الأسئلة', exact: true })).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)

    // The question form, with an Arabic validation message.
    await page.getByRole('button', { name: 'إضافة سؤال', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'إضافة سؤال', exact: true })).toBeVisible()
    await expect(page.locator('#question-type-use')).toHaveText('تُستخدم في: اختيار الأسئلة حسب النوع.')
    await page.getByRole('button', { name: 'حفظ السؤال', exact: true }).click()
    await expect(page.getByText('يجب أن يحتوي نص السؤال على 1 إلى 2000 حرف.').first()).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)

    // Import and passages.
    await page.getByRole('button', { name: 'العودة إلى الأسئلة', exact: true }).click()
    const sections = width < 640 ? null : page.getByRole('group', { name: 'أقسام بنك الأسئلة' })
    if (sections) await sections.getByRole('button', { name: 'استيراد ملف', exact: true }).click()
    else await page.getByRole('combobox', { name: 'قسم بنك الأسئلة' }).selectOption('import')
    await expect(page.getByRole('heading', { name: 'استيراد ملف', exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'اختر ملف أسئلة للبدء.' })).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)
    if (sections) await sections.getByRole('button', { name: 'القطع', exact: true }).click()
    else await page.getByRole('combobox', { name: 'قسم بنك الأسئلة' }).selectOption('groups')
    await expect(page.getByRole('heading', { name: 'القطع والتمارين المرتبطة', exact: true })).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)
    expect(state.unhandled).toEqual([])
  })
}
