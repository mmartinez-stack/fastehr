import { defineConfig } from 'vitest/config'

/**
 * Unit tests: no database, no environment, runs anywhere — the property CI's
 * verify job depends on. Integration tests are excluded by filename and run
 * from vitest.integration.config.ts under `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    env: {
      // Pinned west of UTC for the same reason as packages/db (ADR 18).
      TZ: 'America/Los_Angeles',
    },
  },
})
