/**
 * Response headers for the built site (Phase 15A).
 *
 * The Cloudflare Pages `_headers` file and the local `vite preview` server use
 * this one policy. Its only external origin is the Supabase project the build
 * is configured for, so the public repository never hard-codes a project.
 */

export type SecurityHeaders = Readonly<Record<string, string>>

/** Return the HTTPS origin of a Supabase project URL or throw. */
export function getSupabaseOrigin(supabaseUrl: string | undefined): string {
  if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL is required to build the security headers.')
  }
  let url: URL
  try {
    url = new URL(supabaseUrl)
  } catch {
    throw new Error('VITE_SUPABASE_URL must be an absolute URL.')
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('VITE_SUPABASE_URL must be an https URL without credentials.')
  }
  return url.origin
}

export function buildContentSecurityPolicy(supabaseOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React sets `style` properties through the CSSOM, which CSP does not block.
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
  ].join('; ')
}

export function buildSecurityHeaders(supabaseUrl: string | undefined): SecurityHeaders {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(getSupabaseOrigin(supabaseUrl)),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }
}

/** Format headers as a Cloudflare Pages `_headers` file applying to every path. */
export function formatPagesHeadersFile(headers: SecurityHeaders): string {
  const lines = Object.entries(headers).map(([name, value]) => {
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
      throw new Error(`Header ${name} must be a single line.`)
    }
    return `  ${name}: ${value}`
  })
  return ['/*', ...lines, ''].join('\n')
}
