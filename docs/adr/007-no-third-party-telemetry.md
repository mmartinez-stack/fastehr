# ADR 7 — No third-party telemetry on PHI-bearing routes

**Status:** accepted  
**Applies to:** `apps/web/src/app/layout.tsx`

The root layout mounts no analytics. `@vercel/analytics` came in with the v0
mockup and has been removed, along with the `generator: 'v0.app'` metadata tag.

**Why:** route paths in this app are patient identifiers —
`/patients/[id]`, `/queues/start-treatment/[id]`. A page-view beacon reports the
URL by construction, so shipping paths to a third party discloses which patient
records were opened, and when. That is a disclosure question with a
business-associate answer attached, not a metrics preference, and it is far
cheaper to decide now than to unpick from a vendor's retained data later.

`next/font` is not an exception to this: it downloads Inter at build time and
serves it from this origin, so no request reaches Google from a patient's
browser. Nothing else in `src/` references an external host.

**If product analytics are wanted later**, the shape that survives this
constraint is server-side and aggregate — counts of *events* emitted from
procedures, which already run behind auth and audit, rather than a client
beacon that reports whatever is in the address bar. Anything client-side needs a
signed BAA and path scrubbing before it goes anywhere near these routes.

Next's own build telemetry is a separate, build-time concern and collects no
request URLs; disable it with `NEXT_TELEMETRY_DISABLED=1` if that is wanted for
tidiness.
