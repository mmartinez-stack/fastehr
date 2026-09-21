"use client"

import { useState } from "react"
import {
  CalendarPlusIcon,
  ClipboardListIcon,
  CreditCardIcon,
  DollarSignIcon,
  MailIcon,
  PaperclipIcon,
  PenLineIcon,
  SaveIcon,
  PillIcon,
  PlusIcon,
  PrinterIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useSurfaces } from "@/components/role-provider"
import {
  bmi,
  OFFICES,
  PAYMENT_METHODS,
  PROGRAM_FEES,
  topMedications,
  VISIT_DISCOUNTS,
  VISIT_FEES,
  type ApptType,
  type MedDose,
  type Office,
  type Patient,
  type PricedOption,
  type Visit,
} from "@/lib/mock-data"
import { DosePicker, DOSES } from "./dose-picker"
import { MedicationPicker } from "./medication-picker"

const usd = (n: number) => `$${n.toLocaleString("en-US")}`
const today = () => new Date().toISOString().slice(0, 10)

/**
 * The consultation, opened from the record (the 2026-09-14 review), laid out
 * as the legacy visit form was: four sections, split by who fills them.
 *
 * - Visit info and Prescription are the consultation: the vitals, the note,
 *   and what was prescribed, for the clinical surface, signed by the
 *   provider who wrote them.
 * - Billing and Admin are the front desk's: pricing and payment, the
 *   follow-up, the fax to the primary doctor, and the attachments, for the
 *   clerical surface. A provider does not see them; an administrator sees
 *   all four.
 *
 * The legacy form let a clerk prescribe as well ("doc|admin|clerk"); this
 * keeps prescribing clinical, which is the division ADR 28 draws. Mockup on
 * fixtures: saving adds the visit to the records on screen and nowhere else.
 */
export function ConsultationForm({
  patient,
  visitCount,
  currentUser,
  onSave,
  onCancel,
}: {
  patient: Patient
  /** How many visits the patient has, so the first one is typed Initial. */
  visitCount: number
  currentUser: string
  onSave: (visit: Visit) => void
  onCancel: () => void
}) {
  const { clinical, clerical } = useSurfaces()

  // Visit info
  const [date, setDate] = useState(today)
  const [office, setOffice] = useState<Office>(patient.office)
  const [weight, setWeight] = useState("")
  const [systolic, setSystolic] = useState("")
  const [diastolic, setDiastolic] = useState("")
  const [phoneVisit, setPhoneVisit] = useState(false)
  const [mailingCompleted, setMailingCompleted] = useState(false)
  const [notes, setNotes] = useState("")

  // Prescription
  const [medication, setMedication] = useState(() => topMedications(1)[0]?.name ?? "")
  const [dose, setDose] = useState<string>(DOSES[1])
  const [prescribed, setPrescribed] = useState<MedDose[]>([])

  // Billing
  const [fee, setFee] = useState<PricedOption>(VISIT_FEES[0] ?? { name: "None", amount: 0 })
  const [discount, setDiscount] = useState<PricedOption>(VISIT_DISCOUNTS[0] ?? { name: "None", amount: 0 })
  const [program, setProgram] = useState<PricedOption>(PROGRAM_FEES[0] ?? { name: "None", amount: 0 })
  const [coupon, setCoupon] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<Visit["paymentMethod"]>("Card")
  const [welcomePackage, setWelcomePackage] = useState(patient.atHome)
  const [paid, setPaid] = useState(false)

  // Admin
  const [followUpDate, setFollowUpDate] = useState("")
  const [followUpTime, setFollowUpTime] = useState("10:00")
  const [faxNumber, setFaxNumber] = useState("")
  const [faxNote, setFaxNote] = useState("")
  const [attachments, setAttachments] = useState<string[]>([])

  const weightLbs = Number(weight)
  const computedBmi = weight === "" || !Number.isFinite(weightLbs) ? null : bmi(weightLbs, patient.heightIn)
  const subtotal = fee.amount + program.amount
  const total = Math.max(0, subtotal - discount.amount)
  const type: ApptType = visitCount === 0 ? "Initial" : patient.atHome ? "At-Home" : "Follow-up"

  function addPrescription() {
    if (medication === "") return
    setPrescribed((prev) => [...prev.filter((m) => m.name !== medication), { name: medication, dosage: dose }])
  }

  function build(signed: boolean): Visit {
    const now = new Date().toISOString()
    const bp = Number(systolic)
    const dp = Number(diastolic)
    return {
      id: `new-${Date.now()}`,
      patientId: patient.id,
      date,
      type,
      weight: computedBmi === null ? 0 : weightLbs,
      bloodPressure: systolic !== "" && diastolic !== "" ? { systolic: bp, diastolic: dp } : undefined,
      meds: prescribed,
      provider: currentUser,
      // A visit a clinician opened is a clinical record; one the front desk
      // opened alone (to bill or to book) is an administrative one.
      author: clinical ? "provider" : "administrative",
      addenda: [],
      noShow: false,
      phoneVisit,
      mailingCompleted: phoneVisit && mailingCompleted,
      signed,
      signedBy: signed ? currentUser : undefined,
      signedAt: signed ? now : undefined,
      openedAt: now,
      paymentMethod,
      amount: total,
      paid,
      notes: notes.trim() === "" ? "No note entered." : notes.trim(),
      photo: false,
    }
  }

  /** Save as a draft: the record exists, unsigned, and can be edited and signed later. */
  function save() {
    onSave(build(false))
    toast.success("Visit saved. Not signed yet.")
  }

  function sign() {
    onSave(build(true))
    toast.success(`Visit signed as ${currentUser}`)
  }

  return (
    <Card className="bg-accent/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardListIcon className="size-4 text-primary" />
          New visit
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {type} visit, opened by {currentUser}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {clinical && (
          <Section icon={<ClipboardListIcon className="size-4 text-primary" />} title="Visit info">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="visit-date">Visit date</FieldLabel>
                <Input id="visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="visit-office">Office</FieldLabel>
                <Select
                  value={office}
                  onValueChange={(value) => {
                    if (typeof value === "string") setOffice(value as Office)
                  }}
                >
                  <SelectTrigger id="visit-office" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFICES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="visit-weight">Weight (lbs)</FieldLabel>
                <Input
                  id="visit-weight"
                  type="number"
                  inputMode="decimal"
                  min={50}
                  max={1000}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="visit-bmi">BMI</FieldLabel>
                {/* Derived from the patient's height on file, as the legacy form did on typing. */}
                <Input id="visit-bmi" readOnly value={computedBmi === null || computedBmi === 0 ? "" : computedBmi} />
              </Field>
              <Field>
                <FieldLabel htmlFor="visit-systolic">Blood pressure</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="visit-systolic"
                    type="number"
                    inputMode="numeric"
                    placeholder="S"
                    aria-label="Systolic"
                    className="w-20"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                  />
                  <span className="text-muted-foreground">/</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="D"
                    aria-label="Diastolic"
                    className="w-20"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                  />
                </div>
              </Field>
              <div className="flex flex-col justify-end gap-2 sm:col-span-2">
                <Label className="flex items-center gap-2">
                  <Checkbox checked={phoneVisit} onCheckedChange={(checked) => setPhoneVisit(checked === true)} />
                  Phone visit
                </Label>
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={mailingCompleted}
                    disabled={!phoneVisit}
                    onCheckedChange={(checked) => setMailingCompleted(checked === true)}
                  />
                  Mailing completed
                </Label>
              </div>
            </div>
            <Field>
              <FieldLabel htmlFor="visit-notes">Consultation</FieldLabel>
              <Textarea
                id="visit-notes"
                rows={8}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="The consultation note: findings, plan, and what was discussed with the patient."
              />
            </Field>
          </Section>
        )}

        {clinical && (
          <Section icon={<PillIcon className="size-4 text-primary" />} title="Prescription">
            <div className="grid gap-4 lg:grid-cols-2">
              <MedicationPicker id="visit-medication" value={medication} onChange={setMedication} />
              <div className="flex flex-col gap-3">
                <DosePicker value={dose} onChange={setDose} />
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={addPrescription} disabled={medication === ""}>
                    <PlusIcon data-icon="inline-start" />
                    Add to prescription
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Prescribed on this visit</span>
                  {prescribed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing yet.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {prescribed.map((m) => (
                        <li
                          key={m.name}
                          className="flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-xs font-medium"
                        >
                          {m.name} {m.dosage}
                          <button
                            type="button"
                            aria-label={`Remove ${m.name}`}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                            onClick={() => setPrescribed((prev) => prev.filter((p) => p.name !== m.name))}
                          >
                            <XIcon className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </Section>
        )}

        {clerical && (
          <Section icon={<DollarSignIcon className="size-4 text-primary" />} title="Billing">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PricedSelect id="visit-fee" label="Fee" options={VISIT_FEES} value={fee} onChange={setFee} disabled={paid} />
              <PricedSelect
                id="visit-discount"
                label="Discount"
                options={VISIT_DISCOUNTS}
                value={discount}
                onChange={setDiscount}
                disabled={paid}
              />
              <Field>
                <FieldLabel htmlFor="visit-coupon">Coupon</FieldLabel>
                <Select value={coupon} onValueChange={(value) => setCoupon(typeof value === "string" ? value : "")}>
                  <SelectTrigger id="visit-coupon" className="w-full" disabled={paid || patient.coupons.length === 0}>
                    <SelectValue placeholder={patient.coupons.length === 0 ? "None available" : "None"} />
                  </SelectTrigger>
                  <SelectContent>
                    {patient.coupons.map((c) => (
                      <SelectItem key={c.description} value={c.description}>
                        {c.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <PricedSelect
                id="visit-program"
                label="Program"
                options={PROGRAM_FEES}
                value={program}
                onChange={setProgram}
                disabled={paid}
              />
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-right tabular-nums">{usd(subtotal)}</span>
                <span className="text-muted-foreground">Discount</span>
                <span className="text-right tabular-nums">{usd(discount.amount)}</span>
                <span className="font-semibold">Total</span>
                <span className="text-right font-semibold tabular-nums">{usd(total)}</span>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <Field>
                  <FieldLabel htmlFor="visit-payment">Payment method</FieldLabel>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) => {
                      if (typeof value === "string") setPaymentMethod(value as Visit["paymentMethod"])
                    }}
                  >
                    <SelectTrigger id="visit-payment" className="w-40" disabled={paid}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Label className="flex items-center gap-2 pb-2">
                  <Checkbox
                    checked={welcomePackage}
                    onCheckedChange={(checked) => setWelcomePackage(checked === true)}
                  />
                  Requires welcome package
                </Label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={paid}
                onClick={() => {
                  setPaid(true)
                  toast.success(`${usd(total)} charged by ${paymentMethod.toLowerCase()}`)
                }}
              >
                <CreditCardIcon data-icon="inline-start" />
                {paid ? "Paid" : "Pay now"}
              </Button>
              {paid && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => toast.success("Receipt emailed to the patient")}>
                    <ReceiptTextIcon data-icon="inline-start" />
                    Email receipt
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPaid(false)
                      toast.success("Charge refunded")
                    }}
                  >
                    Refund charge
                  </Button>
                </>
              )}
            </div>
          </Section>
        )}

        {clerical && (
          <Section icon={<ShieldCheckIcon className="size-4 text-primary" />} title="Admin">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-3">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarPlusIcon className="size-4 text-muted-foreground" />
                  Follow-up appointment
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <FieldLabel htmlFor="followup-date">Date</FieldLabel>
                    <Input id="followup-date" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="followup-time">Time</FieldLabel>
                    <Input id="followup-time" type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
                  </Field>
                </div>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={followUpDate === ""}
                    onClick={() => toast.success(`Follow-up booked for ${followUpDate} at ${followUpTime}`)}
                  >
                    <CalendarPlusIcon data-icon="inline-start" />
                    Book follow-up
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <PrinterIcon className="size-4 text-muted-foreground" />
                  Fax note to primary doctor
                </span>
                <Field>
                  <FieldLabel htmlFor="fax-number">Fax number</FieldLabel>
                  <Input
                    id="fax-number"
                    type="tel"
                    inputMode="tel"
                    value={faxNumber}
                    onChange={(e) => setFaxNumber(e.target.value)}
                    placeholder="(000) 000-0000"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fax-note">Note</FieldLabel>
                  <Textarea id="fax-note" rows={3} value={faxNote} onChange={(e) => setFaxNote(e.target.value)} />
                </Field>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={faxNumber.replace(/\D/g, "").length < 10}
                    onClick={() => toast.success("Fax note sent to the primary doctor")}
                  >
                    <MailIcon data-icon="inline-start" />
                    Send fax note
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <PaperclipIcon className="size-4 text-muted-foreground" />
                  Attachments
                </span>
                {/* Photos and support files (labs) wait for PHI file storage (DIA-68); the picker records the name only. */}
                <Field>
                  <FieldLabel htmlFor="visit-attachment">Photo or support file</FieldLabel>
                  <Input
                    id="visit-attachment"
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={(e) => {
                      const name = e.target.files?.[0]?.name
                      if (name) setAttachments((prev) => [...prev, name])
                      e.target.value = ""
                    }}
                  />
                </Field>
                {attachments.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {attachments.map((name, i) => (
                      <li key={`${name}-${i}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>
        )}

        <Separator />

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {/* Two actions, distinct colours (the Sep 14 review): Save keeps a
              draft the provider can come back to; Save and sign finalises the
              note under the name of whoever filled it, as the legacy form did. */}
          <Button type="button" variant="outline" onClick={save}>
            <SaveIcon data-icon="inline-start" />
            Save
          </Button>
          <Button type="button" onClick={sign}>
            <PenLineIcon data-icon="inline-start" />
            Save and sign as {currentUser}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function PricedSelect({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  options: PricedOption[]
  value: PricedOption
  onChange: (option: PricedOption) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value.name}
        onValueChange={(next) => {
          const option = options.find((o) => o.name === next)
          if (option) onChange(option)
        }}
      >
        <SelectTrigger id={id} className="w-full" disabled={disabled}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.name} value={o.name}>
              {o.name}
              {o.amount > 0 && <span className="ml-auto pl-3 tabular-nums text-muted-foreground">{usd(o.amount)}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
