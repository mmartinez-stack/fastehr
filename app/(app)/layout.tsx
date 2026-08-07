import type React from "react"
import { OfficeProvider } from "@/components/office-provider"
import { TopNav } from "@/components/top-nav"
import { SmsBanner } from "@/components/sms-banner"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <OfficeProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <TopNav />
        <SmsBanner />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>
    </OfficeProvider>
  )
}
