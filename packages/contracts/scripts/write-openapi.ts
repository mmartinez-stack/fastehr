/**
 * Writes the partner API's OpenAPI document to docs/partner-api/openapi.json.
 *
 * The committed file is what the vendor is handed and what the drift test
 * (src/partner-api/openapi.test.ts) compares against, so a change to any
 * partner contract is a change to this file in the same commit.
 *
 * Usage (from packages/contracts):
 *   pnpm openapi:write
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPartnerOpenApiDocument } from '../src/partner-api/openapi.ts'

const target = fileURLToPath(new URL('../../../docs/partner-api/openapi.json', import.meta.url))
mkdirSync(new URL('../../../docs/partner-api/', import.meta.url), { recursive: true })
writeFileSync(target, `${JSON.stringify(buildPartnerOpenApiDocument(), null, 2)}\n`)
console.log(`wrote ${target}`)
