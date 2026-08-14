#!/usr/bin/env node
/**
 * Serves the built app and asserts that /_smoke reports every seam healthy.
 *
 * Why this exists: /_smoke used to be statically prerendered, so `next build`
 * rendered it and a broken import or path alias failed the build. Calling a
 * tRPC procedure from it made the route dynamic (it reads headers), so the
 * build no longer renders it — and the guarantee the route was written to
 * provide would have quietly lapsed. This restores it one level out.
 *
 * What it actually proves, which a typecheck cannot:
 *   - the RSC caller runs the router in-process through the middleware chain
 *   - the prefetch → dehydrate → hydrate path works, because the Client
 *     Component renders its data in the *server-rendered* HTML rather than
 *     fetching after hydration
 *   - the superjson transformer matches on both sides, which otherwise fails
 *     only at runtime
 *
 * Run: pnpm smoke   (requires a prior `turbo run build`)
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = process.env.SMOKE_PORT ?? '3999'
const SMOKE_URL = `http://127.0.0.1:${PORT}/_smoke`

/** Every badge that must appear in the server-rendered HTML. */
const EXPECTED = [
  'component imported', // @/components/ui path alias + shadcn
  'schema valid', // @fastehr/contracts across the package boundary
  'in-process: ok', // RSC caller through the middleware chain
  'hydrated: ok', // prefetch survived dehydrate/hydrate into the client
]

const server = spawn('pnpm', ['exec', 'next', 'start', '-p', PORT], {
  cwd: new URL('../apps/web/', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
server.stdout.on('data', (chunk) => (serverOutput += chunk))
server.stderr.on('data', (chunk) => (serverOutput += chunk))

function shutdown() {
  server.kill('SIGTERM')
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`server exited early:\n${serverOutput}`)
    try {
      const response = await fetch(SMOKE_URL)
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await sleep(500)
  }
  throw new Error(`server did not answer ${SMOKE_URL} in 30s:\n${serverOutput}`)
}

try {
  await waitForServer()

  const html = await (await fetch(SMOKE_URL)).text()
  const missing = EXPECTED.filter((badge) => !html.includes(badge))

  if (missing.length > 0) {
    console.error('✗ /_smoke did not report every seam healthy')
    console.error('')
    for (const badge of missing) console.error(`  missing: ${badge}`)
    console.error('')
    console.error('  "hydrated: ok" missing but "in-process: ok" present means the')
    console.error('  server call worked and the prefetch did not reach the browser —')
    console.error('  check the transformer on the link against src/server/trpc.ts, and')
    console.error('  the dehydrate/hydrate serialisers in src/trpc/query-client.ts.')
    process.exitCode = 1
  } else {
    for (const badge of EXPECTED) console.log(`✓ ${badge}`)
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  shutdown()
}
