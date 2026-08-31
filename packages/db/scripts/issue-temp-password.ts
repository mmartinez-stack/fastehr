/**
 * Admin credential issuance — the Option B path (auth-foundation decision
 * §11.1/§11.3: no mail transport exists, so credentials are handed out
 * out-of-band by an admin).
 *
 * For each named user this script:
 *   1. generates a temporary password with a CSPRNG,
 *   2. hashes it with Better Auth's own scrypt (`better-auth/crypto`), so the
 *      stored credential is indistinguishable from one Better Auth created,
 *   3. upserts the `credential` account row, and
 *   4. sets `mustChangePassword`, which every guard enforces until the user
 *      proves a password of their own choosing at /change-password.
 *
 * The temporary password is printed to **stdout only** — it exists to be read
 * once by the admin and spoken/handed to the staff member. It is never
 * written to a file and never logged.
 *
 * Usage (from packages/db):
 *   pnpm issue-temp-password -- --email person@example.com [--email ...]
 *   pnpm issue-temp-password -- --all-active
 *   pnpm issue-temp-password -- --email person@example.com --include-inactive
 *
 * Inactive accounts are refused without --include-inactive: a deactivated
 * user regaining a login should be a deliberate act, not a side effect of a
 * bulk handout.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { hashPassword } from 'better-auth/crypto'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const { getPrismaClient } = await import('../src/client.ts')

const CREDENTIAL_PROVIDER = 'credential'
const CREDENTIAL_ISSUER = 'local:credential' // what better-auth@1.7.1 writes for password accounts

/** Unambiguous alphabet (no 0/O, 1/l/I) — these get read aloud. */
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'

function generateTempPassword(length = 16): string {
  const bytes = randomBytes(length * 2)
  let out = ''
  for (let i = 0; out.length < length; i += 1) {
    const byte = bytes[i]
    if (byte === undefined) return generateTempPassword(length) // exhausted; retry
    if (byte < Math.floor(256 / ALPHABET.length) * ALPHABET.length) {
      out += ALPHABET[byte % ALPHABET.length]
    }
  }
  return out
}

function parseArgs(argv: readonly string[]): {
  emails: string[]
  allActive: boolean
  includeInactive: boolean
} {
  const emails: string[] = []
  let allActive = false
  let includeInactive = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue // pnpm forwards the separator itself
    if (arg === '--email') {
      const value = argv[i + 1]
      if (value === undefined) throw new Error('--email requires a value')
      emails.push(value.trim().toLowerCase())
      i += 1
    } else if (arg === '--all-active') {
      allActive = true
    } else if (arg === '--include-inactive') {
      includeInactive = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!allActive && emails.length === 0) {
    throw new Error('Nothing to do: pass --email <address> (repeatable) or --all-active')
  }
  if (allActive && emails.length > 0) {
    throw new Error('--all-active and --email are mutually exclusive')
  }

  return { emails, allActive, includeInactive }
}

const { emails, allActive, includeInactive } = parseArgs(process.argv.slice(2))
const prisma = getPrismaClient()

const users = allActive
  ? await prisma.user.findMany({
      where: { isActive: true, accounts: { none: { providerId: CREDENTIAL_PROVIDER } } },
      orderBy: { email: 'asc' },
    })
  : await prisma.user.findMany({ where: { email: { in: emails } } })

if (!allActive) {
  const found = new Set(users.map((user) => user.email))
  for (const email of emails) {
    if (!found.has(email)) {
      console.error(`refused: no user with email ${email}`)
      process.exitCode = 1
    }
  }
}

const issued: Array<{ email: string; password: string }> = []

for (const user of users) {
  if (!user.isActive && !includeInactive) {
    console.error(`refused: ${user.email} is deactivated (pass --include-inactive to override)`)
    process.exitCode = 1
    continue
  }

  const password = generateTempPassword()
  const hash = await hashPassword(password)
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    const existing = await tx.account.findFirst({
      where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
    })

    if (existing === null) {
      await tx.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          // Better Auth's credential accounts carry accountId = userId.
          accountId: user.id,
          providerId: CREDENTIAL_PROVIDER,
          issuer: CREDENTIAL_ISSUER,
          password: hash,
          createdAt: now,
          updatedAt: now,
        },
      })
    } else {
      await tx.account.update({ where: { id: existing.id }, data: { password: hash, updatedAt: now } })
    }

    await tx.user.update({ where: { id: user.id }, data: { mustChangePassword: true } })
    // A fresh credential invalidates whatever sessions the old one opened.
    await tx.session.deleteMany({ where: { userId: user.id } })
  })

  issued.push({ email: user.email, password })
}

if (issued.length > 0) {
  console.log('\nTemporary credentials — hand out out-of-band, then discard this output:\n')
  for (const { email, password } of issued) {
    console.log(`  ${email}  ${password}`)
  }
  console.log(`\n${issued.length} issued. Each account must change its password at first sign-in.`)
} else {
  console.log('Nothing issued.')
}

await prisma.$disconnect()
