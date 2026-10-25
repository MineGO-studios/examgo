import { defineConfig, devices } from '@playwright/test'

const external = process.env.EXAMGO_E2E_BASE_URL
if (external) {
  const url = new URL(external)
  if (url.protocol !== 'https:' || !/^[a-f0-9]{8}\.examgo\.pages\.dev$/.test(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) {
    throw new Error('Browser checks require an exact ExamGO Pages preview URL; Production is excluded.')
  }
}

export default defineConfig({
  testDir: './e2e',
  projects: external ? [{ name: 'deployed-preview-synthetic', testMatch: '**/deployed.spec.ts' }] : [
    { name: 'production-build', testMatch: '**/local-*.spec.ts' },
    { name: 'development-phase14', testMatch: '**/development.spec.ts', use: { baseURL: 'http://127.0.0.1:4177' } },
  ],
  outputDir: 'output/playwright/results',
  reporter: [['list'], ['json', { outputFile: 'output/playwright/results.json' }]],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'], baseURL: external ?? 'http://127.0.0.1:4176',
    actionTimeout: 15_000, navigationTimeout: 30_000,
    // Authenticated traces/storage state can contain credentials and private data.
    trace: 'off', video: 'off', screenshot: 'off',
  },
  webServer: external ? undefined : [{
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176', reuseExistingServer: false, timeout: 120_000,
    env: { VITE_SUPABASE_URL: 'https://examgo-e2e.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-e2e-publishable-key' },
  }, {
    command: 'npm run dev -- --host 127.0.0.1 --port 4177 --strictPort',
    url: 'http://127.0.0.1:4177', reuseExistingServer: false, timeout: 120_000,
    env: { VITE_SUPABASE_URL: 'https://examgo-e2e.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-e2e-publishable-key' },
  }],
})
