import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HelpTip, HelpTipProvider } from './HelpTip'
import { Icon } from './icons'

it('names the help button by its topic and keeps the glyph hidden', () => {
  const html = renderToStaticMarkup(<HelpTipProvider><HelpTip topic="Filed">Kept exactly as downloaded.</HelpTip></HelpTipProvider>)
  expect(html).toContain('aria-label="More about Filed"')
  expect(html).toContain('class="help-tip"')
  expect(html).toContain('aria-hidden="true"')
  // Closed by default: the explanation is not in the page until opened.
  expect(html).not.toContain('Kept exactly as downloaded.')
})

it('renders vocabulary icons as hidden decoration', () => {
  const html = renderToStaticMarkup(<Icon name="download" />)
  expect(html).toContain('<svg')
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('class="eg-icon"')
})
