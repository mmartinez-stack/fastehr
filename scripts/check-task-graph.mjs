#!/usr/bin/env node
/**
 * Guards the transitive `generate` chain.
 *
 * `apps/web` type-checks `@fastehr/db`'s raw source (decision 1, JIT), so the
 * Prisma client must exist before `web#typecheck` runs. That ordering is
 * supplied by `generate` declaring `dependsOn: ["^generate"]` in turbo.json,
 * which propagates the edge through intermediate packages as no-op `generate`
 * nodes.
 *
 * The failure mode this guards is nasty: prune those nodes — or drop the
 * topological dependsOn as "unused config" — and nothing breaks locally,
 * because a warm cache already has `src/generated/`. It only resurfaces on a
 * cold build (CI, a fresh clone) as
 * `TS2307: Cannot find module './generated/client/index.js'`.
 *
 * Run: pnpm check:graph
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const TARGET_PACKAGE = '@fastehr/web'
const REQUIRED_TASK = '@fastehr/db#generate'

/*
 * Assertion 2 exists because assertion 1 alone stopped being sufficient when
 * `packages/api` was folded into the app. `apps/web` now depends on
 * `@fastehr/db` directly, so `^generate` on `typecheck` supplies the ordering
 * on its own and assertion 1 passes whether or not the topological dependsOn
 * is present. The transitive fix is currently latent insurance — it matters
 * again the moment any package sits between the app and `db` (for instance if
 * `src/server` is extracted to its own package). Asserting the declaration
 * itself is what catches someone removing it as dead config in the meantime.
 */
function assertTransitiveGenerateDeclared() {
  const turbo = JSON.parse(readFileSync(new URL('../turbo.json', import.meta.url), 'utf8'))
  const dependsOn = turbo.tasks?.generate?.dependsOn ?? []
  if (!dependsOn.includes('^generate')) {
    console.error('✗ turbo.json: tasks.generate is missing `dependsOn: ["^generate"]`')
    console.error('')
    console.error('  This looks like dead config while the app depends on @fastehr/db')
    console.error('  directly, but it is what propagates prisma generate through any')
    console.error('  intermediate package. Without it, inserting a package between the')
    console.error('  app and db reintroduces a race that only fails on a cold cache.')
    process.exit(1)
  }
  console.log('✓ turbo.json declares generate.dependsOn = ["^generate"]')
}

let raw
try {
  raw = execFileSync(
    'pnpm',
    ['turbo', 'run', 'typecheck', '--dry-run=json', `--filter=${TARGET_PACKAGE}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
} catch (error) {
  console.error('✗ could not run turbo to resolve the task graph')
  console.error(error.stderr || error.message)
  process.exit(1)
}

// turbo prints its banner before the JSON payload.
const start = raw.indexOf('{')
if (start === -1) {
  console.error('✗ turbo produced no JSON payload')
  process.exit(1)
}

let plan
try {
  plan = JSON.parse(raw.slice(start))
} catch (error) {
  console.error(`✗ could not parse turbo dry-run JSON: ${error.message}`)
  process.exit(1)
}

const tasks = plan.tasks ?? []
const typecheckTask = tasks.find((t) => t.taskId === `${TARGET_PACKAGE}#typecheck`)
const resolvedDeps = typecheckTask?.dependencies ?? []
const requiredTask = tasks.find((t) => t.taskId === REQUIRED_TASK)

/*
 * Presence of the task id is not enough. Turbo materialises a node for every
 * package in the topological closure, whether or not that package actually has
 * the script — those placeholders carry `command: "<NONEXISTENT>"`, and they are
 * the "no-op generate nodes" that propagate the chain. Deleting `db`'s generate
 * script would leave the id in the graph while removing the work, so assert on
 * the command.
 */
const NO_COMMAND = '<NONEXISTENT>'

if (!requiredTask || requiredTask.command === NO_COMMAND) {
  console.error(
    requiredTask
      ? `✗ ${REQUIRED_TASK} exists in the graph but has no command (${NO_COMMAND})`
      : `✗ ${REQUIRED_TASK} is missing from the resolved task graph for ${TARGET_PACKAGE}`,
  )
  console.error('')
  console.error('  packages/db must define a `generate` script that runs prisma generate.')
  console.error('  Without it nothing produces src/generated/, and a JIT consumer that')
  console.error("  compiles db's source fails on a cold cache with TS2307.")
  process.exit(1)
}

if (!resolvedDeps.includes(REQUIRED_TASK)) {
  console.error(`✗ ${REQUIRED_TASK} is not ordered before ${TARGET_PACKAGE}#typecheck`)
  console.error('')
  console.error(`  ${TARGET_PACKAGE}#typecheck depends on:`)
  for (const dep of resolvedDeps) console.error(`    - ${dep}`)
  console.error('')
  console.error('  Without that edge, typecheck races prisma generate and fails on a cold')
  console.error('  cache. Check that turbo.json still has `generate.dependsOn: ["^generate"]`')
  console.error('  and that packages between the app and @fastehr/db still carry the task.')
  process.exit(1)
}

console.log(`✓ ${REQUIRED_TASK} runs \`${requiredTask.command}\` and is ordered before`)
console.log(`  ${TARGET_PACKAGE}#typecheck`)

assertTransitiveGenerateDeclared()
