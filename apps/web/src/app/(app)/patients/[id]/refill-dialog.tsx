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
import { topMedications } from "@/lib/mock-data"
import { PillIcon } from "lucide-react"
import { toast } from "sonner"
import { DosePicker } from "./dose-picker"
import { MedicationPicker } from "./medication-picker"

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
          <Button variant="outline" size="lg">
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

          <DosePicker value={dose} onChange={setDose} />

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
