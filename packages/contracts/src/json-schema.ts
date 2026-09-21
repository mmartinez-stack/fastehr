import { z } from 'zod'

/**
 * JSON Schema for a contract, as a plain object ready to embed in an OpenAPI
 * document (`apps/web/src/server/openapi.ts`, ADR 35).
 *
 * Lives here for the same reason `describeValidationFailure` does: ADR 5
 * keeps Zod in this package, so the web app can hand a parser back to us
 * without naming Zod. The parameter is `unknown` for that reason; anything
 * that is not a Zod schema is refused by name rather than described as
 * nothing.
 *
 * `io: 'input'` describes what a caller sends, which is what documentation
 * is for: a transform's output type (a search string interpreted into
 * fields, say) is the procedure's business. Constructs JSON Schema cannot
 * express become `{}` rather than throwing, so one exotic refinement cannot
 * take the whole document down.
 */
export type JsonSchema = Record<string, unknown>

export function toJsonSchema(parser: unknown): JsonSchema {
  if (!(parser instanceof z.ZodType)) {
    throw new TypeError('toJsonSchema: expected a Zod schema')
  }
  const { $schema: _dialect, ...schema } = z.toJSONSchema(parser, { io: 'input', unrepresentable: 'any' })
  return schema
}
