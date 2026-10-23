/** The page frame inside the shadow root: no grey desk, and pages scaled to the panel width. */
const PAGE_FRAME_CSS = `
  .word-wrapper { background: transparent; padding: 0; zoom: var(--word-zoom, 1); }
  .word-wrapper > section.word { margin: 0 auto 16px; box-shadow: 0 1px 2px rgb(17 12 8 / 25%), 0 8px 24px rgb(17 12 8 / 12%); }
`

/**
 * Renders a generated Word file in the page (D8.8, MIN-294), from the same bytes the teacher downloads.
 *
 * The renderer writes `<style>` elements and `style` attributes, which the Content Security Policy
 * (`style-src 'self'`) refuses. So it renders into containers that are never attached to the page, and the
 * result is moved into a shadow root with its CSS applied through the CSSOM (a constructed stylesheet and
 * `element.style`), which the policy does not govern. The shadow root also keeps the Word styles from
 * reaching the rest of the interface. Nothing is stored: the preview lives only in this element.
 */
export async function renderWordPreview(file: Blob, host: HTMLElement): Promise<void> {
  const { renderAsync } = await import('docx-preview')
  const body = document.createElement('div'), styles = document.createElement('div')
  await renderAsync(file, body, styles, {
    className: 'word',
    inWrapper: true,
    ignoreFonts: true, // embedded fonts would arrive as data: URLs, which font-src refuses
    ignoreLastRenderedPageBreak: true,
    renderHeaders: true,
    renderFooters: true,
    experimental: false,
  })
  const css = [...styles.querySelectorAll('style'), ...body.querySelectorAll('style')].map((element) => element.textContent ?? '').join('\n')
  for (const element of body.querySelectorAll('style')) element.remove()
  // Re-apply each inline declaration through the CSSOM, then drop the refused attribute.
  for (const element of body.querySelectorAll<HTMLElement>('[style]')) {
    const declarations = element.getAttribute('style') ?? ''
    element.removeAttribute('style')
    element.style.cssText = declarations
  }
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  const frame = new CSSStyleSheet()
  frame.replaceSync(PAGE_FRAME_CSS)
  root.adoptedStyleSheets = [sheet, frame]
  root.replaceChildren(...body.childNodes)
}
