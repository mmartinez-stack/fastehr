# ADR 3 — `core` takes its types from `contracts`, never from Prisma

**Status:** accepted  
**Applies to:** `packages/core` · `packages/db` · `packages/contracts`

Domain types come from `@fastehr/contracts` via `z.infer` — exactly what the
dependency diagram already mandates. `db` returns contract-shaped objects at its
boundary; persistence shapes never cross into domain code.

**How that is enforced.** `packages/db` exports a `Db` of repositories and
nothing else — no `PrismaClient`, no generated model types, no `Prisma`
namespace. Its `package.json#exports` has a single entry (`.` →
`./src/index.ts`), so the client, the mappers, and the generated code are not
addressable from outside the package: `import … from '@fastehr/db/src/client.ts'`
fails with `TS2307`, the same unsuppressable failure decision 2 relies on. The
repository interfaces are declared in contract types only, so a query cannot be
expressed in Prisma's vocabulary through them either.

Mappers under `src/mappers/` are where rows become contracts. They list every
field explicitly rather than spreading a row — a new column is a type error, not
a silent pass-through — and they `parse` rather than cast, so drift between
`schema.prisma` and `contracts` fails at the row with the field named. The
`dateOfBirth` mapping is the worked example: a `@db.Date` column arrives as a JS
`Date` at UTC midnight and leaves as the `YYYY-MM-DD` string the contract
declares, converted through UTC because local time would shift the calendar day
west of UTC and record a birth date one day early.

**Why:** an earlier draft tried to let `core` use `import type` from the
generated Prisma client on the grounds that type imports are erased. That does
not survive decision 2 — TypeScript resolves the module specifier before it
distinguishes `import type` from a value import, so the specifier is
unresolvable from `core` either way. Rather than carve an exception into the one
boundary that is genuinely load-bearing, the requirement is withdrawn: contracts
are the single source of domain types.

**The hazard this prevents:** Prisma maps `Decimal` columns to a `Decimal`
object, not a `number`. Had Prisma types been allowed into `core`, a dosage or
a weight would arrive as a `Decimal` and type-check perfectly inside domain
arithmetic — `a - b` on two `Decimal`s compiles, and silently produces a wrong
value. Forcing every value through a Zod contract means that conversion happens
once, at the boundary, where it is visible and testable.
