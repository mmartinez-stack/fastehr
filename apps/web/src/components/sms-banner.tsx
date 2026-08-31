"use client"

import * as React from "react"
import Link from "next/link"
import { MessageSquareText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSurfaces } from "@/components/role-provider"

export function SmsBanner() {
  const [dismissed, setDismissed] = React.useState(false)
  const { clerical } = useSurfaces()
  // Inbound patient texts are front-desk work; a provider charting a visit is
  // not the person who answers them.
  if (dismissed || !clerical) return null

  return (
    <div className="border-b border-primary/20 bg-accent">
      <div className="flex items-center gap-3 px-4 py-2 text-sm lg:px-6">
        <MessageSquareText className="size-4 shrink-0 text-primary" />
        <Link
          href="/sms/s1"
          className="flex-1 truncate font-medium text-accent-foreground hover:underline"
        >
          New text from Maria Gonzalez. Tap to open conversation
        </Link>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss notification"
          onClick={() => setDismissed(true)}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}
