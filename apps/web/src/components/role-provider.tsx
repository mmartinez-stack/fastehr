"use client"

import * as React from "react"

import { STAFF_ROLES, type StaffRole } from "@fastehr/contracts"

/**
 * Which role's view of the application is on screen.
 *
 * The vocabulary is the real one — `StaffRole` from contracts, the same enum
 * the database enforces — so the switcher's options are exactly the roles an
 * account can hold. The Aug 7 sync split the interface in two: a provider
 * sees the clinical record, the front desk sees the clerical one, and an
 * admin sees both. That split is the subject of this mockup, so the mockup
 * has to be able to show it — hence a switcher, in the header, that a
 * stakeholder can flip during a walkthrough.
 *
 * **This is a demonstration device, not a security boundary, and the
 * distinction is not a nuance.** The role lives in client state where the
 * viewer can set it to anything, every screen still renders from the same mock
 * fixtures, and nothing is withheld — the administrative view is one click
 * away from the provider view by design. Real scoping needs the role model
 * (DIA-29) underneath it and enforcement in the server layer (M3), at which
 * point this provider is replaced by the session's actual role rather than
 * extended. Nothing downstream should come to depend on it as though it
 * decided anything.
 */
interface RoleContextValue {
  /** The role whose view is rendered. */
  role: StaffRole
  /** Every role the switcher offers — the full vocabulary. */
  roles: readonly StaffRole[]
  setRole: (r: StaffRole) => void
}

const RoleContext = React.createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = React.useState<StaffRole>("provider")

  const value = React.useMemo(
    () => ({ role, roles: STAFF_ROLES, setRole }),
    [role],
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
 * accounts sit in neither half. DIA-25 produces the real matrix; this stays
 * coarse until it does.
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
