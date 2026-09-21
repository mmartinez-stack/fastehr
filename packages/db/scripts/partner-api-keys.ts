/**
 * Partner API key issuance (ADR 37). The operator-only path: keys are never
 * created from the application, and the key is printed to **stdout once**,
 * to be handed to the partner out-of-band. It is never written to a file
 * and never logged; the database keeps the key id and the SHA-256 of the
 * secret, nothing more.
 *
 * Usage (from packages/db):
 *   pnpm partner-api-keys -- issue --name "Voice assistant" --environment dev \
 *       --scopes patients:lookup,patients:verify,queue:read --issued-by you@clinic.example \
 *       [--vendor "Acme"] [--expires-in-days 90] [--allow-ip 203.0.113.5/32]... \
 *       [--location sylmar]... [--baa-signed 2026-09-01]
 *   pnpm partner-api-keys -- list
 *   pnpm partner-api-keys -- revoke --key-id ABCDEFGH
 *   pnpm partner-api-keys -- rotate --key-id ABCDEFGH [--issued-by you@clinic.example]
 *
 * A `live` key refuses to issue without `--baa-signed`: no business
 * associate agreement, no production PHI. Rotation mints a new key with the
 * old one's settings and gives the old key 24 hours to expire, so the
 * partner can cut over without an outage.
 */
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import {
  API_KEY_ID_ALPHABET,
  API_KEY_ID_LENGTH,
  createApiClientInput,
  describeValidationFailure,
  formatApiKey,
  type ApiClient,
  type CreateApiClientInput,
} from '@fastehr/contracts'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const { createDb } = await import('../src/index.ts')

const ROTATION_OVERLAP_MS = 24 * 60 * 60 * 1000

function generateKeyId(): string {
  const bytes = randomBytes(API_KEY_ID_LENGTH * 2)
  let out = ''
  for (let i = 0; out.length < API_KEY_ID_LENGTH; i += 1) {
    const byte = bytes[i]
    if (byte === undefined) return generateKeyId()
    if (byte < Math.floor(256 / API_KEY_ID_ALPHABET.length) * API_KEY_ID_ALPHABET.length) {
      out += API_KEY_ID_ALPHABET[byte % API_KEY_ID_ALPHABET.length]
    }
  }
  return out
}

function generateSecret(): string {
  return randomBytes(32).toString('base64url')
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

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

function issueInput(args: Args, defaults?: ApiClient): CreateApiClientInput {
  const scopes = one(args, '--scopes')
  const days = one(args, '--expires-in-days')
  const parsed = createApiClientInput.safeParse({
    name: one(args, '--name') ?? defaults?.name,
    vendor: one(args, '--vendor') ?? defaults?.vendor ?? undefined,
    environment: one(args, '--environment') ?? defaults?.environment,
    scopes: scopes === undefined ? defaults?.scopes : scopes.split(',').map((scope) => scope.trim()),
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
const db = createDb()
const now = new Date()

async function issue(input: CreateApiClientInput): Promise<{ client: ApiClient; key: string }> {
  const keyId = generateKeyId()
  const secret = generateSecret()
  const { expiresInDays, ...rest } = input
  const client = await db.apiClients.create({
    ...rest,
    keyId,
    keyHash: hashSecret(secret),
    expiresAt: new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000),
  })
  return { client, key: formatApiKey({ environment: client.environment, keyId, secret }) }
}

function printIssued({ client, key }: { client: ApiClient; key: string }): void {
  console.log('\nPartner API key (shown once; hand it over out-of-band, then discard this output):\n')
  console.log(`  ${key}\n`)
  console.log(`  client   ${client.name} (${client.environment}, key id ${client.keyId})`)
  console.log(`  scopes   ${client.scopes.join(', ')}`)
  console.log(`  expires  ${client.expiresAt}`)
  if (client.allowedIps.length > 0) console.log(`  ips      ${client.allowedIps.join(', ')}`)
  if (client.locationIds.length > 0) console.log(`  clinics  ${client.locationIds.join(', ')}`)
}

async function findByKeyId(keyId: string): Promise<ApiClient> {
  const client = (await db.apiClients.list()).find((candidate) => candidate.keyId === keyId)
  if (client === undefined) throw new Error(`no client with key id ${keyId}`)
  return client
}

switch (args.command) {
  case 'issue': {
    printIssued(await issue(issueInput(args)))
    break
  }
  case 'list': {
    const clients = await db.apiClients.list()
    if (clients.length === 0) {
      console.log('No partner API clients.')
      break
    }
    console.log('key id    status   env   expires                   last used                 scopes')
    for (const client of clients) {
      console.log(
        `${client.keyId}  ${client.status.padEnd(7)}  ${client.environment.padEnd(4)}  ${client.expiresAt}  ${(client.lastUsedAt ?? 'never').padEnd(24)}  ${client.scopes.join(',')}  ${client.name}`,
      )
    }
    break
  }
  case 'revoke': {
    const keyId = one(args, '--key-id')
    if (keyId === undefined) throw new Error('--key-id is required')
    const client = await findByKeyId(keyId)
    const revoked = await db.apiClients.revoke(client.id, now)
    console.log(revoked === null ? `${keyId} was not active; nothing changed.` : `${keyId} revoked.`)
    break
  }
  case 'rotate': {
    const keyId = one(args, '--key-id')
    if (keyId === undefined) throw new Error('--key-id is required')
    const previous = await findByKeyId(keyId)
    if (previous.status !== 'active') throw new Error(`${keyId} is not active; issue a new key instead`)
    const issued = await issue(issueInput(args, previous))
    await db.apiClients.expireAt(previous.id, new Date(now.getTime() + ROTATION_OVERLAP_MS))
    printIssued(issued)
    console.log(`\n  ${keyId} keeps working for 24 hours, then expires.`)
    break
  }
}
