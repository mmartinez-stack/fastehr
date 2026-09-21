import { createHash } from 'node:crypto'
import { bearerToken, parseApiKey, partnerScopeSchema, locationSlugSchema } from '@fastehr/contracts'
import type { PartnerActor, PartnerContext } from './context.ts'
import { PartnerApiError } from './errors.ts'

/**
 * Partner key authentication (ADR 37).
 *
 * The bearer token is parsed into its key id and secret; the secret is
 * hashed and handed to the repository, which compares it in constant time
 * against the stored hash and returns the client only on a match. Every way
 * this can fail answers the same `unauthenticated`: an absent header, a
 * malformed key, an unknown id, a wrong secret, an expired or revoked key,
 * or a source address outside the allowlist. A probe learns nothing from
 * the code, and the audit trail records the attempt either way.
 */

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** Writes `lastUsedAt` at most this often per client, not once a request. */
const LAST_USED_WRITE_INTERVAL_MS = 60 * 1000
const lastUsedWrittenAt = new Map<string, number>()

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

/**
 * Whether `ip` is in the allowlist. An empty list allows any address. An
 * entry is an exact address or an IPv4 CIDR; IPv6 ranges are matched
 * exactly (a vendor with an IPv6 egress lists its addresses).
 */
export function ipAllowed(allowlist: readonly string[], ip: string | null): boolean {
  if (allowlist.length === 0) return true
  if (ip === null) return false
  const candidate = ip.trim().toLowerCase()
  const candidateInt = ipv4ToInt(candidate)

  for (const entry of allowlist) {
    const normalised = entry.trim().toLowerCase()
    const [network, bits] = normalised.split('/')
    if (network === undefined) continue
    if (bits === undefined) {
      if (network === candidate) return true
      continue
    }
    const networkInt = ipv4ToInt(network)
    const prefix = Number(bits)
    if (networkInt === null || candidateInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      if (normalised === candidate) return true
      continue
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    if (((networkInt & mask) >>> 0) === ((candidateInt & mask) >>> 0)) return true
  }
  return false
}

export async function authenticateApiKey(headers: Headers, ctx: PartnerContext): Promise<PartnerActor> {
  const refuse = () => new PartnerApiError('unauthenticated')

  const token = bearerToken(headers.get('authorization'))
  if (token === null) throw refuse()
  const parsed = parseApiKey(token)
  if (parsed === null) throw refuse()

  const client = await ctx.db.apiClients.findByCredential({ keyId: parsed.keyId, secretHash: hashSecret(parsed.secret) })
  if (client === null) throw refuse()

  const now = ctx.now()
  if (new Date(client.expiresAt).getTime() <= now.getTime()) throw refuse()
  if (!ipAllowed(client.allowedIps, ctx.ipAddress)) throw refuse()

  const lastWritten = lastUsedWrittenAt.get(client.id) ?? 0
  if (now.getTime() - lastWritten >= LAST_USED_WRITE_INTERVAL_MS) {
    lastUsedWrittenAt.set(client.id, now.getTime())
    void ctx.db.apiClients.touchLastUsed(client.id, now).catch((error: unknown) => {
      console.error('[partner-api] lastUsedAt write failed', ctx.requestId, error)
    })
  }

  return {
    kind: 'api_client',
    clientId: client.id,
    keyId: client.keyId,
    name: client.name,
    // Re-parsed rather than trusted: a scope or slug retired from the
    // vocabulary but still on a row must not become a live permission.
    scopes: client.scopes.filter((scope) => partnerScopeSchema.safeParse(scope).success),
    locations: client.locationIds.filter((slug) => locationSlugSchema.safeParse(slug).success),
  }
}
