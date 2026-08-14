import Link from "next/link"
import { FileWarningIcon, FileCheck2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PendingWaiver } from "@/lib/mock-data"

/**
 * Waivers pending, as a column.
 *
 * The Aug 7 sync asked for this specifically: the pending consent forms used
 * to run across the top of the patient screen as a one-line alert, which gave
 * a list with no natural length a slot with a fixed one — three outstanding
 * forms read as a sentence fragment and ten would have wrapped into the
 * layout. A column takes a list of any length, keeps the oldest at the top,
 * and leaves room for the age of each one, which is the thing that decides
 * which form gets chased today.
 *
 * Longest-waiting first, and the wait is stated in text next to a bar — per
 * DIA-22, the urgency of a row is never carried by its colour alone.
 */
export function WaiversColumn({
  waivers,
  /** Shown when the column is scoped to one patient, where names would repeat. */
  showPatient = true,
  title = "Waivers pending",
  emptyMessage = "Every consent form on file.",
}: {
  waivers: PendingWaiver[]
  showPatient?: boolean
  title?: string
  emptyMessage?: string
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileWarningIcon className="size-4 text-warning-foreground" />
            {title}
          </CardTitle>
          <Badge variant="ghost" className="bg-warning/15 text-warning-foreground">
            {waivers.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {waivers.length === 0 ? (
          <p className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground">
            <FileCheck2Icon className="size-4 text-success" />
            {emptyMessage}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {waivers.map((w, i) => (
              <li
                key={`${w.patientId}-${w.consent}-${i}`}
                className="flex flex-col gap-1.5 px-6 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {w.consent}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {w.daysWaiting}d
                  </span>
                </div>

                {showPatient && (
                  <Link
                    href={`/patients/${w.patientId}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {w.patientName}
                  </Link>
                )}

                {/* Age as a bar, capped at four weeks — the text above it
                    carries the same value for anyone the bar does not reach. */}
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <div
                    className={
                      w.daysWaiting >= 14 ? "h-full bg-destructive" : "h-full bg-warning"
                    }
                    style={{ width: `${Math.min(100, (w.daysWaiting / 28) * 100)}%` }}
                  />
                </div>

                <div className="flex items-center gap-1 pt-0.5">
                  <Button variant="outline" size="xs">
                    Send form
                  </Button>
                  <Button variant="ghost" size="xs">
                    Mark received
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
