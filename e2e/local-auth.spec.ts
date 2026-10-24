import { expect, test } from '@playwright/test'
import { checkAccessibility } from './support/accessibility.ts'

for (const width of [320, 1280]) {
test(`sign-in keyboard, automated WCAG A/AA and reflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'ExamGO' })).toBeVisible()
  await page.getByRole('button', { name: 'Create account', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeFocused()
  await checkAccessibility(page)
})
}

test('production HTTP responses retain the configured security headers', async ({ request }) => {
  const response = await request.get('/')
  expect(response.ok()).toBeTruthy()
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(response.headers()['x-frame-options']).toBe('DENY')
})
