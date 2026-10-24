import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorSummary } from './ErrorSummary'

it('renders nothing without problems', () => {
  expect(renderToStaticMarkup(<ErrorSummary items={[]} attempt={1} />)).toBe('')
})

it('announces one summary that links to each field', () => {
  const html = renderToStaticMarkup(<ErrorSummary attempt={1} items={[{ target: 'exam-title', message: 'Test title is required.' }]} />)
  expect(html).toContain('role="alert"')
  expect(html).toContain('href="#exam-title"')
  expect(html).toContain('Test title is required.')
  expect(html).toContain('There is a problem')
})
