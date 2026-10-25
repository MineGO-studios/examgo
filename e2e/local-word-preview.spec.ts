import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'
import { englishLeft } from './support/arabic.ts'

for (const width of [390, 1280]) {
  test(`Generate shows the Word files under the real CSP before any download at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const violations: string[] = []
    await page.exposeFunction('recordViolation', (text: string) => violations.push(text))
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) =>
      (window as unknown as { recordViolation: (t: string) => void }).recordViolation(`${event.violatedDirective} ${event.blockedURI}`)))
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    const state = await syntheticBackend(page)
    await syntheticSignIn(page)
    await page.getByRole('button', { name: 'Preview questions', exact: true }).click()
    await page.getByRole('button', { name: 'Generate', exact: true }).click()

    const preview = page.getByRole('region', { name: 'Check the Word files' })
    await expect(preview).toBeVisible()
    const shadowText = () => page.locator('.word-preview-host').evaluate((host) => host.shadowRoot?.textContent ?? '')
    await expect.poll(shadowText).toContain('Synthetic question')
    expect(await shadowText()).not.toContain('KEY_ONLY_')
    // Word styles applied through the CSSOM: the page has its Word width and font.
    const page1 = await page.locator('.word-preview-host').evaluate((host) => {
      const section = host.shadowRoot!.querySelector('section.word') as HTMLElement
      return { width: section.getBoundingClientRect().width, font: getComputedStyle(section).fontFamily }
    })
    expect(page1.width).toBeGreaterThan(200)
    await page.screenshot({ path: `output/word-preview/student-${width}.png`, fullPage: false })
    expect(downloads).toEqual([])

    await preview.getByRole('button', { name: 'Answer key', exact: true }).click()
    await expect.poll(shadowText).toContain('KEY_ONLY_')
    await checkAccessibility(page)

    await page.getByRole('button', { name: 'Download both files', exact: true }).click()
    await expect.poll(() => downloads.length).toBe(2)
    expect(violations).toEqual([])
    console.log('page width', JSON.stringify(page1))
    expect(state.unhandled).toEqual([])
  })
}

test('the Word preview reads in Arabic in dark mode, with the paper left to right', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await syntheticBackend(page)
  await syntheticSignIn(page)
  await page.getByRole('button', { name: 'العربية' }).click()
  await page.getByRole('button', { name: 'معاينة الأسئلة', exact: true }).click()
  await page.getByRole('button', { name: 'إنشاء', exact: true }).click()
  const preview = page.getByRole('region', { name: 'تحقّق من ملفات Word' })
  await expect(preview).toBeVisible()
  await expect(page.getByRole('heading', { name: 'تحقّق من ملفات Word' })).toBeFocused()
  await expect.poll(() => page.locator('.word-preview-host').evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('Synthetic question')
  await expect(page.locator('.word-preview-frame')).toHaveAttribute('dir', 'ltr')
  await expect(preview.getByRole('button', { name: 'تنزيل الملفين', exact: true })).toBeVisible()
  await page.screenshot({ path: 'output/word-preview/arabic-dark-390.png' })
  expect(await englishLeft(page)).toEqual([])
  await checkAccessibility(page)
})
