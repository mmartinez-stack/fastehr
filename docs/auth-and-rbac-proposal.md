# Authentication and RBAC — package recommendation

**Status:** proposal, not decided. Becomes ADR 25 if accepted.
**Applies to:** `apps/web/src/server/middleware/auth.ts` · `apps/web/src/trpc/actor.ts` · `apps/web/src/trpc/session.ts` · `packages/db` · `packages/contracts`

This is the "auth ticket" that ADR 22 and three source comments already point
at. It closes the placeholders in `actorFromCookieHeader`, `requireAuth`,
`requireRole`, and the anonymous fallback in `permittedOffices()`.

---

## Recommendation in one line

**Adopt [Better Auth](https://better-auth.com) for authentication. Do not adopt
a package for authorization** — extend the existing tRPC middleware with a
permission matrix in `@fastehr/contracts`.

Splitting the two is the substance of the recommendation, not a hedge. The
authentication problem here is generic (sessions, cookies, password hashing,
CSRF, rotation) and solved badly by hand. The authorization problem is
specific — four roles and a site boundary, checked inside a middleware chain
that already exists and already audits its refusals — and every authorization
package on the market would fight the repo's fences to do it.

---

## Why Better Auth

Assessed against this repo's constraints rather than in the abstract.

| Constraint | How Better Auth lands |
| --- | --- |
| **ADR 9 rule 2** — nothing in `src/server/**` may import `next/*` | Its server API is `auth.api.getSession({ headers })`, taking a standard `Headers`. Framework-agnostic by design, so session verification can live inside the server layer without touching Next. This is the constraint that eliminates most alternatives |
| **ADR 9 rule 1** — the router stays mountable outside Next | Same property. An Electron main process or worker can verify a session with the identical call |
| **ADR 7** — no third-party disclosure on PHI-bearing routes | Self-hosted. Sessions and staff identity stay in our PostgreSQL. No BAA to negotiate because no data leaves |
| **CLAUDE.md** — migrations committed and append-only, no `db push` | Its CLI *generates Prisma models*; you then run `prisma migrate dev` as normal. It does not own a migration mechanism of its own |
| **Prisma 7** | Actively tracked — its Prisma docs already cover the 7.x generated-client output path this repo uses |
| **ADR 5** — `contracts` is the only package with a direct Zod dependency | Better Auth carries its own validation internally; `apps/web` still declares no Zod. Extra user fields are declared with its own type descriptors, not Zod schemas |
| **ADR 24** — env validated through `@fastehr/contracts` | Needs `BETTER_AUTH_SECRET` and a base URL; both go through the existing env schema |

### It is a library, not a service

The first question a reviewer asks. Better Auth runs **in-process** and stores
everything in our own PostgreSQL — it is the structural opposite of a hosted
identity provider:

| | Better Auth | Clerk / Auth0 / WorkOS |
| --- | --- | --- |
| Where it runs | our Node process | vendor infrastructure |
| Where users and sessions live | **our PostgreSQL** | vendor database |
| Account or API key needed | no | yes |
| Login path depends on | our app and our database | vendor uptime |
| Licence | MIT | commercial |

The `user`, `session`, `account` and `verification` tables land in our
`schema.prisma` and are created by our own committed migrations. There is no
control plane, no license check, and nobody to sign a BAA with.

**Telemetry is disabled by default** (opt-in via `telemetry: { enabled: true }`
or `BETTER_AUTH_TELEMETRY=1`). Set `BETTER_AUTH_TELEMETRY=0` explicitly anyway,
so the posture is declared rather than inherited — ADR 7 is a stated position,
not an accident of a vendor default.

**What would introduce an external dependency**, none of it required by the core:

| Feature | External service | Needed here? |
| --- | --- | --- |
| Email/password sign-in, sessions | **none** | the baseline |
| Email verification, password reset | an email transport (SES, Resend, …) — Better Auth only calls a callback we supply | avoidable, see below |
| Social / OAuth sign-in | the provider | not wanted |
| SMS-based 2FA | an SMS provider | avoidable — use TOTP or passkeys |
| TOTP 2FA, passkeys / WebAuthn | **none** | the recommended MFA route |
| Session caching in Redis | optional secondary storage | not needed; Postgres suffices |

With roughly 31 staff accounts, self-service password reset can be dropped in
favour of an admin issuing credentials, and MFA can be TOTP or passkeys. That
combination keeps the **entire authentication path inside our perimeter with no
external service at all**, which is not something any hosted option can offer.

Worth deciding deliberately: an email provider in the reset path is not a PHI
disclosure (a reset link to a staff address carries no patient data), but it is
an external dependency in the login path of a clinical system.

### The ecosystem moved

Auth.js/NextAuth was the default answer and no longer is. As of early 2026 it is
in **maintenance mode** — security fixes only, no new features — and **Better
Auth's maintainers now steward it**. `next-auth` v5 is still published as
`5.0.0-beta.32`.

The July 2026 Auth.js advisories are worth reading before choosing it anyway.
Four issues across `@auth/core`, v4 and v5, including a Unicode-normalization
bypass in email validation and — v5 only — **authentication checks defaulting to
allowing access when provider configuration errored**. A fail-open default is
the wrong failure mode anywhere and a disqualifying one in front of PHI.

Recommending the project that inherited Auth.js is not a bet on a newcomer; it
is following where the maintenance actually went.

### Version and licence

npm's `latest` tag resolves to **`better-auth@1.7.1`**, MIT licensed. Pin
exactly, as this repo already does for `zod` and `@prisma/client`.

Verified against the published manifest rather than the docs — these export
paths exist and are what the code sketches below import:

| Export | Used for |
| --- | --- |
| `better-auth` | `betterAuth()` |
| `better-auth/adapters/prisma` | `prismaAdapter` |
| `better-auth/plugins/access` | `createAccessControl`, if the RBAC plugins are ever adopted |
| `better-auth/plugins/organization/access` | organization roles, ditto |

`next` is a **peer** dependency, not a hard one — which is the manifest-level
confirmation of the framework-agnostic claim above.

### It puts a second stakeholder on the Zod version — check this against ADR 5

`better-auth@1.7.1` depends on `zod: ^4.3.6`.

ADR 5 pins `zod` to exactly `4.4.3` in `packages/contracts` and states the goal
as "exactly one version in the tree and one place to upgrade it." Today that
still holds: `^4.3.6` is satisfied by `4.4.3`, so the workspace resolves to a
single copy, and `apps/web` still declares no direct Zod dependency — ADR 5's
letter is intact.

What changes is that **the exact pin is no longer the only constraint on Zod**.
Two consequences to accept knowingly:

- A future Zod major in `contracts` that Better Auth has not yet adopted puts a
  second copy in the tree, which is the precise outcome ADR 5 was written to
  prevent.
- Conversely, a Better Auth upgrade that raises its Zod floor above `4.4.3`
  forces the contracts pin to move — an unrelated package dictating the version
  that *is* the cross-package contract.

Neither is a blocker and both are visible at install time rather than at
runtime. But ADR 5 should be amended to name Better Auth as a second Zod
stakeholder rather than left to imply the dependency is still confined to one
package.

---

## The one real conflict, and how it resolves

`prismaAdapter` requires a live client:

```ts
const prisma = new PrismaClient()
betterAuth({ database: prismaAdapter(prisma, { provider: 'postgresql' }) })
```

**ADR 3 forbids that client crossing the `@fastehr/db` boundary.** The package
has a single `exports` entry, and `src/client.ts` is deliberately unreachable —
"persistence types cannot cross the package boundary because there is no
specifier that resolves to them."

Naively this kills the adapter. It does not, because *the adapter does not need
to be constructed outside the package.* Bind it where the client already lives
and export only the opaque adapter object:

```ts
// packages/db/src/auth-adapter.ts  — internal, alongside client.ts
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { getPrismaClient } from './client.ts'

/**
 * The Better Auth storage binding. Exported from src/index.ts as an opaque
 * value: it carries no Prisma types, so ADR 3 holds — a consumer still cannot
 * name PrismaClient, Prisma.*, or any generated model.
 */
export const authAdapter = prismaAdapter(getPrismaClient(), { provider: 'postgresql' })
```

`PrismaClient` and the generated models still never appear in a consumer's type
surface. ADR 3's guarantee was never "no auth library may use Prisma" — it was
that *persistence shapes never reach domain code*, and that is untouched.

**This also means no sixth package.** ADR 8's bar — a package boundary needs a
load-bearing reason — is not met here: auth tables belong in the schema that
already exists, and the policy config belongs in the server layer that already
exists.

One caveat: `authAdapter` as written constructs the client eagerly at import,
which breaks the lazy-construction property `client.ts` protects (`next build`
and CI import this package without a `DATABASE_URL`). Export a **factory**
instead — `createAuthAdapter()` — or have it close over `getPrismaClient` rather
than call it, matching how `createDb` already takes a getter.

---

## Where the code changes

### The seam has to become async

```ts
// today — apps/web/src/trpc/actor.ts
export function actorFromCookieHeader(_cookieHeader: string | null): Actor | null
```

Session verification is a database lookup, so it is asynchronous. The signature
must become `Promise<Actor | null>`. `permittedOffices()` already awaits, and the
route handler can await; this is a small ripple but it is a **breaking signature
change to the file whose comment calls itself "the seam it plugs into."**

### It also has to move

`src/trpc/actor.ts` sits inside the `dataAccessBoundary` fence — that rule covers
`src/**` and ignores only `src/server/**`. So `actor.ts` **cannot import
`@fastehr/db`**, and therefore cannot reach the adapter or verify a session.

Verification belongs in `src/server/`, which is the layer permitted to touch the
database and forbidden from touching Next — exactly right for a function that
takes `Headers` and returns an `Actor`:

```
packages/db/src/auth-adapter.ts        adapter bound to the internal client
apps/web/src/server/auth.ts            betterAuth({ database: createAuthAdapter(), … })
apps/web/src/server/index.ts           export { auth, actorFromHeaders }
apps/web/src/app/api/auth/[...all]/    route handler — outside the fence, like the tRPC route
apps/web/src/trpc/session.ts           calls actorFromHeaders; fallback deleted
apps/web/src/trpc/actor.ts             deleted (both callers now import from @/server)
```

The sign-in/callback HTTP routes mount with `toNextJsHandler(auth)` in
`app/api/auth/[...all]/route.ts` — outside `src/server/**`, the same exemption
`app/api/trpc/[trpc]/route.ts` already relies on. The pattern is unchanged.

### ADR 22's fallback gets deleted

`permittedOffices()` currently returns every site to an anonymous caller, and
both ADR 22 and the source comment name this as the auth ticket's job. Once
sessions exist it becomes `actor?.offices ?? []`.

---

## Why not a package for authorization

### The permission model is a matrix, not a policy language

The legacy system's own `users` collection — surveyed in
[`docs/discovery/entity-inventory.md`](./discovery/entity-inventory.md) — shows
what the real model is across 31 staff accounts:

| Field | Values | Population |
| --- | --- | --- |
| `group` | `admin`, `clerk`, `csr`, `doc` | all 31 |
| `canPrescribe` | true-or-absent | 18 |
| `reviewer` | true-or-absent | 3 |
| `isActive` | boolean | all 31 |
| `dea` | prescriber registration | 16 |

Four roles, two capability flags, and the office set from ADR 22. The two-tier
signing in `visits.signature` / `visits.reviewSignature` maps onto `reviewer`
directly. That is a table you can read in one screen — and a table is what
`requireRole` should consult.

A policy engine earns its keep when rules are numerous, change without a deploy,
or are relationship-shaped ("the attending on the care team that owns this
encounter"). None of that is true yet. If it becomes true — delegated access,
break-glass, per-record care-team relationships — revisit with the same rigour.

### CASL specifically collides with ADR 3

CASL is the strongest TypeScript-native candidate and the one worth naming a
reason against. Its Prisma integration works by generating **`where` filters**
that you spread into a query:

```ts
prisma.patient.findMany({ where: accessibleBy(ability).Patient })
```

That value *is* a Prisma persistence shape. Making it useful means passing it
across the `@fastehr/db` boundary into a repository — precisely the traffic
ADR 3 exists to stop, and it would arrive by way of a package whose whole appeal
is that the filter is implicit and invisible at the call site. Using CASL only
for boolean `can()` checks avoids this, but then it is a rules DSL over four
roles, which is not worth a dependency.

### Cerbos, OpenFGA, SpiceDB, Permit

All are externalized decision services: a separate deployable and a network call
on the authorization path. For an EHR that means a new component inside the
compliance boundary, plus a latency and availability dependency on **every PHI
read**. The failure semantics alone (what does `officeScopedProcedure` do when
the PDP is unreachable?) are a larger design question than the rules they would
hold. Disproportionate to four roles.

### Better Auth's own RBAC plugins

Better Auth ships `admin` and `organization` plugins with `createAccessControl`,
and its organization model — members holding roles scoped to an organization —
is a genuinely close fit for offices. Two reasons to leave it for later:

1. It stores **roles as comma-separated strings** in a single column. For a
   system where role is an authorization input on PHI access, a delimited string
   column is a poor primitive.
2. It would restructure `Actor.offices` into org membership and introduce
   `activeOrganizationId` on the session. That is client-settable through
   `setActive` — server-verified against membership, so not a hole, but ADR 22
   is emphatic that the office set is identity, and adopting a
   session-mutable active-org concept deserves its own decision rather than
   arriving as a side effect of choosing an auth library.

Adopt it if and when multi-office membership management becomes product surface
(invitations, per-office admins). `officeScopedProcedure` stays necessary either
way.

### Hosted identity — Clerk, Auth0, WorkOS

Not disqualified, and worth stating why, since "healthcare ⇒ never hosted" is
too glib. **The users here are staff, not patients** — 31 accounts. Staff
identity is not PHI, so this is not the disclosure problem ADR 7 describes
(which is about *route paths* revealing which patient records were opened).

The case against is cost and posture, not law. A BAA sits on Clerk's Enterprise
tier and Auth0's enterprise plans; WorkOS is the most accommodating on this
point. Against ~31 internal accounts, enterprise-tier identity spend buys little
that Better Auth does not do in-process, and it adds an external dependency to
the login path of a clinical system. If SSO against a hospital IdP (SAML/OIDC)
becomes a requirement, that calculus changes and WorkOS is the one to price
first.

---

## What to build, concretely

**1. Permission matrix in `@fastehr/contracts`** — it is domain vocabulary and
the server must enforce it, the same argument ADR 22 made for `officeSchema`:

```ts
// packages/contracts/src/rbac.ts
export const roleSchema = z.enum(['admin', 'doc', 'clerk', 'csr'])
export const permissionSchema = z.enum([
  'patient:read', 'patient:write',
  'visit:read', 'visit:sign', 'visit:review',
  'refill:read', 'refill:approve',
  'user:manage',
])

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = { /* … */ }
export function roleGrants(roles: readonly Role[], needed: Permission): boolean
```

**2. `requirePermission(permission)` middleware** replacing today's
"has at least one role" placeholder, composed the same way and refusing with
`FORBIDDEN` so the existing audit middleware records the denial (ADR 10).

**3. `Actor` gains `permissions`**, resolved server-side from role plus the
capability flags — the same discipline as `offices`. Adding the field will make
the compiler list every construction site, as ADR 22 notes it did before.

**4. Keep `canPrescribe` / `reviewer` as capabilities, not roles.** The legacy
data has them orthogonal to `group` (18 and 3 of 31), and `visit:sign` should
depend on the capability, not on being a `doc`.

---

## Risks worth naming

- **Better Auth is a young project carrying a lot of surface.** Mitigations: pin
  exactly, adopt the smallest plugin set (email/password plus session), and keep
  authorization *outside* it so a future migration touches authentication only.
  Splitting authn from authz is partly a hedge against this.
- **The async seam change is breaking.** Small, but it lands in the file every
  future host plugs into.
- **`getSession` on every protected call is a database round-trip.** Better Auth
  offers cookie caching for this; whether a cached session is acceptable in front
  of PHI is a decision to make deliberately, not a default to inherit.
- **Password storage brings its own obligations.** The legacy `users` collection
  stores `hash` and `salt`, which are **not migrating** (noted in the
  entity-inventory Prisma proposal). Every staff account needs a fresh
  credential, which is an operational task, not a code one.

---

## Open questions

1. **SSO?** If clinic staff must authenticate against a hospital or corporate
   IdP, that changes the answer — Better Auth has SSO plugins, but WorkOS is
   built for it.
2. **MFA — required, and by what rule?** Better Auth supports TOTP and passkeys;
   whether it is mandatory for prescribers is a policy question.
3. **Session lifetime and idle timeout** in front of PHI on shared clinic
   workstations.
4. **Do the four legacy roles survive the migration**, or is this the moment to
   re-derive them? Entity-inventory §7 already asks stakeholders what `admin`,
   `clerk`, `csr` and `doc` actually permit — that answer is this matrix's input.
5. **Break-glass access** — emergency override is common in EHRs and is the
   requirement most likely to justify a real policy engine later.
