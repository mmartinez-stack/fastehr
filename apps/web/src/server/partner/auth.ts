import { apiKeyMetadataSchema, bearerToken, permissionsToScopes } from '@fastehr/contracts'
import type { PartnerActor, PartnerContext } from './context.ts'
import { PartnerApiError } from './errors.ts'

/**
 * Partner key authentication (ADR 36, ADR 38).
 *
 * The bearer token goes to the key verifier (Better Auth's api key plugin
 * behind `ctx.keys`), which answers valid, invalid, or over its limit. A
 * valid key is then bound to its owner, an active integration principal,
 * and to the settings the clinic attached: the source-address allowlist
 * and the clinics it may see. Every way this can fail short of the rate
 * limit answers the same `unauthenticated`: an absent header, an unknown
 * or wrong key, an expired or disabled one, a principal switched off, a
 * row whose settings no longer parse, or an address outside the allowlist.
 * A probe learns nothing from the code, and the audit trail records the
 * attempt either way.
 */

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

  const verification = await ctx.keys.verify(token)
  if (verification.status === 'rate_limited') throw new PartnerApiError('rate_limited', { retryAfterSeconds: 60 })
  if (verification.status !== 'valid') throw refuse()
  const key = verification.key

  // Re-parsed rather than trusted: settings on a row that no longer fit the
  // contract, or a scope retired from the vocabulary, must not become live.
  const metadata = apiKeyMetadataSchema.safeParse(key.metadata)
  if (!metadata.success) throw refuse()

  const integration = await ctx.db.integrations.findActive(key.referenceId)
  if (integration === null) throw refuse()

  if (!ipAllowed(metadata.data.allowedIps, ctx.ipAddress)) throw refuse()

  return {
    kind: 'integration',
    integrationId: integration.id,
    keyId: key.id,
    name: integration.name,
    scopes: permissionsToScopes(key.permissions),
    locations: metadata.data.locationIds,
  }
}
