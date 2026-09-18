"use client"

import { CheckIcon } from "lucide-react"

import { Field, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"

export const DOSES = ["0.25 mg", "0.5 mg", "1.0 mg", "1.7 mg", "2.4 mg", "5 mg", "7.5 mg"] as const

/**
 * The dose list is short and fixed, so it is laid out rather than hidden
 * behind a second dropdown: the Aug 7 sync's complaint about prescribing was
 * the number of menus it took to write a routine one. Shared by the refill
 * request and the consultation's prescription.
 */
export function DosePicker({ value, onChange }: { value: string; onChange: (dose: string) => void }) {
  return (
    <Field>
      <FieldLabel>Dose</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {DOSES.map((d) => {
          const selected = d === value
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              aria-pressed={selected}
              className={cn(
                "flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium tabular-nums transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                selected
                  ? "border-primary bg-accent text-accent-foreground ring-2 ring-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {selected && <CheckIcon className="size-3.5" />}
              {d}
            </button>
          )
        })}
      </div>
    </Field>
  )
}
