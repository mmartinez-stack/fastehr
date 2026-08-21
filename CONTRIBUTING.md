# Contributing

Conventions for branches, commits, and pull requests. Environment variables and
secrets have their own contract — [ADR 24](docs/adr/024-variables-and-secrets.md).

## Branches

```
<type>/<kebab-case-summary>
```

`feat/patient-timeline`, `fix/office-scope-leak`. The type vocabulary is the
same as for commits.

Two branches are long-lived:

| Branch | Role |
| ------ | ---- |
| `main` | The principal branch. Release state. Nothing is committed to it directly. |
| `development` | The working branch. Every other branch is cut from it and merged back into it. |

Branch from `development` and open the pull request against it. `development`
reaches `main` as a deliberate promotion, not as routine traffic.

One branch per unit of work. If a branch grows a second unrelated change,
that is a second branch — the review that catches something is the one where
the reviewer can hold the whole diff in their head.

## Commits

```
<type>: <lowercase summary of the work done>
```

- **One line.** A body is rare and reserved for a mechanism the diff cannot
  explain by itself. Exactly one commit in this repository's history has one,
  and it earns it.
- **No trailers.** No `Co-Authored-By`, no `Signed-off-by`.
- **No scope parens.** `feat: …`, not `feat(web): …`.
- **Present tense, no trailing period.** Describe what the commit does.
- Keep it under roughly 100 characters. Prefer a specific long subject to a
  vague short one: `feat: audit denied phi access and make the audit event a
  typed record` says more than `feat: fix audit`.

| type | for |
| --- | --- |
| `feat` | new behaviour, or a change to existing behaviour |
| `fix` | a defect corrected |
| `refactor` | structure changed, behaviour identical |
| `docs` | documentation and ADRs only |
| `chore` | tooling, config, dependencies |
| `test` | tests added or changed on their own |

**Commit the work, not the session.** One commit per coherent change, so
`git log --oneline` reads as a list of decisions rather than a transcript. A
schema change, its migration, and the tests that cover it belong together; a
refactor and a behaviour change do not.

## Pull requests

**Title** takes the commit format. **Description** covers three things:

1. **What changed**, in a sentence or two.
2. **Why** — and if the reasoning would not survive someone asking "why is this
   like this?" six months from now, it belongs in an ADR, not only in the PR.
3. **How it was verified.** Not "tests pass" — CI says that. What did you run,
   and what did you see? The habit that matters here is checking that a new
   guard actually fails when it should: a test that passes with and without
   your change is not testing your change.

### Before opening it

```bash
pnpm turbo run lint typecheck test build   # what CI's verify job runs
pnpm check:graph                           # the generate ordering guard
pnpm smoke                                 # the built app, end to end
```

If you touched `packages/db`, its schema, or a mapper, also run the integration
suite against a scratch database — see [Tests](README.md#tests). If you changed
the schema, the migration is part of the same commit; `prisma db push` is not
part of any workflow here.

### Add an ADR when you decide something

`docs/adr/` holds one decision per file, numbered permanently because code
comments cite them ("ADR 3"). Write one when the obvious alternative is wrong
for a reason that is not obvious — that is most of what makes this codebase
navigable. Superseding an ADR means a new file and a note on the old one, never
a renumbering.

### Never in a pull request

- A secret, in any form — including a real connection string in a test fixture,
  a CI literal, or a Docker build argument. See
  [ADR 24](docs/adr/024-variables-and-secrets.md).
- **Real patient data.** Fixtures are invented. This applies to test data, seed
  scripts, screenshots in a PR description, and error output pasted into a
  comment.
- A disabled lint fence. The three import boundaries in
  `apps/web/eslint.config.mjs` — no `next/*` in the server layer, no
  `@fastehr/db` outside it, no app imports in `components/ui` — exist because
  each guards something that fails silently. If one is in your way, that is
  worth a conversation, not an inline disable.

## Review

Reviewers are looking for the same things the repo's guards are: a boundary
crossed, a value that type-checks and is wrong, a claim made without being
checked. A PR that says what it verified and how is faster to review than one
that says it works.
