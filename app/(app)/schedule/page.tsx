"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ToggleView } from "./toggle-view"
import { PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"
import { appointments, fmtTime, type Appointment } from "@/lib/mock-data"
import { AppointmentDialog } from "./appointment-dialog"

const START_HOUR = 8
const END_HOUR = 19
const HOUR_PX = 56
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DATES = [4, 5, 6, 7, 8, 9, 10]

const typeStyles: Record<string, string> = {
  Initial: "bg-[var(--appt-initial)] text-[var(--appt-initial-foreground)]",
  "Follow-up": "bg-[var(--appt-followup)] text-[var(--appt-followup-foreground)]",
  "At-Home": "bg-[var(--appt-athome)] text-[var(--appt-athome-foreground)]",
}

function apptDayIndex(iso: string) {
  return new Date(iso).getDate() - 4 // Mon = Aug 4
}

function offsetPx(iso: string) {
  const d = new Date(iso)
  return (d.getHours() - START_HOUR + d.getMinutes() / 60) * HOUR_PX
}

function durationPx(start: string, end: string) {
  return ((+new Date(end) - +new Date(start)) / 3_600_000) * HOUR_PX
}

export default function SchedulePage() {
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Appointment | null>(null)

  const hours = Array.from(
    { length: END_HOUR - START_HOUR + 1 },
    (_, i) => START_HOUR + i,
  )

  function openAppt(a: Appointment) {
    setSelected(a)
    setOpen(true)
  }
  function openEmpty() {
    setSelected(null)
    setOpen(true)
  }

  return (
    <div>
      <PageHeader title="Schedule" description="Week of Aug 4 – 10, 2025">
        <ToggleView />
      </PageHeader>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous week">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm">
            Today
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next week">
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[var(--appt-initial)]" /> Initial
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[var(--appt-followup)]" /> Follow-up
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[var(--appt-athome)]" /> At-Home
          </span>
        </div>
        <Button size="sm" onClick={openEmpty}>
          <Plus data-icon="inline-start" />
          New
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Header row */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border bg-muted/40">
              <div className="border-r border-border" />
              {DAYS.map((d, i) => (
                <div
                  key={d}
                  className="border-r border-border px-2 py-2 text-center last:border-r-0"
                >
                  <div className="text-xs font-medium text-muted-foreground">{d}</div>
                  <div className="text-sm font-semibold text-foreground">
                    Aug {DATES[i]}
                  </div>
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)]">
              {/* Time gutter */}
              <div className="border-r border-border">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="relative border-b border-border/60"
                    style={{ height: HOUR_PX }}
                  >
                    <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground">
                      {h}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {DAYS.map((day, dayIdx) => (
                <div
                  key={day}
                  className="relative border-r border-border last:border-r-0"
                  style={{ height: hours.length * HOUR_PX }}
                >
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={openEmpty}
                      aria-label={`Add appointment ${day} ${h}:00`}
                      className="block w-full border-b border-border/60 transition-colors hover:bg-accent/40"
                      style={{ height: HOUR_PX }}
                    />
                  ))}

                  {appointments
                    .filter((a) => apptDayIndex(a.start) === dayIdx)
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => openAppt(a)}
                        className={cn(
                          "absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-left text-xs shadow-sm ring-1 ring-black/5 transition-transform hover:scale-[1.01]",
                          typeStyles[a.type],
                        )}
                        style={{
                          top: offsetPx(a.start) + 1,
                          height: Math.max(durationPx(a.start, a.end) - 2, 22),
                        }}
                      >
                        <div className="truncate font-semibold">{a.patientName}</div>
                        <div className="truncate opacity-90">
                          {fmtTime(a.start)} · {a.provider}
                        </div>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <AppointmentDialog appointment={selected} open={open} onOpenChange={setOpen} />
    </div>
  )
}
