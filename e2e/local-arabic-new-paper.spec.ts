import { expect, test, type Page } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

/** Visible interface text with Latin words, excluding paper content, user data and brand names. */
async function englishLeft(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const skip = (el: Element) => el.closest('bdi,[dir=ltr],[dir=auto],.ministry-sheet,input,select,script,style,.mini-sheet,[lang=en],.chip,.question-row-prompt')
    const out = new Set<string>()
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.replace(/MineGO|ExamGO|DOCX|Word|Q\d+/g, '').trim() ?? ''
      const el = node.parentElement
      if (!el || !/[A-Za-z]{3,}/.test(text) || skip(el)) continue
      out.add(text.slice(0, 80))
    }
    return [...out]
  })
}

for (const width of [390, 1280]) {
  test(`New paper reads in Arabic at ${width}px, with the paper itself in English`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await syntheticBackend(page)
    await syntheticSignIn(page)
    await page.getByRole('button', { name: 'العربية' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

    await expect(page.getByRole('heading', { name: 'ورقة جديدة', exact: true })).toBeVisible()
    const shapes = page.getByRole('region', { name: 'ما نوع الورقة؟' })
    await expect(shapes.getByRole('button', { name: 'اختيار الأسئلة حسب النوع', exact: true })).toBeVisible()
    await expect(shapes.getByRole('button', { name: 'استخدام ورقة امتحان جاهزة من MineGO', exact: true })).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)

    // A setup error is announced in Arabic and linked to its field.
    await page.getByRole('textbox', { name: 'اسم المدرسة' }).fill('')
    await page.getByRole('button', { name: 'معاينة الأسئلة', exact: true }).click()
    const summary = page.getByRole('alert').filter({ hasText: 'توجد مشكلة' })
    await expect(summary).toBeFocused()
    await expect(summary.getByRole('link', { name: 'اسم المدرسة مطلوب.' })).toBeVisible()
    await page.getByRole('textbox', { name: 'اسم المدرسة' }).fill('Al-Mansour Primary School')

    // Review: the controls are Arabic; the sheet stays English.
    await page.getByRole('button', { name: 'معاينة الأسئلة', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'مراجعة الورقة', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ورقة الطالب', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.ministry-sheet')).toHaveAttribute('lang', 'en')
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)

    // The preset paper page is Arabic too.
    await page.getByRole('button', { name: 'البدء بنوع آخر', exact: true }).click()
    await page.getByRole('button', { name: 'استخدام ورقة امتحان جاهزة من MineGO', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'استخدام ورقة امتحان جاهزة من MineGO', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'تمرين جاهز كامل', exact: true })).toBeVisible()
    expect(await englishLeft(page)).toEqual([])
    await checkAccessibility(page)
    expect(state.unhandled).toEqual([])
  })
}
