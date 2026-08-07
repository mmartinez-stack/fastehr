"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Dashboard", href: "/queues" },
  { label: "All", href: "/queues?view=all" },
  { label: "Start Treatment", href: "/queues/start-treatment" },
]

export function QueueSubnav({ active }: { active?: string }) {
  const pathname = usePathname()
  return (
    <div className="mb-4 flex w-fit items-center gap-1 rounded-lg border border-border bg-card p-1">
      {TABS.map((tab) => {
        const isActive = active
          ? tab.label === active
          : tab.href === "/queues" && pathname === "/queues"
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
