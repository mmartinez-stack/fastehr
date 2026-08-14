# ADR 24 — The variable contract, and how secrets are handled

**Status:** accepted  
**Applies to:** `.env.example` · `packages/contracts/src/env.ts` · `turbo.json` · `Dockerfile` · `.github/workflows/ci.yml`

Every environment variable is declared in a known set of places, and which ones
depend on **when it is read**. Getting that wrong is not a style problem: a
value read at build time and configured at runtime is silently the wrong value,
and a value left out of `turbo.json` is invisible to a task under
`envMode: "strict"`.

## Four kinds, and they behave differently

| kind | example | read | configured |
| --- | --- | --- | --- |
| **build-inlined** | `NEXT_PUBLIC_*` | at build, baked into the client bundle | build argument — a Docker `ARG`, a CI build env |
| **server runtime** | `DATABASE_URL` | on first use, in the server process | runtime environment — `docker run -e`, the platform's config |
| **test-only** | `TEST_DATABASE_URL` | by the integration suite | the CI job, or your shell |
| **platform** | `PORT`, `HOSTNAME`, `NODE_ENV` | by the runtime itself | the image or the host |

The first row is the one that surprises people. `NEXT_PUBLIC_*` values are
substituted into JavaScript that ships to the browser, so **an image built with
one origin cannot be promoted to an environment that uses another**, and such a
value is public by definition — it is readable in the page source. Nothing
secret may ever wear that prefix.

## Where a new variable must be declared

1. **`.env.example`** — always. Name, one line on what it is for, and a
   placeholder that is obviously not a real value. This file is the contract;
   it is deliberately not gitignored.
2. **A schema in `@fastehr/contracts`** — if the server reads it. ADR 5 keeps
   Zod in one package, so validation lives there and the owning package parses
   it (`requireDatabaseUrl` in `packages/db`).
3. **`turbo.json`** — only if a task's **output** depends on it. `build.env`
   exists because Next inlines `NEXT_PUBLIC_*`, so those values are part of the
   build's identity and must be part of its cache key. A variable a task merely
   *has access to* does not belong here; adding one makes the cache miss across
   environments for no gain.
4. **The deployment surface** — `Dockerfile` (`ARG` for build-inlined, nothing
   for runtime), `.github/workflows/ci.yml` for anything CI needs.

Under `envMode: "strict"` an undeclared variable is simply absent inside a task.
That is the desired failure: absent and loud, rather than present and
accidental.

## Validation is lazy, and names itself

`requireDatabaseUrl()` parses on first use, not at import — ADR 14 has the
reasoning, which is that `next build` and CI must run with no environment at
all. A missing value fails with `DATABASE_URL is not set. See .env.example`,
naming the variable and pointing at the contract, rather than surfacing as a
driver error three frames down.

## Secrets

**Never in the repository.** `.env` and friends are gitignored; `.env.example`
carries names and placeholders only. A secret that reaches a commit is
compromised — rotate it, do not delete the commit and hope.

**Never as a Docker `ARG` or `ENV` in the image.** Build arguments persist in
image history and layer metadata, so `--build-arg DATABASE_URL=…` publishes the
credential to anyone who can pull the image. Runtime secrets arrive at runtime:
`docker run -e`, or the platform's secret store. The `ARG` in the Dockerfile is
`NEXT_PUBLIC_APP_URL`, which is public by construction.

**Never in CI as a plain value.** GitHub Actions secrets, referenced as
`${{ secrets.NAME }}`. The `TEST_DATABASE_URL` in the workflow is a literal on
purpose — it addresses a throwaway service container inside the job, holds
nothing, and dies with the job. That is the only kind of credential that
belongs in a workflow file.

**Never in a log, an error, or an audit event.** This is where secret handling
and PHI handling become the same rule, and the repo already enforces it in
three places:

- the audit event has **no field for procedure input** (ADR 10)
- validation failures leave as **codes, not messages**, and `stack` is stripped
  from every error (ADR 12)
- the audit sink writes one line of JSON with actor, path, type, outcome —
  nothing from the request body

A connection string in an exception message ends up in the same places a patient
identifier would: browser consoles, proxy logs, and whatever error tracker is
watching.

## Current variables

Kept in `.env.example`, which is the list. As of this ADR: `DATABASE_URL`
(runtime, required), `NEXT_PUBLIC_APP_URL` (build, optional),
`TEST_DATABASE_URL` (integration tests, required by that suite and refused a
fallback), plus `SMOKE_PORT` for `pnpm smoke` and the platform variables the
image sets.

> `DATABASE_URL` was removed from `build.env` when this was written. It had been
> declared as a build input, but nothing in the build reads it — `generate`
> takes no connection and every route is dynamic, so no page queries at build
> time. Left in place it only made the build cache key differ per environment.
> If a route is ever statically generated from data, the build will fail loudly
> under strict mode and the entry comes back.
