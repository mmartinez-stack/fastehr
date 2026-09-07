"use client"

import * as React from "react"

import { STAFF_ROLES, type StaffRole } from "@fastehr/contracts"

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
 * One demonstration device survives from the mockup: an **admin** may switch
 * the view to preview what a provider or the front desk sees. Only an admin,
 * because an admin is entitled to every section server-side, so a preview
 * can never run into a FORBIDDEN it would not otherwise get. For any other
 * role the switcher does not render and `setRole` is inert.
 */
interface RoleContextValue {
  /** The role whose view is rendered. */
  role: StaffRole
  /** Every role the switcher offers — the full vocabulary. */
  roles: readonly StaffRole[]
  /** Whether this session may preview other roles' views (admins only). */
  canSwitch: boolean
  /** The session's medical-director flag (DIA-74) — a flag, not a role, and never previewed. */
  medicalDirector: boolean
  setRole: (r: StaffRole) => void
}

const RoleContext = React.createContext<RoleContextValue | null>(null)

export function RoleProvider({
  sessionRole,
  medicalDirector = false,
  children,
}: {
  /** The session's role from the server; `null` only for an anonymous render. */
  sessionRole: StaffRole | null
  medicalDirector?: boolean
  children: React.ReactNode
}) {
  // Anonymous renders (the login redirect is already in flight) get the
  // least-exposing view rather than a guess at a wider one.
  const actual = sessionRole ?? "provider"
  const canSwitch = sessionRole === "admin"
  const [preview, setPreview] = React.useState<StaffRole>(actual)

  const value = React.useMemo(
    () => ({
      role: canSwitch ? preview : actual,
      roles: STAFF_ROLES,
      canSwitch,
      medicalDirector,
      setRole: (next: StaffRole) => {
        if (canSwitch) setPreview(next)
      },
    }),
    [actual, canSwitch, medicalDirector, preview],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = React.useContext(RoleContext)
  if (!ctx) throw new Error("useRole must be used within RoleProvider")
  return ctx
}

/**
 * What a role's view is made of.
 *
 * Three surfaces rather than a permission per screen: the sync described one
 * division — clinical record against clerical record — and a matrix of
 * per-screen flags would encode more structure than the decision behind it
 * contains. `staff` is the third only because clinic-wide reporting and staff
 * accounts sit in neither half. The server-enforced matrix is
 * docs/roles-matrix.md; this stays coarse to match it.
 */
export interface RoleSurfaces {
  /** Charting, visit records, weight history, prescribing. */
  clinical: boolean
  /** Contact details, consent forms, scheduling, billing, outreach. */
  clerical: boolean
  /** Staff accounts and clinic-wide reporting. */
  staff: boolean
}

export function surfacesFor(role: StaffRole): RoleSurfaces {
  switch (role) {
    case "provider":
      return { clinical: true, clerical: false, staff: false }
    case "frontdesk":
      return { clinical: false, clerical: true, staff: false }
    case "admin":
      return { clinical: true, clerical: true, staff: true }
  }
}

/** Convenience for screens that only need to branch, not destructure. */
export function useSurfaces(): RoleSurfaces & { role: StaffRole } {
  const { role } = useRole()
  return { role, ...surfacesFor(role) }
}
