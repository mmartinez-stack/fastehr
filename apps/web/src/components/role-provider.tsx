"use client"

import * as React from "react"

import { HUMAN_STAFF_ROLES, ROLE_ACCESS, type RoleSurface, type StaffRole } from "@fastehr/contracts"

/**
 * Which role's view of the application is on screen.
 *
 * The role is the **session's**, resolved server-side and passed down by the
 * app layout (ADR 28) — the same `StaffRole` the database enforces. What
 * renders from it is presentation: which tabs, which nav entries, which
 * columns. Enforcement is the server layer's: a provider whose browser
 * somehow asked for the demographics section would be refused there, and
 * the refusal audited. Nothing downstream should treat this context as
 * having decided anything.
 *
 * One demonstration device survives from the mockup: an account with the
 * `staff` surface (admin, medical director) may switch the view to preview
 * what another role sees. Only those, because they are entitled to every
 * section server-side, so a preview can never run into a FORBIDDEN it would
 * not otherwise get — with one exception, the review queue, which is why
 * `useSessionSurfaces` exists. For any other role the switcher does not
 * render and `setRole` is inert.
 */
interface RoleContextValue {
  /** The role whose view is rendered: the session's, or an admin's preview. */
  role: StaffRole
  /** The session's own role; `null` only for an anonymous render. */
  sessionRole: StaffRole | null
  /** Every role the switcher offers — the full vocabulary. */
  roles: readonly StaffRole[]
  /** Whether this session may preview other roles' views. */
  canSwitch: boolean
  setRole: (r: StaffRole) => void
}

const RoleContext = React.createContext<RoleContextValue | null>(null)

export function RoleProvider({
  sessionRole,
  children,
}: {
  /** The session's role from the server; `null` only for an anonymous render. */
  sessionRole: StaffRole | null
  children: React.ReactNode
}) {
  // Anonymous renders (the login redirect is already in flight) get the
  // least-exposing view rather than a guess at a wider one.
  const actual = sessionRole ?? "provider"
  const canSwitch = sessionRole !== null && ROLE_ACCESS[sessionRole].staff
  const [preview, setPreview] = React.useState<StaffRole>(actual)

  const value = React.useMemo(
    () => ({
      role: canSwitch ? preview : actual,
      sessionRole,
      // The switcher previews people's views; an integration principal (ADR 36) has none.
      roles: HUMAN_STAFF_ROLES,
      canSwitch,
      setRole: (next: StaffRole) => {
        if (canSwitch) setPreview(next)
      },
    }),
    [actual, canSwitch, preview, sessionRole],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = React.useContext(RoleContext)
  if (!ctx) throw new Error("useRole must be used within RoleProvider")
  return ctx
}

/**
 * What a role's view is made of: the four surfaces of the access matrix in
 * `@fastehr/contracts` (ADR 31), read here so the client and the server
 * answer from the same table. `clinical` is charting and the Medical tab;
 * `clerical` is contact details, consent, scheduling, billing, outreach;
 * `staff` is staff accounts and clinic-wide reporting; `review` is the
 * medical director's queue.
 */
export type RoleSurfaces = Readonly<Record<RoleSurface, boolean>>

export function surfacesFor(role: StaffRole): RoleSurfaces {
  return ROLE_ACCESS[role]
}

/** Convenience for screens that only need to branch, not destructure. */
export function useSurfaces(): RoleSurfaces & { role: StaffRole } {
  const { role } = useRole()
  return { role, ...surfacesFor(role) }
}

const NO_ACCESS: RoleSurfaces = { clinical: false, clerical: false, staff: false, review: false }

/**
 * The session's own surfaces, never a preview's. For the one thing a preview
 * cannot fake: a call the server would refuse the real session, such as the
 * review queue. A screen renders such a thing only when both the previewed
 * role and the session have it.
 */
export function useSessionSurfaces(): RoleSurfaces {
  const { sessionRole } = useRole()
  return sessionRole === null ? NO_ACCESS : ROLE_ACCESS[sessionRole]
}
