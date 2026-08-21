import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Brings the scratch database up to the committed migrations before any test
 * runs. Same shape as packages/db/test/global-setup.ts — the migrations and
 * the Prisma CLI live there, so that is where the command runs.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../../../packages/db/', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}
