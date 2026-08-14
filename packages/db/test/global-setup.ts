import { execFileSync } from 'node:child_process'

/**
 * Brings the scratch database up to the committed migrations before any test
 * runs.
 *
 * `migrate deploy`, never `db push`: applying the same migrations a deployment
 * applies is what makes these tests evidence that the migrations work, rather
 * than evidence that the schema file parses. A migration that is committed but
 * broken should fail here, loudly, and not at the point someone runs it against
 * a real environment.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}
