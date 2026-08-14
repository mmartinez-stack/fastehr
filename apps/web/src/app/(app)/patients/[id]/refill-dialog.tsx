"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { topMedications } from "@/lib/mock-data"
import { PillIcon, CheckIcon } from "lucide-react"
import { toast } from "sonner"
import { MedicationPicker } from "./medication-picker"

const DOSES = ["0.25 mg", "0.5 mg", "1.0 mg", "1.7 mg", "2.4 mg", "5 mg", "7.5 mg"]

/** The most-prescribed medication, which is the right thing to open on. */
function defaultMedication(): string {
  return topMedications(1)[0]?.name ?? ""
}

export function RefillDialog({ patientName }: { patientName: string }) {
  const [open, setOpen] = useState(false)
  const [medication, setMedication] = useState(defaultMedication)
  const [dose, setDose] = useState("0.5 mg")

  function submit() {
    setOpen(false)
    toast.success("Refill request submitted", {
      description: `${medication} ${dose} sent to pharmacy for ${patientName}.`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PillIcon data-icon="inline-start" />
            Request Refill
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Refill</DialogTitle>
          <DialogDescription>Send a new prescription refill to the pharmacy.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <MedicationPicker value={medication} onChange={setMedication} />

          {/*
            The dose list is short and fixed, so it is laid out rather than
            hidden behind a second dropdown — the sync's complaint about this
            flow was the number of menus it took to write a routine refill.
          */}
          <Field>
            <FieldLabel>Dose</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {DOSES.map((d) => {
                const selected = d === dose
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDose(d)}
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

          <Field>
            <FieldLabel htmlFor="refill-qty">Quantity (weeks)</FieldLabel>
            <Input id="refill-qty" type="number" defaultValue={4} min={1} max={12} />
          </Field>
          <Field>
            <FieldLabel htmlFor="refill-notes">Notes for pharmacy</FieldLabel>
            <Textarea id="refill-notes" placeholder="Optional instructions..." rows={3} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={submit}>Submit Refill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
