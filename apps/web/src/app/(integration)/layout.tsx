import type React from "react"
import { HeartPulse } from "lucide-react"
import { SignOutButton } from "./sign-out-button"

/**
 * The shell for a partner's account (ADR 36 as amended): a brand line, the
 * word Integration, and Sign out. No navigation, no clinic selector, no role
 * switcher, because there is nothing else for this account to reach; the
 * staff shell redirects the role here, and every staff chain refuses it.
 */
export default function IntegrationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-primary/60 bg-primary text-primary-foreground shadow-sm">
        <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground/15 text-primary-foreground ring-1 ring-primary-foreground/20">
              <HeartPulse className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-primary-foreground">Fastehr</span>
            <span className="text-sm text-primary-foreground/75">Integration</span>
          </span>
          <div className="ml-auto">
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  )
}
