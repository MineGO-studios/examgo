import type { Page } from '@playwright/test'

/** Visible interface text with Latin words, excluding paper content, user data and brand names. */
export async function englishLeft(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const skip = (el: Element) => el.closest('bdi,[dir=ltr],[dir=auto],.ministry-sheet,input,select,script,style,.mini-sheet,[lang=en],.chip,.question-row-prompt,.qcard')
    const out = new Set<string>()
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.replace(/MineGO|ExamGO|DOCX|CSV|JSON|Word|Q\d+/g, '').trim() ?? ''
      const el = node.parentElement
      if (!el || !/[A-Za-z]{3,}/.test(text) || skip(el)) continue
      out.add(text.slice(0, 80))
    }
    return [...out]
  })
}
