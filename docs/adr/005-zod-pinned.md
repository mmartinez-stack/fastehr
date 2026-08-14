# ADR 5 — Zod is pinned exactly, in one package

**Status:** accepted  
**Applies to:** `packages/contracts`

`packages/contracts` declares `"zod": "4.4.3"` — no caret — and is the only
package with a direct Zod dependency.

**Why:** Zod's inferred types *are* the cross-package contract. A minor bump
that changes inference behaviour would surface as type errors in unrelated
packages during an unrelated install. Confining the dependency to one package
means there is exactly one version in the tree and one place to upgrade it.
