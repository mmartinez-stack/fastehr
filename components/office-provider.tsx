"use client"

import * as React from "react"
import type { Office } from "@/lib/mock-data"

interface OfficeContextValue {
  office: Office
  setOffice: (o: Office) => void
}

const OfficeContext = React.createContext<OfficeContextValue | null>(null)

export function OfficeProvider({ children }: { children: React.ReactNode }) {
  const [office, setOffice] = React.useState<Office>("Downtown")
  return (
    <OfficeContext.Provider value={{ office, setOffice }}>
      {children}
    </OfficeContext.Provider>
  )
}

export function useOffice() {
  const ctx = React.useContext(OfficeContext)
  if (!ctx) throw new Error("useOffice must be used within OfficeProvider")
  return ctx
}
