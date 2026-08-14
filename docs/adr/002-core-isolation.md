# ADR 2 — `core` isolation is enforced by omission

**Status:** accepted  
**Applies to:** `packages/core`

`packages/core/package.json` lists neither `next` nor `@prisma/client`. pnpm's
isolated `node_modules` means those specifiers do not resolve from `core` at
all.

**Why:** a lint rule can be disabled with an inline comment; an unresolvable
module cannot. The failure is a hard `TS2307` at typecheck, in CI, with no
suppression path. `eslint-plugin-import`'s `no-extraneous-dependencies` is
layered on top purely for faster feedback in the editor. Dependency-cruiser is
deliberately not used; it would be a third description of a constraint the
package manager already enforces.

No exceptions, and no lint escape hatches.
