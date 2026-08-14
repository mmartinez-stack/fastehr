# ADR 20 — Where a component lives

**Status:** accepted  
**Applies to:** `apps/web/src/components` · `apps/web/src/features` · route directories

Four homes, chosen by **how many routes use it** and **whether it belongs to a
domain** — not by what it looks like.

| Location | When |
| --- | --- |
| the route's own directory | one route uses it |
| `src/features/<domain>/` | more than one route uses it, and it belongs to one domain |
| `src/components/` | more than one route uses it, and it belongs to no single domain — app shell, layout, cross-cutting |
| `src/components/ui/` | shadcn CLI output, and nothing else |

**Promotion is a move, triggered by the second consumer.** Write a component in
the route directory that needs it. When a second route needs it, move it — to
`src/features/<domain>/` if it carries domain meaning, to `src/components/` if
it does not. Nothing is placed in a shared directory in anticipation; that is
how shared directories fill with things one route uses.

`src/features/` does not exist yet, and should be created by the first promotion
rather than ahead of it.

## Checked against the tree as it stands

The rule was written after looking at what is there, and it ratifies the current
layout without asking for a single move:

- every component colocated in a route directory is used by exactly that route
- `page-header` (11 routes) and `status-badges` (7 routes) cross patients,
  queues, and RFI — no single domain owns them, so `src/components/` is right
- `top-nav`, `sms-banner`, `office-provider` are app shell, used by the `(app)`
  layout

A rule that demanded churn on the day it was written would have been the wrong
rule.

## `src/components/ui` is generated, and stays regenerable

These files come from `pnpm exec shadcn add`. Their whole value is that the CLI
can add or update one without a merge, and that holds only while they depend on
nothing of ours — `cn` from `@/lib/utils`, and each other.

A primitive that imports a domain type, a feature component, or the server layer
gets **silently overwritten** by the next `shadcn add`: the file still compiles
afterwards, and the logic is simply gone. So the dependency is fenced in
`apps/web/eslint.config.mjs` rather than left to reviewer memory. Need a
`<Button>` that knows about patients? That is a wrapper in `src/components/` or
`src/features/`, not an edit here.

Restyling goes through CSS variables (`cssVariables: true` in `components.json`)
— tokens, not component classes.

> The fence is a `regex` pattern, not a `group`. The rule is "any `@/` import
> except `@/lib/utils` and siblings", and gitignore-style negation
> (`'!@/components/ui/**'`) does not carve the siblings back out — they stay
> matched by the broader pattern, which flags eleven real files. `(?!ui/)`
> states it once. Verified in both directions: the tree lints clean, and a probe
> importing `@fastehr/contracts`, `@/components/page-header`, `@/server` and
> `@/trpc/client` is rejected on all four while `@/lib/utils` and
> `@/components/ui/button` pass.
