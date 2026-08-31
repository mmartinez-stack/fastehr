/**
 * One-time migration: legacy Mongo `users` → Postgres `users`, credentials
 * included.
 *
 * **Input is an NDJSON export, never a Mongo connection.**
 * `docs/legacy-data-mapping.md` rules that no MongoDB driver or extraction
 * code enters this repository; the export command below runs against the
 * container, outside the repo:
 *
 *   docker exec mongo mongoexport --quiet -u admin -p secret \
 *     --authenticationDatabase admin -d fastehr -c users \
 *     --fields _id,email,firstName,lastName,name,group,isActive,hash,salt > users.ndjson
 *
 * **Credentials migrate with the user** (ADR 26, superseding the earlier
 * Option B-only position): a record's PBKDF2 `hash`/`salt` are stored — never
 * re-derived, never logged — as a `legacy-pbkdf2-sha1$…` string in the
 * credential account row, which the auth server recognises, verifies against,
 * and upgrades to scrypt on the user's first successful sign-in. Staff keep
 * the password they already have. A record exported without usable
 * hash/salt migrates credential-less, and issue-temp-password.ts remains the
 * path for those. An account whose stored password is *not* in the legacy
 * format is never touched — that user changed their password here, and a
 * re-run must not undo it.
 *
 * Old records predate the firstName/lastName split and carry a single `name`
 * field — the export includes all three, and firstName/lastName win when
 * present.
 *
 * Dry-run by default; nothing is written without --apply. Writes are a single
 * transaction — a half-migrated user table cannot happen.
 *
 * Idempotent: upserts are keyed on `legacyId` (the Mongo `_id`), so a second
 * run changes nothing. The report proves it: run twice, diff the counts.
 *
 * The role mapping is a reviewed literal (auth-foundation decision §11.4/5).
 * An unmapped value is a hard failure for that record — reported, skipped,
 * and never defaulted.
 *
 * Inactive accounts migrate too — 38,047 visit signatures point at user ids,
 * so the row must exist for later collection migrations — but they arrive
 * with `isActive: false`: session resolution refuses them, and
 * issue-temp-password.ts refuses to issue for them without an explicit
 * override. A deleted legacy user never silently becomes a live login.
 *
 * Usage (from packages/db):
 *   pnpm migrate-users -- --input /path/to/users.ndjson                # dry run
 *   pnpm migrate-users -- --input /path/to/users.ndjson --apply
 *   pnpm migrate-users -- --input ... --report /path/to/report.json
 *
 * The report (JSON, default `<input>.report.json`) is the PR review
 * artifact: totals, per-role counts, and every skip with its reason. It
 * contains staff emails — not PHI, not credentials — and no password
 * material, which the input never held to begin with.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { isLegacyCredential, serializeLegacyCredential } from '@fastehr/contracts'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const { getPrismaClient } = await import('../src/client.ts')

const CREDENTIAL_PROVIDER = 'credential'
const CREDENTIAL_ISSUER = 'local:credential' // what better-auth@1.7.1 writes for password accounts

/**
 * Legacy `group` → staff role. Hand-written from the Phase 0 discovery
 * counts (admin 10, doc 16, clerk 4, csr 1) and signed off 2026-08-21:
 * `clerk` and `csr` are both front-desk work; splitting them later is a
 * schema migration, deliberately not taken now.
 */
const ROLE_MAP: Readonly<Record<string, 'admin' | 'provider' | 'frontdesk'>> = {
  admin: 'admin',
  doc: 'provider',
  clerk: 'frontdesk',
  csr: 'frontdesk',
}

interface LegacyUser {
  legacyId: string
  email: string
  name: string
  group: string
  isActive: boolean
  createdAt: Date
  /** `legacy-pbkdf2-sha1$…` (ADR 26), or null when the export held no usable hash/salt. */
  credential: string | null
}

interface Skip {
  legacyId: string
  email: string | null
  reason: string
}

function parseArgs(argv: readonly string[]): { input: string; apply: boolean; report: string } {
  let input: string | undefined
  let report: string | undefined
  let apply = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue
    else if (arg === '--input') { input = argv[i + 1]; i += 1 }
    else if (arg === '--report') { report = argv[i + 1]; i += 1 }
    else if (arg === '--apply') apply = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (input === undefined) throw new Error('--input <users.ndjson> is required')
  return { input, apply, report: report ?? `${input}.report.json` }
}

/** Mongo ObjectIds carry their creation time in the first four bytes. */
function objectIdTimestamp(oid: string): Date {
  return new Date(parseInt(oid.slice(0, 8), 16) * 1000)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** mongoexport writes `_id` as `{"$oid": "..."}` (canonical Extended JSON). */
function parseObjectId(value: unknown): string | null {
  if (typeof value === 'string' && /^[0-9a-f]{24}$/.test(value)) return value
  if (typeof value === 'object' && value !== null && '$oid' in value) {
    return asString((value as { $oid: unknown }).$oid)
  }
  return null
}

const { input, apply, report: reportPath } = parseArgs(process.argv.slice(2))

const lines = readFileSync(input, 'utf8').split('\n').filter((line) => line.trim() !== '')

const parsed: LegacyUser[] = []
const skips: Skip[] = []
/** Credential-only findings — the user row still migrates. Never hash material. */
const credentialNotes: Array<{ legacyId: string; email: string; note: string }> = []

for (const [index, line] of lines.entries()) {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(line) as Record<string, unknown>
  } catch {
    skips.push({ legacyId: `line ${index + 1}`, email: null, reason: 'unparseable JSON line' })
    continue
  }

  const legacyId = parseObjectId(raw._id)
  if (legacyId === null) {
    skips.push({ legacyId: `line ${index + 1}`, email: asString(raw.email), reason: 'missing or malformed _id' })
    continue
  }

  const email = asString(raw.email)?.trim().toLowerCase() ?? null
  if (email === null || email === '') {
    skips.push({ legacyId, email: null, reason: 'missing email' })
    continue
  }

  const group = asString(raw.group)
  const role = group === null ? undefined : ROLE_MAP[group]
  if (role === undefined) {
    skips.push({ legacyId, email, reason: `unmapped legacy role ${JSON.stringify(group)} — refusing to default` })
    continue
  }

  // Old records predate the firstName/lastName split and carry `name` alone;
  // where both shapes exist, the split fields win.
  const splitName = [asString(raw.firstName)?.trim() ?? '', asString(raw.lastName)?.trim() ?? '']
    .filter((part) => part !== '')
    .join(' ')
  const name = splitName !== '' ? splitName : (asString(raw.name)?.trim() ?? '')

  // The legacy hash/salt, carried verbatim into the ADR 26 storage format.
  // Anything malformed (missing, truncated, non-hex) migrates credential-less
  // and is noted — the account still exists, and issue-temp-password.ts covers it.
  let credential: string | null = null
  const salt = asString(raw.salt)
  const hash = asString(raw.hash)
  if (salt !== null && hash !== null) {
    try {
      credential = serializeLegacyCredential({ iterations: 1000, salt, hash })
    } catch {
      credentialNotes.push({ legacyId, email, note: 'hash/salt present but not valid hex — migrated without credential' })
    }
  } else if (salt !== null || hash !== null) {
    credentialNotes.push({ legacyId, email, note: 'only one of hash/salt present — migrated without credential' })
  }

  parsed.push({
    legacyId,
    email,
    name,
    group,
    // Records that predate the `isActive` field hydrate to the schema default
    // (true) in the legacy app, so only an explicit false deactivates here.
    isActive: raw.isActive !== false,
    createdAt: objectIdTimestamp(legacyId),
    credential,
  })
}

// Collision detection happens before any write — the unique constraint is the
// backstop, never the decision-maker.
const byEmail = new Map<string, LegacyUser[]>()
for (const user of parsed) {
  byEmail.set(user.email, [...(byEmail.get(user.email) ?? []), user])
}
const collisions = [...byEmail.entries()].filter(([, users]) => users.length > 1)
for (const [email, users] of collisions) {
  for (const user of users) {
    skips.push({ legacyId: user.legacyId, email, reason: 'email collides with another legacy record after normalization' })
  }
}
const migratable = parsed.filter((user) => (byEmail.get(user.email) ?? []).length === 1)

const prisma = getPrismaClient()

// A user that already exists under this email but a *different* (or no)
// legacyId was not created by this migration — refuse rather than adopt it.
const existingConflicts: Skip[] = []
const toWrite: LegacyUser[] = []
for (const user of migratable) {
  const existing = await prisma.user.findUnique({ where: { email: user.email } })
  if (existing !== null && existing.legacyId !== user.legacyId) {
    existingConflicts.push({
      legacyId: user.legacyId,
      email: user.email,
      reason: `email already belongs to user ${existing.id} with legacyId ${existing.legacyId ?? 'null'}`,
    })
    continue
  }
  toWrite.push(user)
}
skips.push(...existingConflicts)

let written = 0
let credentialsWritten = 0
let credentialsPreserved = 0
if (apply) {
  await prisma.$transaction(async (tx) => {
    for (const user of toWrite) {
      const row = await tx.user.upsert({
        where: { legacyId: user.legacyId },
        create: {
          id: randomUUID(),
          legacyId: user.legacyId,
          legacyRoleRaw: user.group,
          email: user.email,
          name: user.name,
          role: ROLE_MAP[user.group],
          isActive: user.isActive,
          emailVerified: false,
          createdAt: user.createdAt,
          updatedAt: new Date(),
        },
        // Re-running refreshes the fields this migration owns and touches
        // nothing else — never a changed password, never mustChangePassword.
        update: {
          legacyRoleRaw: user.group,
          email: user.email,
          name: user.name,
          role: ROLE_MAP[user.group],
          isActive: user.isActive,
        },
      })
      written += 1

      if (user.credential === null) continue

      const existing = await tx.account.findFirst({
        where: { userId: row.id, providerId: CREDENTIAL_PROVIDER },
      })

      if (existing === null) {
        await tx.account.create({
          data: {
            id: randomUUID(),
            userId: row.id,
            // Better Auth's credential accounts carry accountId = userId.
            accountId: row.id,
            providerId: CREDENTIAL_PROVIDER,
            issuer: CREDENTIAL_ISSUER,
            password: user.credential,
            createdAt: user.createdAt,
            updatedAt: new Date(),
          },
        })
        credentialsWritten += 1
      } else if (existing.password !== null && !isLegacyCredential(existing.password)) {
        // A scrypt hash means the user set a password *here* — a temp
        // credential or a completed password change. A re-run never reverts
        // that to the legacy one.
        credentialsPreserved += 1
      } else {
        await tx.account.update({
          where: { id: existing.id },
          data: { password: user.credential, updatedAt: new Date() },
        })
        credentialsWritten += 1
      }
    }
  })
}

const roleCounts = await prisma.user.groupBy({ by: ['role'], _count: { _all: true }, where: { legacyId: { not: null } } })

const report = {
  ranAt: new Date().toISOString(),
  input,
  mode: apply ? 'apply' : 'dry-run',
  totalRead: lines.length,
  parsed: parsed.length,
  eligible: toWrite.length,
  written,
  // Counts and reasons only — the report never carries hash or salt material.
  credentialsInInput: parsed.filter((user) => user.credential !== null).length,
  credentialsWritten,
  credentialsPreserved,
  credentialNotes,
  skipped: skips,
  emailCollisions: collisions.map(([email]) => email),
  migratedRoleCountsInDatabase: Object.fromEntries(
    roleCounts.map((row) => [row.role, row._count._all]),
  ),
}

writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')

console.log(`${apply ? 'APPLY' : 'DRY RUN'}: read ${lines.length}, eligible ${toWrite.length}, written ${written}, credentials written ${credentialsWritten} (preserved ${credentialsPreserved}), skipped ${skips.length}`)
console.log(`report: ${reportPath}`)
if (skips.length > 0) console.log('skips are listed in the report with reasons.')

await prisma.$disconnect()
