import { describe, expect, it } from 'vitest'
import {
  buildSecurityHeaders,
  formatPagesHeadersFile,
  getSupabaseOrigin,
} from './securityHeaders'

const PROJECT_URL = 'https://example-project.supabase.co'

function directives(policy: string): Map<string, string[]> {
  return new Map(policy.split(';').map((part) => {
    const [name, ...values] = part.trim().split(/\s+/)
    return [name, values]
  }))
}

describe('security headers', () => {
  it('allows only the configured Supabase origin beyond self', () => {
    const policy = directives(buildSecurityHeaders(`${PROJECT_URL}/rest/v1/`)['Content-Security-Policy'])

    expect(policy.get('connect-src')).toEqual(["'self'", PROJECT_URL])
    expect(policy.get('script-src')).toEqual(["'self'"])
    expect(policy.get('style-src')).toEqual(["'self'"])
    expect(policy.get('object-src')).toEqual(["'none'"])
    expect(policy.get('frame-ancestors')).toEqual(["'none'"])
    expect(policy.get('base-uri')).toEqual(["'self'"])
    for (const values of policy.values()) {
      expect(values).not.toContain("'unsafe-inline'")
      expect(values).not.toContain("'unsafe-eval'")
      expect(values).not.toContain('*')
    }
  })

  it('denies framing and content sniffing', () => {
    const headers = buildSecurityHeaders(PROJECT_URL)

    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toContain('camera=()')
  })

  it('rejects missing, insecure or credentialed project URLs', () => {
    expect(() => getSupabaseOrigin(undefined)).toThrow(/required/)
    expect(() => getSupabaseOrigin('')).toThrow(/required/)
    expect(() => getSupabaseOrigin('not a url')).toThrow(/absolute/)
    expect(() => getSupabaseOrigin('http://example-project.supabase.co')).toThrow(/https/)
    expect(() => getSupabaseOrigin('https://user:pass@example-project.supabase.co')).toThrow(/credentials/)
  })

  it('formats a Pages _headers file for every path', () => {
    const file = formatPagesHeadersFile(buildSecurityHeaders(PROJECT_URL))
    const lines = file.trimEnd().split('\n')

    expect(lines[0]).toBe('/*')
    expect(lines.slice(1).every((line) => /^ {2}[A-Za-z-]+: \S/.test(line))).toBe(true)
    expect(file).toContain(`connect-src 'self' ${PROJECT_URL};`)
    expect(file.endsWith('\n')).toBe(true)
  })

  it('refuses multi-line header values', () => {
    expect(() => formatPagesHeadersFile({ 'X-Test': 'a\nb' })).toThrow(/single line/)
  })
})
