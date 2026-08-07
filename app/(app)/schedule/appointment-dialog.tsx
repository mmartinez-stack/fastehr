"use client"

import * as React from "react"
import { Trash2, Save } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Badge } from "@/components/ui/badge"
import {
  PROVIDERS,
  patients,
  fullName,
  type Appointment,
} from "@/lib/mock-data"

const apptTypeColor: Record<string, string> = {
  Initial: "bg-[var(--appt-initial)] text-[var(--appt-initial-foreground)]",
  "Follow-up": "bg-[var(--appt-followup)] text-[var(--appt-followup-foreground)]",
  "At-Home": "bg-[var(--appt-athome)] text-[var(--appt-athome-foreground)]",
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AppointmentDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: Appointment | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const isNew = !appointment
  const type = appointment?.type ?? "Initial"
  const patientNames = patients.map((p) => fullName(p))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isNew ? "New Appointment" : "Edit Appointment"}
            <Badge className={apptTypeColor[type]}>{type}</Badge>
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Create a new appointment in this time slot."
              : "Update the details for this appointment."}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="start">Start</FieldLabel>
              <Input
                id="start"
                type="datetime-local"
                defaultValue={
                  appointment ? toLocalInput(appointment.start) : "2025-08-04T09:00"
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="end">End</FieldLabel>
              <Input
                id="end"
                type="datetime-local"
                defaultValue={
                  appointment ? toLocalInput(appointment.end) : "2025-08-04T09:45"
                }
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Appointment type</FieldLabel>
            <p className="text-sm font-medium text-foreground">{type}</p>
          </Field>

          {type === "Initial" ? (
            <Field>
              <FieldLabel htmlFor="interested">Interested in</FieldLabel>
              <Input
                id="interested"
                defaultValue={appointment?.interestedIn ?? ""}
                placeholder="e.g. Semaglutide program"
              />
            </Field>
          ) : null}

          <Field>
            <FieldLabel>Provider</FieldLabel>
            <Select defaultValue={appointment?.provider ?? PROVIDERS[0]}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Patient</FieldLabel>
            <Combobox items={patientNames} defaultValue={appointment?.patientName}>
              <ComboboxInput placeholder="Search patients…" className="w-full" />
              <ComboboxContent>
                <ComboboxEmpty>No patients found.</ComboboxEmpty>
                <ComboboxList>
                  {(name: string) => (
                    <ComboboxItem key={name} value={name}>
                      {name}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea
              id="notes"
              rows={2}
              defaultValue={appointment?.notes ?? ""}
              placeholder="Visit notes…"
            />
          </Field>
        </FieldGroup>

        <DialogFooter className="sm:justify-between">
          {!isNew ? (
            <Button
              variant="destructive"
              onClick={() => onOpenChange(false)}
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => onOpenChange(false)}>
              <Save data-icon="inline-start" />
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
