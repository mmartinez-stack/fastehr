"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const VIEWS = ["Week", "Month", "Agenda"] as const

export function ToggleView() {
  const [view, setView] = React.useState<(typeof VIEWS)[number]>("Week")
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            view === v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
