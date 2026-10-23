import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import {
  buildSecurityHeaders,
  formatPagesHeadersFile,
} from './src/lib/securityHeaders.ts'

/**
 * Emits the Cloudflare Pages `_headers` file and applies the same headers to
 * `vite preview`. The dev server stays unrestricted because HMR needs inline scripts.
 */
function securityHeaders(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'examgo-security-headers',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: formatPagesHeadersFile(buildSecurityHeaders(supabaseUrl)),
      })
    },
    configurePreviewServer(server) {
      const headers = buildSecurityHeaders(supabaseUrl)
      server.middlewares.use((_request, response, next) => {
        for (const [name, value] of Object.entries(headers)) {
          response.setHeader(name, value)
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react(), securityHeaders(env.VITE_SUPABASE_URL)],
    optimizeDeps: { entries: ['index.html'] },
    build: {
      // font-src is 'self': an inlined data: font is refused, so fonts always ship as files.
      assetsInlineLimit: (file: string) => /\.(woff2?|ttf|otf)$/.test(file) ? false : undefined,
    },
    server: {
      // Generated documents and disposable database clusters are not application source.
      watch: { ignored: ['**/output/**', '**/*.local/**'] },
    },
  }
})
