import type React from "react"
import { LocationProvider } from "@/components/location-provider"
import { RoleProvider } from "@/components/role-provider"
import { api } from "@/trpc/server"
import { sessionIdentity } from "@/trpc/session"
import { TopNav } from "@/components/top-nav"
import { SmsBanner } from "@/components/sms-banner"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The server decides who this is and which role's view renders (ADR 28);
  // the clinics on offer are rows read through a procedure, so the list
  // passes auth like everything else (ADR 22, ADR 32). The providers only
  // carry that down.
  const identity = await sessionIdentity()
  // Every clinic, inactive ones too: the filter offers the active ones, and
  // a record from a closed clinic still shows that clinic's name.
  const locations = identity === null ? [] : await api.location.list()

  return (
    <RoleProvider sessionRole={identity?.role ?? null}>
      <LocationProvider locations={locations}>
        <div className="flex min-h-screen flex-col bg-background">
          <TopNav />
          <SmsBanner />
          {/*
            The clinic works on 1920×1080 monitors, and the shell used to cap
            at `max-w-7xl` — 1280px, a third of the screen left as gutter. The
            cap is now just wide enough to keep a line of body text readable
            at the far edge of a 1080p display; individual screens spend the
            width by gaining columns at `3xl`, not by stretching tables.
          */}
          <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </LocationProvider>
    </RoleProvider>
  )
}
