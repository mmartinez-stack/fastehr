# ADR 31 — The medical director is a role with the administrator's access, and the queue lives on the Queues page

**Status:** accepted (amends ADR 30)  
**Applies to:** `packages/contracts/src/staff-role.ts` · `packages/db/prisma/schema.prisma` · `apps/web/src/server/middleware/auth.ts` · `apps/web/src/server/guards.ts` · `apps/web/src/components/role-provider.tsx` · `apps/web/src/features/review/medical-director-queue.tsx`

ADR 30 shipped the review queue behind a per-account flag, `medicalDirector`,
on the reasoning that Dr. Penn is a provider who also reviews. The 2026-09-07
direction reversed that: the medical director is a **role**, an account has
exactly one role, the role carries **everything an administrator has** plus
the review queue, and the queue is a component of the Queues page rather
than a page of its own.

## Decisions

- **A fourth value in `staff_role`: `medical_director`.** The enum grows by
  one value (`ALTER TYPE … ADD VALUE`) and the flag column is dropped in the
  same migration; it was introduced on the same branch and no account held
  it. No existing account's role changes. Dr. Penn is assigned the role by
  an admin from the Users screen after deploy, by hand, since the legacy
  `reviewer` flag was never a role and is not mapped automatically.
- **One access matrix, in contracts.** `ROLE_ACCESS` maps every role to the
  four surfaces, `clinical`, `clerical`, `staff`, and `review`. The tRPC
  middleware (`requireSurface`), the page guard (`guardPage(surface)`), and
  the client's navigation and tabs (`surfacesFor`) all read that table. No
  router, guard, or component compares role names, and a role or surface the
  table does not name is denied. `medical_director` is `true` on all four;
  `admin` on all but `review`.
- **The queue is a card on `/queues`**, titled "Medical Director Review
  Queue", full width above the clinic queues, with the sampling run inside
  it. It renders only when both the previewed role and the session's own
  role have `review`, so an admin previewing the medical director's view
  sees no card rather than a refused call. The note and its sign-off stay at
  `/review/[visitId]` and return to `/queues`.
- **The "Viewing as" preview** is offered to any role with `staff` access,
  admin and medical director, and lists all four roles.

## Why a role and not the flag

A flag orthogonal to the role made "who can do what" a two-variable
question, which the roles matrix and every page guard then had to answer
twice. The stakeholder's model is simpler: one role per person, and the
medical director is the administrator with one more queue. The matrix
encodes that as a strict superset, and a test pins it.

## Consequences

- `staffUsers.create/update` no longer take a flag; the role picker offers
  the four roles.
- The sampling run (`review.runSample`) is a `staff` action, so the medical
  director can run it as well as an admin.
- ADR 30's "a flag" is superseded by this record; its sampling window and
  on-the-note review decisions stand.
