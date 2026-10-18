import { expect, type Page } from '@playwright/test'
import axe from 'axe-core'

declare global { interface Window { axe: typeof axe } }

export async function checkAccessibility(page: Page) {
  // Same-origin external script preserves the production CSP during inspection.
  await page.route('**/e2e-axe.js', route => route.fulfill({ contentType: 'text/javascript', body: axe.source }))
  await page.addScriptTag({ url: '/e2e-axe.js' })
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })))
  expect(violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}
