"use client"

import type { Office } from "@fastehr/contracts"
import * as React from "react"

/**
 * Which site the user is currently looking at.
 *
 * The permitted set is a **prop, supplied by the server**, not a constant this
 * component reaches for. That inversion is the point: an office is an
 * authorization boundary, and this provider used to pick both the list and the
 * default ("Downtown") on the client, which made the browser the authority on
 * what its user may see.
 *
 * What this still is not: enforcement. A selection made here is a convenience,
 * and the server re-checks every office-scoped request against the actor
 * (`officeScopedProcedure`). Narrowing the list here only stops honest users
 * asking for what they cannot have — see ADR 22.
 */
interface OfficeContextValue {
  /** The site in view. */
  office: Office
  /** Every site this user may view, as granted by the server. */
  offices: readonly Office[]
  setOffice: (o: Office) => void
}

const OfficeContext = React.createContext<OfficeContextValue | null>(null)

export function OfficeProvider({
  offices,
  children,
}: {
  offices: readonly Office[]
  children: React.ReactNode
}) {
  const [office, setOfficeState] = React.useState<Office | undefined>(offices[0])

  const setOffice = React.useCallback(
    (next: Office) => {
      // Ignore a site the server did not grant. Defence in depth only — the
      // request would be refused anyway — but it keeps the invariant readable
      // where the state lives.
      if (offices.includes(next)) setOfficeState(next)
    },
    [offices],
  )

  if (office === undefined) {
    // An actor scoped to no site has nothing to show, and the alternative is
    // inventing a default — which is the bug this component used to have.
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-sm text-muted-foreground">
        No clinic sites are assigned to this account.
      </div>
    )
  }

  return (
    <OfficeContext.Provider value={{ office, offices, setOffice }}>
      {children}
    </OfficeContext.Provider>
  )
}

export function useOffice() {
  const ctx = React.useContext(OfficeContext)
  if (!ctx) throw new Error("useOffice must be used within OfficeProvider")
  return ctx
}
