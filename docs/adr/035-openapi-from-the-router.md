# ADR 35 — The API documentation is generated from the router and viewed in a vendored Swagger UI

**Status:** accepted (2026-09-21); amended 2026-09-22 (staff surface)  
**Applies to:** `apps/web/src/server/openapi.ts` · `apps/web/src/server/procedure-meta.ts` · `apps/web/src/app/api/openapi.json` · `apps/web/src/app/api-docs` · `apps/web/public/swagger-ui` · `packages/contracts/src/json-schema.ts`

`/api/openapi.json` is an OpenAPI 3.1 document built from `appRouter` on
every request, and `/api-docs` is Swagger UI reading it. Both require a
session. The document lists every mounted procedure with its HTTP shape,
its input schema, and the access level its middleware chain enforces, plus
the four Better Auth endpoints the app uses.

## Why generated, and from what

tRPC has no OpenAPI of its own; its contract is a TypeScript type. A
hand-written document would be right on the day it was written and wrong
after the next router change, silently, which for API documentation is
worse than none. So nothing per procedure is written by hand:

- **Paths and methods** come from `router._def.procedures`: a query is
  `GET /api/trpc/<path>?input=` and a mutation is `POST /api/trpc/<path>`,
  both with the superjson envelope (ADR 11).
- **Input schemas** come from the Zod contracts through
  `toJsonSchema` in `@fastehr/contracts`, added there because ADR 5 keeps
  Zod in that one package. The schema describes the input side of a
  transform, which is what a caller needs.
- **Access levels** come from tRPC meta set once per base procedure
  (`publicProcedure`, `protectedProcedure`, `clericalProcedure`, and so on),
  never on a router. The document therefore cannot claim an access level
  the chain does not enforce, and a new procedure documents itself.

**Outputs are not described.** The router declares no output schemas; a
procedure parses its own result through a contract inside its body. The
document says so and shows the envelope around an unspecified value. Adding
`.output()` to every procedure would give richer documentation at the cost
of a second declaration of each result shape; not done until something
needs it.

## Why not `trpc-to-openapi`

It generates a document too, but by turning procedures into REST-style
endpoints with their own paths, which a client would then call instead of
`/api/trpc`. That is a second API surface to secure and keep in step with
the first, for the sake of documentation. The document here describes the
one surface that exists.

## Why Swagger UI is vendored

`public/swagger-ui/` holds the two files of `swagger-ui-dist` 5.33.0,
Apache-2.0, copied verbatim. Neither the npm package nor a CDN:

- The npm package depends on `@scarf/scarf`, install-time telemetry, which
  ADR 7 rules out even when the package manager blocks its script.
- A script loaded from a CDN onto a signed-in page runs as that user, with
  that user's session cookie, against a clinic's API. The supply chain of a
  documentation page is not worth that exposure.

The cost is 1.7 MB in the repository and a manual upgrade, documented next
to the files.

## Why behind the `staff` surface

The schema of a clinic's API is not patient data, but it is not a public
notice either, and "try it out" runs real calls as the viewer. As accepted,
any signed-in staff account could read the page. **Amended 2026-09-22:**
the page and the document it reads sit behind the `staff` surface (ADR 31:
the administrator and the medical director), because the reference is an
operator's tool and a clinician or the front desk has no use for it. What a
call does is still decided by the viewer's role, exactly as from the
browser client; the partner's own reference is a different page, cut to
their key (ADR 38).
