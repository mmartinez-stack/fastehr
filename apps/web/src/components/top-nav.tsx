"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutGrid,
  CalendarDays,
  Users,
  PhoneCall,
  Inbox,
  MessageSquareText,
  BarChart3,
  Settings,
  UserCog,
  LogOut,
  HeartPulse,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOffice } from "@/components/office-provider"
import { useRole, surfacesFor, type RoleSurfaces } from "@/components/role-provider"
import { authClient } from "@/lib/auth-client"
import type { Role } from "@/lib/mock-data"

/**
 * `surface` is the half of the application an entry belongs to; an entry
 * without one is common ground every role needs. Filtering navigation is the
 * visible half of the provider/administrative split — the screens themselves
 * do the rest. DIA-18 writes this model up properly.
 */
const NAV: {
  label: string
  href: string
  icon: typeof LayoutGrid
  surface?: keyof RoleSurfaces
}[] = [
  { label: "Queues", href: "/queues", icon: LayoutGrid, surface: "clinical" },
  { label: "Schedule", href: "/schedule", icon: CalendarDays },
  { label: "Patients", href: "/patients", icon: Users },
  { label: "Callbacks", href: "/callbacks", icon: PhoneCall, surface: "clerical" },
  { label: "RFI", href: "/rfi", icon: Inbox, surface: "clerical" },
  { label: "SMS", href: "/sms", icon: MessageSquareText, surface: "clerical" },
  { label: "Reports", href: "/reports", icon: BarChart3, surface: "staff" },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Users", href: "/users", icon: UserCog, surface: "staff" },
]

export function TopNav() {
  const pathname = usePathname()
  const { office, offices, setOffice } = useOffice()
  const { role, roles, setRole } = useRole()
  const router = useRouter()

  async function signOut() {
    // Server-side invalidation first; the redirect is just the exit.
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  const surfaces = surfacesFor(role)
  const nav = NAV.filter((item) => !item.surface || surfaces[item.surface])

  return (
    <header className="sticky top-0 z-40 border-b border-primary/60 bg-primary text-primary-foreground shadow-sm">
      <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
        <Link href={nav[0]?.href ?? "/patients"} className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground/15 text-primary-foreground ring-1 ring-primary-foreground/20">
            <HeartPulse className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-primary-foreground">
            Fastehr
          </span>
        </Link>

        <nav className="mx-auto hidden items-center gap-0.5 lg:flex">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-foreground text-primary"
                    : "text-primary-foreground/75 hover:bg-primary-foreground/15 hover:text-primary-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {/*
            Mockup-only. A real session carries one role and does not offer to
            change it; this exists so a walkthrough can show the same screen
            from both sides without two logins. See RoleProvider.
          */}
          <div className="hidden items-center gap-2 xl:flex">
            <span className="text-xs font-medium text-primary-foreground/75">
              Viewing as
            </span>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger
                aria-label="Viewing as role"
                className="w-[170px] border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground"
                size="sm"
              >
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={office} onValueChange={(v) => setOffice(v as typeof office)}>
            <SelectTrigger
              className="w-[130px] border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground"
              size="sm"
            >
              <SelectValue placeholder="Office" />
            </SelectTrigger>
            <SelectContent>
              {offices.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Log out"
            className="text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground"
            onClick={signOut}
          >
            <LogOut />
          </Button>
        </div>
      </div>

      {/* Mobile / tablet nav */}
      <nav className="flex items-center gap-0.5 overflow-x-auto border-t border-primary-foreground/15 px-2 py-1 lg:hidden">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-foreground text-primary"
                  : "text-primary-foreground/75 hover:bg-primary-foreground/15 hover:text-primary-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
