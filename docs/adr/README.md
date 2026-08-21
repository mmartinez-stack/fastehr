# Architecture decisions

One decision per file. Numbers are permanent: code comments cite them ("ADR 3"),
so a decision that is superseded gets a new file and a note here, never a
renumbering.

Each records what was decided, why, and — usually the most valuable part — the
failure the decision prevents. Several exist because the alternative was tried
first and produced a bug that type-checked.

| # | Decision | Applies to |
| ---: | --- | --- |
| [1](001-jit-packages.md) | Internal packages ship raw TypeScript (JIT) | every package |
| [2](002-core-isolation.md) | `core` isolation is enforced by omission | `packages/core` |
| [3](003-contracts-own-domain-types.md) | `core` takes its types from `contracts`, never from Prisma | `core` · `db` · `contracts` |
| [4](004-tailwind-v4-css.md) | Tailwind v4 configuration is CSS | `packages/config/tailwind` |
| [5](005-zod-pinned.md) | Zod is pinned exactly, in one package | `packages/contracts` |
| [6](006-no-docker.md) | ~~Docker is out of scope~~ — superseded by 23 | the repository |
| [7](007-no-third-party-telemetry.md) | No third-party telemetry on PHI-bearing routes | `apps/web` |
| [8](008-five-packages.md) | Five packages, not seven | the workspace |
| [9](009-server-layer-boundaries.md) | The server layer stays extractable, and unavoidable | `apps/web/src/server` |
| [10](010-middleware-order.md) | Middleware order: audit, authenticate, authorize | `apps/web/src/server` |
| [11](011-superjson-wire-format.md) | The wire format is superjson | `apps/web/src/server` · `src/trpc` |
| [12](012-validation-errors-as-codes.md) | Validation errors leave as codes, never messages | `apps/web/src/server` · `contracts` |
| [13](013-single-path-alias-root.md) | One root for `@/*` | `apps/web/tsconfig.json` |
| [14](014-prisma-7.md) | Prisma 7: rust-free, driver adapter, config in one file | `packages/db` |
| [15](015-generate-task-graph.md) | `generate` is a first-class task, and the chain is guarded | `turbo.json` |
| [16](016-smoke-route-not-health.md) | `/_smoke` is the wiring test; `/health` stays free | `apps/web` |
| [17](017-client-seam.md) | RSC calls the router in-process; the browser hydrates | `apps/web/src/trpc` |
| [18](018-two-test-tiers.md) | Two test tiers, and a timezone pinned west of UTC | `packages/db` · CI |
| [19](019-ci-builds-cold.md) | CI builds cold, and the database job is separate | CI |
| [20](020-component-placement.md) | Where a component lives | `apps/web/src/components` |
| [21](021-strict-index-access-everywhere.md) | `noUncheckedIndexedAccess` is on everywhere, mockup included | `apps/web` · `packages/config` |
| [22](022-office-scoping.md) | The office is part of the actor, not of the request | `apps/web` · `packages/contracts` |
| [23](023-docker-image.md) | A production image for `apps/web` | `Dockerfile` · `apps/web` |
| [24](024-variables-and-secrets.md) | The variable contract, and how secrets are handled | `.env.example` · `turbo.json` · CI · Docker |
| [25](025-forms-validate-through-the-contract.md) | Forms validate through the contract; the mutation is the submit validator | `apps/web` · `packages/contracts` |

## Adding one

Next free number, `NNN-kebab-title.md`, a row in the table above. Worth writing
when the reasoning would not survive a reader asking "why is this like this?" —
particularly when the obvious alternative is wrong for a reason that is not
obvious.

A findings-and-remediation log of how several of these came about lives in
[`../architecture-review.md`](../architecture-review.md).
