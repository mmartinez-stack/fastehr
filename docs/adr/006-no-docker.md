# ADR 6 — Docker is out of scope

**Status:** superseded by [ADR 23](023-docker-image.md) (2026-08-14)  
**Applies to:** the repository

No Dockerfiles, no compose files.

---

**Superseded.** [ADR 23](023-docker-image.md) adds a production `Dockerfile` for
`apps/web`. What survives of this decision: there is still no compose file, and
local development is not containerised — you run `pnpm dev` against a database
you provide. The reversal is about shipping the app, not about how it is built
locally.
