#!/usr/bin/env node
/**
 * Manifest-level architectural boundary check.
 *
 * The ESLint preset `@fastehr/config/eslint/core-boundaries` blocks forbidden
 * *imports* inside `packages/core`. This script blocks forbidden *dependencies*
 * in the manifests, so a package cannot acquire Next.js or an ORM even via a
 * file that is never linted (config, script, generated code).
 *
 * Run: pnpm check:boundaries
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Patterns are matched against dependency names; `*` matches any suffix. */
const RULES = [
  {
    package: 'packages/core',
    reason:
      'core holds domain logic and use cases and must stay framework-free. ' +
      'Declare a port in core and implement it in packages/db.',
    forbidden: [
      'next',
      'next-*',
      '@next/*',
      'react',
      'react-dom',
      '@prisma/*',
      'prisma',
      'drizzle-orm',
      'drizzle-kit',
      'kysely',
      'typeorm',
      'sequelize',
      'mongoose',
      'pg',
      'pg-*',
      'postgres',
      'mysql2',
      'better-sqlite3',
      '@neondatabase/*',
      '@fastehr/db',
      '@fastehr/ui',
      '@fastehr/web',
    ],
  },
  {
    package: 'packages/contracts',
    reason: 'contracts carries shared schemas and types only.',
    forbidden: ['next', '@next/*', 'react', 'react-dom', '@prisma/*', 'drizzle-orm', '@fastehr/*'],
  },
]

/** Dependency fields that ship with the package or leak into its consumers. */
const CHECKED_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies']

function matches(name, pattern) {
  if (!pattern.includes('*')) return name === pattern
  const prefix = pattern.slice(0, pattern.indexOf('*'))
  return name.startsWith(prefix)
}

const violations = []

for (const rule of RULES) {
  const manifestPath = join(repoRoot, rule.package, 'package.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    console.error(`✗ cannot read ${relative(repoRoot, manifestPath)}: ${error.message}`)
    process.exitCode = 1
    continue
  }

  for (const field of CHECKED_FIELDS) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      const hit = rule.forbidden.find((pattern) => matches(name, pattern))
      if (hit) violations.push({ pkg: rule.package, field, name, pattern: hit, reason: rule.reason })
    }
  }
}

if (violations.length > 0) {
  console.error('✗ architectural boundary violations\n')
  for (const v of violations) {
    console.error(`  ${v.pkg} → ${v.field}."${v.name}"  (matches "${v.pattern}")`)
    console.error(`    ${v.reason}\n`)
  }
  process.exit(1)
}

console.log(`✓ boundaries clean (${RULES.map((r) => r.package).join(', ')})`)
