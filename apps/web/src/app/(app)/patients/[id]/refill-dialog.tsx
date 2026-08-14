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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PillIcon } from "lucide-react"
import { toast } from "sonner"

const MEDICATIONS = ["Semaglutide", "Tirzepatide", "Liraglutide", "Phentermine"]
const DOSES = ["0.25 mg", "0.5 mg", "1.0 mg", "1.7 mg", "2.4 mg", "5 mg", "7.5 mg"]

export function RefillDialog({ patientName }: { patientName: string }) {
  const [open, setOpen] = useState(false)

  function submit() {
    setOpen(false)
    toast.success("Refill request submitted", {
      description: `Sent to pharmacy for ${patientName}.`,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Refill</DialogTitle>
          <DialogDescription>Send a new prescription refill to the pharmacy.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Medication</FieldLabel>
            <Select defaultValue="Semaglutide" items={MEDICATIONS.map((m) => ({ label: m, value: m }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDICATIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Dose</FieldLabel>
            <Select defaultValue="0.5 mg" items={DOSES.map((d) => ({ label: d, value: d }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOSES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
