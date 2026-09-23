/**
 * Partner API key issuance (ADR 36, ADR 38). The operator-only path: keys
 * are minted by Better Auth's api key plugin for an integration principal
 * (a `users` row with the `integration` role, created here on first use),
 * and the key is printed to **stdout once**, to be handed to the partner
 * out of band. It is never written to a file and never logged; the plugin
 * stores its hash, the scopes as permissions, and the clinic's settings as
 * metadata.
 *
 * Runs wherever the app's environment is: DATABASE_URL, BETTER_AUTH_SECRET,
 * and BETTER_AUTH_URL (the plugin lives on the auth instance). Locally:
 *
 *   node --env-file=.env apps/web/scripts/partner-api-keys.ts issue \
 *       --name "Voice assistant" --environment dev \
 *       --scopes patients:lookup,patients:verify,queue:read --issued-by you@clinic.example \
 *       [--email integrations@vendor.example] [--vendor "Acme"] [--expires-in-days 90] \
 *       [--allow-ip 203.0.113.5/32]... [--location sylmar]... [--baa-signed 2026-09-01]
 *
 * `--email` gives the principal a real address, so the partner's team can be
 * issued a temporary password (`pnpm --filter @fastehr/db issue-temp-password`)
 * and sign in to the integration page (ADR 36 as amended). Without it the
 * principal exists under a synthetic address nobody signs in with.
 *   node --env-file=.env apps/web/scripts/partner-api-keys.ts list
 *   node --env-file=.env apps/web/scripts/partner-api-keys.ts revoke --key-id <id>
 *   node --env-file=.env apps/web/scripts/partner-api-keys.ts rotate --key-id <id> [--issued-by you@clinic.example]
 *
 * A `live` key refuses to issue without `--baa-signed`: no business
 * associate agreement, no production PHI. Rotation mints a new key with the
 * old one's settings and gives the old key 24 hours to expire, so the
 * partner can cut over without an outage. Revocation is immediate.
 */
import {
  API_KEY_ROTATION_OVERLAP_HOURS,
  describeValidationFailure,
  issueIntegrationKeyInput,
  type ApiKeyMetadata,
  type IntegrationKey,
  type IssueIntegrationKeyInput,
} from '@fastehr/contracts'
import { db } from '@fastehr/db'
import { mintIntegrationKey } from '../src/server/integration-keys.ts'

const ROTATION_OVERLAP_MS = API_KEY_ROTATION_OVERLAP_HOURS * 60 * 60 * 1000

type Command = 'issue' | 'list' | 'revoke' | 'rotate'

interface Args {
  command: Command
  values: Map<string, string[]>
}

function parseArgs(argv: readonly string[]): Args {
  const [first, ...rest] = argv.filter((arg) => arg !== '--')
  if (first !== 'issue' && first !== 'list' && first !== 'revoke' && first !== 'rotate') {
    throw new Error('Usage: partner-api-keys <issue|list|revoke|rotate> [options]')
  }
  const values = new Map<string, string[]>()
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === undefined || !arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`)
    const value = rest[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    values.set(arg, [...(values.get(arg) ?? []), value])
    i += 1
  }
  return { command: first, values }
}

function one(args: Args, flag: string): string | undefined {
  const values = args.values.get(flag)
  if (values !== undefined && values.length > 1) throw new Error(`${flag} may be given once`)
  return values?.[0]
}

function issueInput(args: Args, previous?: IntegrationKey): IssueIntegrationKeyInput {
  const scopes = one(args, '--scopes')
  const days = one(args, '--expires-in-days')
  const defaults = previous?.metadata ?? undefined
  const parsed = issueIntegrationKeyInput.safeParse({
    name: one(args, '--name') ?? previous?.name,
    vendor: one(args, '--vendor') ?? defaults?.vendor ?? undefined,
    environment: one(args, '--environment') ?? defaults?.environment,
    scopes: scopes === undefined ? previous?.scopes : scopes.split(',').map((scope) => scope.trim()),
    allowedIps: args.values.get('--allow-ip') ?? defaults?.allowedIps ?? [],
    locationIds: args.values.get('--location') ?? defaults?.locationIds ?? [],
    expiresInDays: days === undefined ? undefined : Number(days),
    baaSignedAt: one(args, '--baa-signed') ?? defaults?.baaSignedAt ?? undefined,
    issuedBy: one(args, '--issued-by') ?? defaults?.issuedBy,
  })
  if (!parsed.success) {
    const failure = describeValidationFailure(parsed.error)
    const fields = Object.entries(failure?.fieldErrors ?? {}).map(([field, codes]) => `${field}: ${codes.join(', ')}`)
    if ((failure?.formErrors.length ?? 0) > 0) fields.push('a live key needs --baa-signed <YYYY-MM-DD>')
    throw new Error(`refused: ${fields.join('; ')}`)
  }
  return parsed.data
}

process.on('uncaughtException', (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

const args = parseArgs(process.argv.slice(2))
const now = new Date()

async function principalFor(
  input: IssueIntegrationKeyInput,
  existingId?: string,
): Promise<{ id: string; name: string; isActive: boolean }> {
  if (existingId !== undefined) {
    const found = await db.integrations.find(existingId)
    if (found === null) throw new Error(`no integration with id ${existingId}`)
    return found
  }
  const email = one(args, '--email')
  return db.integrations.findOrCreate(email === undefined ? { name: input.name } : { name: input.name, email })
}

async function issue(input: IssueIntegrationKeyInput, existingId?: string): Promise<{ key: IntegrationKey; secret: string }> {
  const integration = await principalFor(input, existingId)
  if (!integration.isActive) throw new Error(`integration "${integration.name}" is deactivated; enable it before issuing a key`)

  const metadata: ApiKeyMetadata = {
    environment: input.environment,
    vendor: input.vendor ?? null,
    allowedIps: input.allowedIps,
    locationIds: input.locationIds,
    baaSignedAt: input.baaSignedAt ?? null,
    issuedBy: input.issuedBy,
  }
  const created = await mintIntegrationKey({
    integrationId: integration.id,
    name: input.name,
    environment: input.environment,
    scopes: input.scopes,
    metadata,
    expiresInDays: input.expiresInDays,
  })
  const key = await db.integrations.findKey(created.id)
  if (key === null) throw new Error('the key was created but cannot be read back')
  return { key, secret: created.key }
}

function printIssued({ key, secret }: { key: IntegrationKey; secret: string }): void {
  console.log('\nPartner API key (shown once; hand it over out of band, then discard this output):\n')
  console.log(`  ${secret}\n`)
  console.log(`  key id       ${key.id}`)
  console.log(`  integration  ${key.name} (${key.metadata?.environment ?? '?'}, principal ${key.integrationId})`)
  console.log(`  scopes       ${key.scopes.join(', ')}`)
  console.log(`  expires      ${key.expiresAt ?? 'never'}`)
  if ((key.metadata?.allowedIps.length ?? 0) > 0) console.log(`  ips          ${key.metadata?.allowedIps.join(', ')}`)
  if ((key.metadata?.locationIds.length ?? 0) > 0) console.log(`  clinics      ${key.metadata?.locationIds.join(', ')}`)
}

async function findKey(keyId: string): Promise<IntegrationKey> {
  const key = await db.integrations.findKey(keyId)
  if (key === null) throw new Error(`no key with id ${keyId}`)
  return key
}

switch (args.command) {
  case 'issue': {
    printIssued(await issue(issueInput(args)))
    break
  }
  case 'list': {
    const integrations = await db.integrations.list()
    if (integrations.length === 0) {
      console.log('No integrations.')
      break
    }
    for (const integration of integrations) {
      console.log(
        `${integration.name}  ${integration.isActive ? 'active' : 'DEACTIVATED'}  login ${integration.hasCredential ? 'issued' : 'none'}  principal ${integration.id}`,
      )
      if (integration.keys.length === 0) console.log('  (no keys)')
      for (const key of integration.keys) {
        const state = !key.enabled ? 'revoked' : key.expiresAt !== null && new Date(key.expiresAt) <= now ? 'expired' : 'enabled'
        console.log(
          `  ${key.id}  ${(key.start ?? '').padEnd(14)}  ${state.padEnd(8)}  ${(key.metadata?.environment ?? '?').padEnd(4)}  expires ${key.expiresAt ?? 'never'}  last used ${key.lastUsedAt ?? 'never'}  ${key.scopes.join(',')}`,
        )
      }
    }
    break
  }
  case 'revoke': {
    const keyId = one(args, '--key-id')
    if (keyId === undefined) throw new Error('--key-id is required')
    await findKey(keyId)
    const revoked = await db.integrations.disableKey(keyId)
    console.log(revoked === null ? `${keyId} was not enabled; nothing changed.` : `${keyId} revoked.`)
    break
  }
  case 'rotate': {
    const keyId = one(args, '--key-id')
    if (keyId === undefined) throw new Error('--key-id is required')
    const previous = await findKey(keyId)
    if (!previous.enabled) throw new Error(`${keyId} is revoked; issue a new key instead`)
    const issued = await issue(issueInput(args, previous), previous.integrationId)
    await db.integrations.expireKeyAt(previous.id, new Date(now.getTime() + ROTATION_OVERLAP_MS))
    printIssued(issued)
    console.log(`\n  ${keyId} keeps working for 24 hours, then expires.`)
    break
  }
}
