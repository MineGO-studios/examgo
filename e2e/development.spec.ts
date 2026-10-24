import { expect, test } from '@playwright/test'
import { syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

// Phase 14's structured builder is currently Development-only in App.tsx.
// Never report these checks as production-bundle or real persistence evidence.
for (const width of [320, 1280]) {
  test(`structured review, RTL, answer isolation and stale preview at ${width}px`, async ({ page }) => {
    const state = await syntheticBackend(page)
    await page.setViewportSize({ width, height: 900 })
    await syntheticSignIn(page)
    await page.getByRole('button', { name: 'Structured paper', exact: true }).click()
    await page.getByRole('textbox', { name: 'School name', exact: true }).fill('Synthetic school')
    await page.getByRole('textbox', { name: 'Test title', exact: true }).fill('Synthetic structured paper')
    await page.getByRole('spinbutton', { name: 'Paper total marks', exact: true }).fill('2')
    await page.getByRole('checkbox', { name: 'Browser synthetic bank', exact: true }).check()
    await page.getByRole('spinbutton', { name: 'Number of questions', exact: true }).fill('2')
    await page.getByRole('spinbutton', { name: 'Displayed points', exact: true }).fill('2')
    await page.getByRole('spinbutton', { name: 'Points to answer', exact: true }).fill('2')
    await page.getByRole('spinbutton', { name: 'Branch marks', exact: true }).fill('2')
    await page.getByRole('textbox', { name: 'Arabic instruction (optional)', exact: true }).fill('أجب عن الأسئلة الآتية')
    await checkAccessibility(page)
    await page.getByRole('button', { name: 'Review complete paper', exact: true }).focus()
    await page.keyboard.press('Enter')
    const student = page.getByRole('article', { name: 'Student paper content', exact: true })
    await expect(student).toContainText('Synthetic question')
    await expect(student).not.toContainText('KEY_ONLY_')
    await expect(student.locator('[lang="ar"][dir="rtl"]')).toContainText('أجب عن الأسئلة الآتية')
    await checkAccessibility(page)
    await page.getByText('Edit Q1: questions and marks', { exact: true }).click()
    await page.getByRole('button', { name: 'Replace question 1', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Choose a replacement', exact: true })).toContainText('No replacement matches this search and section')
    await page.getByRole('button', { name: 'Keep current selection', exact: true }).click()
    if (width === 320) await page.getByRole('button', { name: 'Paper review', exact: true }).click()
    await expect(student).toContainText('Synthetic question 1')
    await expect(student).toContainText('Synthetic question 2')
    await page.getByRole('button', { name: 'Answer key', exact: true }).click()
    await expect(page.getByRole('table', { name: 'Answers and marking rules' })).toContainText('KEY_ONLY_1')
    await checkAccessibility(page)
    await page.getByRole('button', { name: 'Student paper', exact: true }).click()
    await expect(student).not.toContainText('KEY_ONLY_')
    state.failBlueprintSave = true
    await page.getByRole('button', { name: 'Save blueprint', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Retry the same save', exact: true })).toBeEnabled()
    await expect(page.locator('body')).not.toContainText('synthetic-private-blueprint-detail')
    await expect(page.getByRole('textbox', { name: 'Test title', exact: true, includeHidden: true })).toBeDisabled()
    state.failBlueprintSave = false
    await page.getByRole('button', { name: 'Retry the same save', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Configuration saved, version 1' })).toBeVisible()
    expect(state.blueprintRequests).toHaveLength(2)
    expect(state.blueprintRequests[0]).toEqual(state.blueprintRequests[1])
    await page.getByRole('button', { name: 'Question plan', exact: true }).click()
    await page.getByRole('textbox', { name: 'Test title', exact: true }).fill('Changed intent requires review')
    await expect(page.getByRole('region', { name: 'Assembled paper', exact: true })).toBeHidden()
    expect(state.unhandled).toEqual([])
  })
}
