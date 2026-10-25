import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig({ command: 'serve', mode: 'test' }), defineConfig({
  test: {
    // Recovery checkouts and generated artifacts are not current application tests.
    include: ['src/**/*.test.{ts,tsx}'],
  },
}))
