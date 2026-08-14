"use client"

import { CheckIcon, PillIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { topMedications, remainingMedications } from "@/lib/mock-data"

const QUICK_PICK_COUNT = 4

/**
 * Medication selection, quick picks first.
 *
 * The Aug 7 sync called the old flow dropdown-heavy: every prescription, however
 * routine, cost the same three interactions as an unusual one. The fix is not a
 * shorter dropdown but a shorter path for the common case — the handful of
 * medications this clinic actually prescribes sit on the surface as one-click
 * targets, and the dropdown stays behind them for the tail.
 *
 * The quick picks are ranked from prescribing data rather than hardcoded; see
 * `medicationsByFrequency` for why that matters and what still has to be
 * decided about the window it covers.
 *
 * Selection is marked three ways — a check icon, a ring, and `aria-pressed` —
 * because DIA-22 does not accept colour as the only cue, and a prescribing
 * control is a poor place to start.
 */
export function MedicationPicker({
  value,
  onChange,
  id = "medication",
}: {
  value: string
  onChange: (medication: string) => void
  id?: string
}) {
  const quickPicks = topMedications(QUICK_PICK_COUNT)
  const rest = remainingMedications(QUICK_PICK_COUNT)
  const selectedFromRest = rest.includes(value)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">Medication</span>
          <span className="text-xs text-muted-foreground">
            Most prescribed, in order
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {quickPicks.map((m) => {
            const selected = m.name === value
            return (
              <button
                key={m.name}
                type="button"
                onClick={() => onChange(m.name)}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected
                    ? "border-primary bg-accent ring-2 ring-primary"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <PillIcon className="size-3.5 text-primary" />
                    {m.name}
                  </span>
                  {selected ? (
                    <CheckIcon className="size-4 shrink-0 text-primary" />
                  ) : (
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      #{m.rank}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {m.count} prescribed
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {rest.length > 0 && (
        <Field>
          <FieldLabel htmlFor={id}>Other medication</FieldLabel>
          <Select
            value={selectedFromRest ? value : ""}
            onValueChange={(v) => onChange(v as string)}
            items={rest.map((m) => ({ label: m, value: m }))}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue placeholder="Search the full formulary…" />
            </SelectTrigger>
            <SelectContent>
              {rest.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </div>
  )
}
