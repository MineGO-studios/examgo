import type { Page } from '@playwright/test'

/** Visible interface text with Latin words, excluding paper content, user data and brand names. */
export async function englishLeft(page: Page, root = 'main'): Promise<string[]> {
  return page.evaluate((rootSelector) => {
    const skip = (el: Element) => el.closest('bdi,[dir=ltr],[dir=auto],.ministry-sheet,input,select,script,style,.mini-sheet,[lang=en],.chip,.question-row-prompt,.qcard')
    const out = new Set<string>()
    const walker = document.createTreeWalker(document.querySelector(rootSelector) ?? document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.replace(/EG-[0-9a-f-]+|MineGO Studio|MineGO|ExamGO|DOCX|CSV|JSON|Word|Q\d+/g, '').trim() ?? ''
      const el = node.parentElement
      if (!el || !/[A-Za-z]{3,}/.test(text) || skip(el)) continue
      out.add(text.slice(0, 80))
    }
    return [...out]
  }, root)
}

/** Page-level horizontal scroll, plus visible boxes that cross either edge of the viewport. */
export async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > width + 1) out.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px > ${width}px`)
    for (const el of document.body.querySelectorAll('*')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.position === 'fixed') continue
      // Visually hidden text and anything inside a clipping or scrolling box are not page overflow.
      if (el.closest('.visually-hidden')) continue
      let clipped = false
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') { clipped = true; break }
      }
      if (clipped) continue
      if (box.right > width + 1 || box.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(box.left)}–${Math.round(box.right)}`)
    }
    return out.slice(0, 10)
  })
}
