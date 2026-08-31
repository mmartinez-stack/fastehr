"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SignedBadge } from "@/components/status-badges"
import { fmtDateLong, fmtDateTime, bmi, type Visit } from "@/lib/mock-data"
import { PenLineIcon, TruckIcon, CameraIcon } from "lucide-react"

export function VisitRecords({
  visits,
  heightIn,
  currentUser,
}: {
  visits: Visit[]
  heightIn: number
  currentUser: string
}) {
  const [signedIds, setSignedIds] = useState<Record<string, string>>({})

  function sign(v: Visit) {
    setSignedIds((prev) => ({ ...prev, [v.id]: currentUser }))
    toast.success(`Visit note signed as ${currentUser}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {visits.map((v) => {
        const locallySigned = signedIds[v.id]
        const isSigned = v.signed || Boolean(locallySigned)
        const signedByName = v.signedBy ?? locallySigned
        const b = v.weight ? bmi(v.weight, heightIn) : 0

        return (
          <article
            key={v.id}
            className="rounded-lg border border-border bg-card"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="font-semibold">On: {fmtDateLong(v.date)}</span>
                <span className="text-muted-foreground">
                  Weight: <span className="font-medium text-foreground">{v.weight ? `${v.weight} lbs` : "-"}</span>
                </span>
                <span className="text-muted-foreground">
                  BMI: <span className="font-medium text-foreground">{b || "-"}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{v.type}</Badge>
                <SignedBadge signed={isSigned} />
              </div>
            </header>

            <div className="flex flex-col gap-3 px-4 py-3">
              {v.meds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {v.meds.map((m, i) => (
                    <span
                      key={i}
                      className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium"
                    >
                      {m.name} {m.dosage}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-sm leading-relaxed text-pretty">{v.notes}</p>

              {v.tracking && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TruckIcon className="size-3.5" />
                  Tracking: <span className="font-mono">{v.tracking}</span>
                </p>
              )}

              <Separator />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  <span>Opened on {v.openedAt ? fmtDateTime(v.openedAt) : fmtDateLong(v.date)}</span>
                  {isSigned && signedByName && v.signedAt && (
                    <span>
                      Signed by {signedByName} on {fmtDateTime(v.signedAt)}
                    </span>
                  )}
                  {isSigned && signedByName && !v.signedAt && (
                    <span>Signed by {signedByName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {v.photo && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CameraIcon className="size-3.5" />
                      Photo on file
                    </span>
                  )}
                  {!isSigned && (
                    <Button variant="outline" size="sm" onClick={() => sign(v)}>
                      <PenLineIcon data-icon="inline-start" />
                      Sign as {currentUser}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
