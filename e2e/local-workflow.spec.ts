import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { presetGroup, syntheticBackend, syntheticSignIn } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'

for (const width of [320, 1280]) {
  test(`teacher builder keyboard, automated WCAG A/AA and reflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await syntheticBackend(page)
    await syntheticSignIn(page)
    await checkAccessibility(page)
    await page.getByRole('button', { name: 'Preview questions', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'Review the paper' })).toBeVisible()
    await checkAccessibility(page)
  })
}

for (const installed of [true, false]) {
  test(`builder loads the question pool ${installed ? 'in one database call' : 'through the batched fallback'}`, async ({ page }) => {
    const state = await syntheticBackend(page)
    state.poolMissing = !installed
    const questionReads: string[] = []
    page.on('request', request => { if (/\/rest\/v1\/(questions|question_group_questions)\?/.test(request.url())) questionReads.push(request.url()) })
    await syntheticSignIn(page)
    await expect(page.getByRole('spinbutton', { name: /Short answer 2 available/ })).toBeVisible()
    expect(state.poolRequests.length).toBeGreaterThan(0)
    expect(state.poolRequests.every(payload => payload.p_active_only === true && payload.p_standalone_only === true)).toBe(true)
    if (installed) expect(questionReads).toEqual([])
    else expect(questionReads.length).toBeGreaterThan(0)
    expect(state.unhandled).toEqual([])
  })
}

test('interrupted intake preserves confirmed mapping and retries the same batch; reviewer diagnostics stay restricted', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  await page.getByRole('button', { name: 'Question banks', exact: true }).click()
  await page.getByRole('button', { name: 'Import file', exact: true }).first().click()
  await page.getByLabel('Question file', { exact: true }).setInputFiles({ name: 'synthetic-teacher.csv', mimeType: 'text/csv',
    buffer: Buffer.from('id,unit,question,type,answer\nE2E-IMPORT-1,1,Where?,short-answer,Here') })
  await page.getByRole('combobox', { name: /Recognised template/ }).selectOption('teacher')
  const mapping = { 'each question ID': 'id', 'the unit': 'unit', 'the question text': 'question', 'the question type': 'type', 'the answer': 'answer' }
  for (const [label, value] of Object.entries(mapping)) await page.getByRole('combobox', { name: new RegExp(`Which column contains ${label}`) }).selectOption(value)
  await page.getByRole('checkbox', { name: 'I checked these columns and examples for this file' }).check()
  await page.getByRole('button', { name: 'Save column choices on this device', exact: true }).click()
  await page.getByRole('button', { name: 'Check imported questions', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save privately for review', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save privately for review', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Import batch 1 could not be confirmed' })).toBeVisible()
  await page.getByRole('button', { name: 'Save privately for review', exact: true }).click()
  await expect.poll(() => state.stagedRequests.length).toBe(2)
  expect(state.stagedRequests[0]).toEqual(state.stagedRequests[1])
  expect(state.tables.catalogue_imports).toHaveLength(1)
  await expect(page.getByRole('checkbox', { name: 'I checked these columns and examples for this file' })).toBeChecked()
  await expect(page.locator('body')).not.toContainText('synthetic-private-import-detail')
  await page.getByRole('button', { name: 'Show diagnostics (developers and authorized reviewers)', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Diagnostics are restricted' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('synthetic-private-reviewer-detail')
  await page.getByRole('button', { name: 'Load saved column choices', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'I checked these columns and examples for this file' })).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Save privately for review', exact: true })).toBeHidden()
  expect(state.unhandled).toEqual([])
})

test('bank creation uses the normal teacher UI', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  await page.getByRole('button', { name: 'Question banks', exact: true }).click()
  await page.getByRole('button', { name: 'Manage banks', exact: true }).click()
  await page.getByRole('textbox', { name: 'New Grade 6 English bank', exact: true }).fill('New synthetic bank')
  await page.getByRole('button', { name: 'Create bank', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Active bank' }).getByRole('radio', { name: 'New synthetic bank' })).toBeChecked()
  expect(state.tables.question_banks.map(row => row.name)).toContain('New synthetic bank')
  expect(state.unhandled).toEqual([])
})

test('failed save preserves reviewed intent; retry saves and paired export retries unchanged bytes', async ({ page }) => {
  const state = await syntheticBackend(page)
  // Fail only the first answer-key download request. The app must retain both prepared blobs.
  await page.addInitScript(() => {
    const original = HTMLAnchorElement.prototype.click
    let blocked = false
    HTMLAnchorElement.prototype.click = function () {
      if (!blocked && this.download.includes('Answer-Key')) { blocked = true; throw new DOMException('synthetic-private-download-detail', 'NotAllowedError') }
      return original.call(this)
    }
  })
  await syntheticSignIn(page)
  await page.getByRole('spinbutton', { name: /Short answer 2 available/ }).fill('2')
  await page.getByRole('textbox', { name: 'Test title', exact: true }).fill('Recoverable synthetic paper')
  await page.getByRole('button', { name: 'Preview questions', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Review the paper' })).toContainText('Synthetic question')
  state.failDraftSave = true
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to save the exam draft')
  await expect(page.getByRole('region', { name: 'Review the paper' })).toContainText('Paper plan · 2 questions')
  await expect(page.getByRole('textbox', { name: 'Test title', exact: true })).toHaveValue('Recoverable synthetic paper')
  await expect(page.locator('body')).not.toContainText('internal_relation_secret')
  expect(state.tables.exam_drafts).toHaveLength(0)
  state.failDraftSave = false
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('status').last()).toContainText('Exam draft saved')
  expect(state.tables.exam_drafts).toHaveLength(1)
  expect(state.tables.exam_draft_questions).toHaveLength(2)
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Check the Word files' })).toBeVisible()
  const studentPending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download both files', exact: true }).click()
  const first = await studentPending
  const student = await readFile((await first.path())!)
  await expect(page.getByRole('button', { name: 'Retry failed download', exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('synthetic-private-download-detail')
  const keyPending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Retry failed download', exact: true }).click()
  const keyDownload = await keyPending
  const key = await readFile((await keyDownload.path())!)
  const retryPending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download exam', exact: true }).click()
  const retryDownload = await retryPending
  const retry = await readFile((await retryDownload.path())!)
  expect(createHash('sha256').update(student).digest('hex')).toBe(createHash('sha256').update(retry).digest('hex'))
  const studentXml = await (await JSZip.loadAsync(student)).file('word/document.xml')!.async('string')
  const keyXml = await (await JSZip.loadAsync(key)).file('word/document.xml')!.async('string')
  expect(studentXml).not.toContain('KEY_ONLY_')
  expect(keyXml).toContain('KEY_ONLY_1')
  expect(keyXml).toContain('KEY_ONLY_2')
  expect(state.unhandled).toEqual([])
})

test('preset review loads a large bank one searched page at a time', async ({ page }) => {
  const state = await syntheticBackend(page)
  state.curationReviewer = true
  await syntheticSignIn(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Open reviewer tools', exact: true }).click()
  await page.getByRole('combobox', { name: 'Bank', exact: true }).selectOption({ label: 'Browser synthetic bank' })
  await page.getByText('Preset trust, provenance and review').click()
  await expect(page.getByText('Authorized reviewer: Synthetic reviewer')).toBeVisible()
  await expect(page.getByText('Record list shows 25 of 1606 matching records.')).toBeVisible()
  await expect(page.getByText('Question picker shows 100 of 1605 matching questions.')).toBeVisible()
  expect(state.curationRequests[0]).toMatchObject({ p_search: '', p_revision_id: null, p_record_limit: 25, p_target_limit: 100 })

  await page.getByRole('searchbox', { name: 'Find a question or record' }).fill('APPLE')
  await expect(page.getByText('Question picker shows 33 of 33 matching questions.')).toBeVisible()
  await expect(page.getByText('Record list shows 25 of 33 matching records.')).toBeVisible()
  // Typing is debounced into one search request rather than one per keystroke.
  expect(state.curationRequests.filter(payload => payload.p_search !== '' && payload.p_search !== 'APPLE')).toEqual([])

  const picker = page.getByRole('combobox', { name: 'Evidence applies to' })
  await picker.selectOption({ index: 2 })
  await expect(page.getByRole('heading', { name: 'Exact source revision' })).toBeVisible()
  await expect(page.getByRole('paragraph').filter({ hasText: /^Synthetic apple question 51\?$/ })).toBeVisible()
  expect(state.curationRequests.at(-1)).toMatchObject({ p_search: 'APPLE', p_revision_id: '90000000-0000-4000-8000-000000000051' })
  await expect(picker).toHaveValue('90000000-0000-4000-8000-000000000051')
  expect(state.unhandled).toEqual([])
})

test('a failed server sign-out remains visible after the local session is cleared', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  state.failSignOut = true
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('the server could not be reached to end the session')
  await expect(page.getByRole('alert')).toContainText('Sign out of all devices')
  await expect(page.getByRole('alert')).toContainText('Reference: EG-')
  // Three server attempts while the token still exists, then the device-only clear.
  expect(state.signOutScopes).toEqual(['local', 'local', 'local', 'local'])
})

test('sign out of all devices ends every session on the server first', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out of all devices', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(state.signOutScopes[0]).toBe('global')
  expect(state.unhandled).toEqual([])
})

for (const sameAccount of [true, false]) {
  test(`expired session ${sameAccount ? 'resumes same-account intent' : 'discards intent for another account'}`, async ({ page }) => {
    const state = await syntheticBackend(page)
    await page.clock.install()
    await syntheticSignIn(page)
    await page.getByRole('textbox', { name: 'Test title', exact: true }).fill('Private unsaved teacher intent')
    await page.getByRole('spinbutton', { name: /Short answer 2 available/ }).fill('2')
    await page.getByRole('button', { name: 'Preview questions', exact: true }).click()
    state.expireRefresh = true
    await page.clock.fastForward(3 * 60 * 60 * 1000)
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeFocused()
    await expect(page.getByRole('heading', { name: 'New paper', exact: true })).toBeHidden()
    await expect(page.getByRole('alert')).toContainText('same account')
    state.expireRefresh = false
    if (!sameAccount) state.currentUser = { ...state.currentUser, id: '10000000-0000-4000-8000-000000000002', email: 'other@example.invalid' }
    await syntheticSignIn(page, false, state.currentUser.email)
    const title = page.getByRole('textbox', { name: 'Test title', exact: true })
    if (sameAccount) {
      await expect(title).toHaveValue('Private unsaved teacher intent')
      await expect(page.getByRole('region', { name: 'Review the paper' })).toContainText('Synthetic question')
    } else {
      await expect(title).not.toHaveValue('Private unsaved teacher intent')
      await expect(page.getByRole('region', { name: 'Review the paper' })).toBeHidden()
    }
  })
}

test('grouped preset finalization survives a lost response, keeps source order and seals one paired snapshot', async ({ page }) => {
  const state = await syntheticBackend(page)
  await syntheticSignIn(page)
  await page.getByRole('button', { name: 'Use a preset exam paper made by MineGO', exact: true }).click()
  const exercise = page.getByRole('region', { name: 'Complete preset exercise' })
  await expect(exercise.getByRole('group', { name: 'Published exercise' }).getByRole('radio', { checked: true })).toHaveCount(1)
  await expect(page.getByRole('alert').filter({ hasText: 'Coverage overview unavailable' })).toBeVisible()
  await exercise.getByRole('textbox', { name: 'Exercise test title', exact: true }).fill('Synthetic grouped paper')
  await exercise.getByRole('spinbutton', { name: 'Marks per attempted point' }).fill('3')
  await expect(exercise).toContainText('Students answer 2 of 3 · 6 marks.')
  await checkAccessibility(page)
  state.dropGroupFinalizeResponse = true
  await exercise.getByRole('button', { name: 'Finalize complete preset exercise', exact: true }).click()
  await expect(exercise.getByRole('alert')).toBeVisible()
  await expect(exercise.getByRole('heading', { name: 'Synthetic grouped paper' })).toBeHidden()
  // The commit happened server-side; retrying the unchanged request must return that same paper.
  await exercise.getByRole('button', { name: 'Finalize complete preset exercise', exact: true }).click()
  await expect(exercise.getByText('Students answer 2 of 3 · 6 marks.')).toBeVisible()
  expect(state.groupFinalizeRequests).toHaveLength(2)
  expect(state.groupFinalizeRequests[0]).toEqual(state.groupFinalizeRequests[1])
  expect(state.groupPapers.size).toBe(1)
  await expect(exercise.getByRole('list').last().getByRole('button')).toHaveCount(1)
  await expect(exercise.getByRole('textbox', { name: 'Exercise test title', exact: true })).toBeDisabled()
  await exercise.getByRole('button', { name: 'Reload complete presets', exact: true }).click()
  await exercise.getByRole('button', { name: /^Synthetic grouped paper — 6 marks/ }).click()
  await exercise.getByRole('button', { name: 'Prepare captured exercise documents', exact: true }).click()
  // The captured files are shown before download, from the same bytes.
  await expect(exercise.getByRole('region', { name: 'Check the Word files' })).toBeVisible()
  await expect.poll(() => exercise.locator('.word-preview-host').evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain(presetGroup.members[0].question.prompt)
  const files: Buffer[] = []
  for (const name of ['Download exercise student paper', 'Download exercise answer key']) {
    const pending = page.waitForEvent('download')
    await exercise.getByRole('button', { name, exact: true }).click()
    files.push(await readFile((await (await pending).path())!))
  }
  const [studentXml, keyXml] = await Promise.all(files.map(async file => (await JSZip.loadAsync(file)).file('word/document.xml')!.async('string')))
  const text = (xml: string) => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const inOrder = (body: string, values: string[]) => {
    const positions = values.map(value => body.indexOf(value))
    expect(positions.every(index => index >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  }
  // The student paper keeps prompts in source order; the key keeps the attempt rule and answers in that order.
  inOrder(text(studentXml), presetGroup.members.map(m => m.question.prompt))
  inOrder(text(keyXml), ['Answer 2 of 3', 'Choice two', 'False', 'KEY_ONLY_GROUP'])
  expect(studentXml).not.toContain('KEY_ONLY_GROUP')
  expect(keyXml).toContain('KEY_ONLY_GROUP')
  await expect(page.locator('body')).not.toContainText('synthetic-private-coverage-detail')
  expect(state.unhandled).toEqual([])
})
