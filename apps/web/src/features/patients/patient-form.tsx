"use client"

import * as React from "react"
import { PlusIcon, ShieldCheckIcon, Trash2Icon, XIcon } from "lucide-react"
import { useForm, useStore } from "@tanstack/react-form"
import {
  describeValidationFailure,
  patientBillingInput,
  patientClinicalInput,
  patientDemographicsInput,
  formatCardExpiry,
  PATIENT_CONDITIONS,
  PATIENT_GENDERS,
  PATIENT_LANGUAGES,
  PATIENT_PROGRAM_TYPES,
  PATIENT_REFERRAL_SOURCES,
  type PatientBilling,
  type PatientChart,
  type PatientCondition,
  type PatientDemographics,
  type PatientGender,
  type IntakeSubmission,
  type ValidationFailure,
} from "@fastehr/contracts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { useLocation } from "@/components/location-provider"
import { RequiredMark } from "@/components/required-mark"
import {
  FALLBACK_FIELD_MESSAGE,
  FALLBACK_FORM_MESSAGE,
  validationFrom,
  type FormCopy,
  type FormErrors,
} from "@/lib/form-errors"
import { trpc } from "@/trpc/client"
import { splitHeight } from "./height.ts"
import { PATIENT_TAB_LABEL, PATIENT_TABS, type PatientTab } from "./patient-tabs.ts"
import { US_STATES } from "./us-states.ts"

/**
 * The patient record form, shared by /patients/new and /patients/[id]/edit
 * and by the self-service intake — the legacy create/edit form restructured
 * into three tabs (DIA-52, ADR 28) on the reference pattern (docs/forms.md,
 * ADR 25): the section input schemas from contracts validate on both sides,
 * the mutations run inside the submit validator, and every message a user
 * reads lives in the copy table here.
 *
 * Tabs are sections, and sections are the unit of authorization (ADR 28).
 * The page decides which tabs render (`patientTabsFor`, from the session's
 * role) and which mutations a save runs; this component only validates the
 * tabs it was given and shows them, in the one fixed order. Medical holds
 * vitals, medications, the primary care doctor, and the medical-history
 * checklist (every item "No" until answered) with the history text box
 * read-only beneath it; allergies stay out of scope. Patient Info is the
 * clerical half; Billing is the card block on its own.
 * No field of one tab ever renders inside another.
 *
 * Layout inside a tab: one responsive grid, two columns from `sm`, four from
 * `lg`, eight at `3xl` (extra width buys columns, never wider fields). Short
 * fields span one column; the free-text ones span two.
 */

/**
 * What the mutations accept: the form's strings with `gender` narrowed to the
 * vocabulary. The narrowing is safe where it happens — inside the submit
 * validator, after the section schemas have already accepted the value.
 */
export type PatientFormSubmission = Omit<PatientFormValues, "gender"> & { gender: PatientGender }

export interface MedicationRowValues {
  name: string
  dose: string
  frequency: string
}

export interface ConditionRowValues {
  condition: PatientCondition
  present: boolean
  onset: string
  treatedBy: string
  medicated: boolean
  medications: string
}

/** The checklist copy — the working list's labels, in the order asked. */
const CONDITION_LABEL: Record<PatientCondition, string> = {
  hypertension: "High blood pressure",
  heart_disease: "Heart disease",
  stroke: "Stroke",
  high_cholesterol: "High cholesterol",
  diabetes: "Diabetes",
  thyroid: "Thyroid condition",
  kidney_disease: "Kidney disease",
  liver_disease: "Liver disease",
  sleep_apnea: "Sleep apnea",
  asthma: "Asthma",
  seizures: "Seizures",
  glaucoma: "Glaucoma",
  depression_or_anxiety: "Depression or anxiety",
  pregnancy_or_breastfeeding: "Pregnant or breastfeeding",
}

export interface PatientFormValues {
  // Patient Info
  firstName: string
  lastName: string
  gender: string
  dateOfBirth: string
  language: string
  office: string
  email: string
  addressStreet: string
  addressCity: string
  addressState: string
  addressZip: string
  phone: string
  phoneFollowUpAllowed: boolean
  referralSource: string
  referredByPatientId: string
  programType: string
  // Medical: vitals
  heightFeet: string
  heightInchesPart: string
  // Medical: medications
  medications: MedicationRowValues[]
  // Medical: history checklist and the free text beneath it
  conditions: ConditionRowValues[]
  historyOther: string
  // Medical: primary care doctor
  pcpName: string
  pcpAddress: string
  pcpPhone: string
  // Billing
  creditCardNumber: string
  /** One field, "month/year"; the contract splits it into the two stored columns. */
  creditCardExpiry: string
  creditCardZip: string
}

const EMPTY_MEDICATION: MedicationRowValues = { name: "", dose: "", frequency: "" }

/** Every checklist item, answered "No" — the form's starting point. */
function emptyConditions(): ConditionRowValues[] {
  return PATIENT_CONDITIONS.map((condition) => ({
    condition,
    present: false,
    onset: "",
    treatedBy: "",
    medicated: false,
    medications: "",
  }))
}

/** Stored "Yes" items over the full list: everything else stays "No". */
function toConditionRows(
  stored: ReadonlyArray<{ condition: string; onset?: string | null; treatedBy?: string | null; medicated: boolean; medications?: string | null }>,
): ConditionRowValues[] {
  const present = new Map(stored.map((row) => [row.condition, row]))
  return PATIENT_CONDITIONS.map((condition) => {
    const row = present.get(condition)
    return row === undefined
      ? { condition, present: false, onset: "", treatedBy: "", medicated: false, medications: "" }
      : {
          condition,
          present: true,
          onset: row.onset ?? "",
          treatedBy: row.treatedBy ?? "",
          medicated: row.medicated,
          medications: row.medications ?? "",
        }
  })
}

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  firstName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  language: "",
  office: "",
  email: "",
  addressStreet: "",
  addressCity: "",
  addressState: "",
  addressZip: "",
  phone: "",
  phoneFollowUpAllowed: true, // the legacy form's default: follow-up allowed
  referralSource: "",
  referredByPatientId: "",
  programType: "",
  heightFeet: "",
  heightInchesPart: "",
  medications: [],
  conditions: emptyConditions(),
  historyOther: "",
  pcpName: "",
  pcpAddress: "",
  pcpPhone: "",
  creditCardNumber: "",
  creditCardExpiry: "",
  creditCardZip: "",
}

/**
 * A stored record → the form's editable strings (edit page prefill). The
 * sections a role cannot read arrive as `null` and prefill blank — the page
 * never sends those sections back, so blank is never written.
 */
export function toPatientFormValues(
  chart: PatientChart,
  demographics: PatientDemographics | null,
  billing: PatientBilling | null,
): PatientFormValues {
  return {
    ...EMPTY_PATIENT_FORM,
    firstName: chart.firstName,
    lastName: chart.lastName,
    dateOfBirth: chart.dateOfBirth,
    office: chart.office ?? "",
    ...(demographics === null
      ? {}
      : {
          gender: demographics.gender ?? "",
          language: demographics.language ?? "",
          office: demographics.office ?? "",
          email: demographics.email ?? "",
          addressStreet: demographics.addressStreet ?? "",
          addressCity: demographics.addressCity ?? "",
          addressState: demographics.addressState ?? "",
          addressZip: demographics.addressZip ?? "",
          phone: demographics.phone ?? "",
          phoneFollowUpAllowed: demographics.phoneFollowUpAllowed,
          referralSource: demographics.referralSource ?? "",
          referredByPatientId: demographics.referredByPatientId ?? "",
          programType: demographics.programType ?? "",
        }),
    ...splitHeight(chart.heightInches),
    medications: chart.medications.map((row) => ({
      name: row.name,
      dose: row.dose ?? "",
      frequency: row.frequency ?? "",
    })),
    conditions: toConditionRows(chart.conditions),
    historyOther: chart.historyOther ?? "",
    pcpName: chart.pcpName ?? "",
    pcpAddress: chart.pcpAddress ?? "",
    pcpPhone: chart.pcpPhone ?? "",
    ...(billing === null
      ? {}
      : {
          creditCardNumber: billing.creditCardNumber ?? "",
          creditCardExpiry: formatCardExpiry(billing.creditCardExpMonth, billing.creditCardExpYear),
          creditCardZip: billing.creditCardZip ?? "",
        }),
  }
}

/**
 * A stored intake submission → the form (the review screen, and nothing
 * else: the submission is the normalized shape `createPatientInput` emits,
 * with absent fields undefined rather than null).
 */
export function toIntakeFormValues(submission: IntakeSubmission): PatientFormValues {
  return {
    ...EMPTY_PATIENT_FORM,
    firstName: submission.firstName,
    lastName: submission.lastName,
    gender: submission.gender,
    dateOfBirth: submission.dateOfBirth,
    language: submission.language ?? "",
    office: submission.office,
    email: submission.email ?? "",
    addressStreet: submission.addressStreet,
    addressCity: submission.addressCity,
    addressState: submission.addressState,
    addressZip: submission.addressZip,
    phone: submission.phone,
    phoneFollowUpAllowed: submission.phoneFollowUpAllowed,
    referralSource: submission.referralSource ?? "",
    referredByPatientId: submission.referredByPatientId ?? "",
    programType: submission.programType ?? "",
    ...splitHeight(submission.heightInches),
    medications: submission.medications.map((row) => ({
      name: row.name,
      dose: row.dose ?? "",
      frequency: row.frequency ?? "",
    })),
    conditions: toConditionRows(submission.conditions),
    historyOther: submission.historyOther ?? "",
    pcpName: submission.pcpName ?? "",
    pcpAddress: submission.pcpAddress ?? "",
    pcpPhone: submission.pcpPhone ?? "",
  }
}

const FEET = ["0", "1", "2", "3", "4", "5", "6", "7", "8"]

/** The legacy system's office → at-home test, verbatim. */
const AT_HOME_OFFICE = /(.*\s)home$/i

/**
 * The record's `office` is still the legacy string (ADR 32), so the two
 * values that are not clinics stay choosable here: they mark the At Home
 * program and telemedicine-only patients until the appointment work gives
 * those a field of their own. Shown as they are; the clinics show their
 * display names.
 */
const NON_CLINIC_OFFICES = ["Telemedicine", "At Home"] as const
/** The legacy referral-source → show-patient-picker test, verbatim. */
const REFERRED_BY_PATIENT = /patient/

/**
 * Every message a user reads, keyed by field and issue code — codes are all
 * the server sends (ADR 12). List rows are keyed without their index
 * (`medications.name`, not `medications.0.name`). Good copy says what to do
 * next; it never repeats what was typed, and never names a system.
 */
const COPY: FormCopy = {
  firstName: { too_small: "Enter the patient's first name.", too_big: "First name can be at most 50 characters." },
  lastName: { too_small: "Enter the patient's last name.", too_big: "Last name can be at most 100 characters." },
  gender: { invalid_value: "Select the patient's gender." },
  dateOfBirth: {
    invalid_format: "Enter the patient's date of birth.",
    custom: "Date of birth must be a past date.",
  },
  language: { invalid_value: "Select a language from the list." },
  office: { invalid_value: "Select an office from the list.", invalid_type: "Select the office you will visit." },
  email: { invalid_format: "Enter a valid email address, like name@example.com." },
  addressStreet: { too_small: "Enter the street address.", too_big: "Street can be at most 200 characters." },
  addressCity: { too_small: "Enter the city.", too_big: "City can be at most 100 characters." },
  addressState: { invalid_format: "Select a state." },
  addressZip: { invalid_format: "Enter a zip code of three to eight digits." },
  phone: { invalid_format: "Enter a phone number with ten digits." },
  referralSource: { invalid_value: "Select a referral source from the list." },
  referredByPatientId: { invalid_format: "Pick the referring patient from the search results." },
  programType: { invalid_value: "Select a program from the list." },
  heightFeet: { invalid_format: "Select the feet." },
  heightInchesPart: { invalid_format: "Enter inches from 0 to 11, decimals allowed." },
  "medications.name": { too_small: "Enter the medication name.", too_big: "Name can be at most 100 characters." },
  "medications.dose": { too_big: "Dose can be at most 50 characters." },
  "medications.frequency": { too_big: "Frequency can be at most 50 characters." },
  medications: { too_big: "The list is limited to 50 medications." },
  "conditions.onset": { too_big: "Keep this under 100 characters." },
  "conditions.treatedBy": { too_big: "Keep this under 100 characters." },
  "conditions.medications": { too_big: "Keep this under 200 characters." },
  pcpName: { too_big: "Name can be at most 100 characters." },
  pcpAddress: { too_big: "Address can be at most 200 characters." },
  pcpPhone: { invalid_format: "Enter a phone number with ten digits." },
  creditCardNumber: { invalid_format: "Enter the card number: 14 to 18 digits." },
  creditCardExpiry: { invalid_format: "Enter the expiration as month/year, like 09/2030." },
  creditCardZip: { invalid_format: "Enter the billing zip: four to six digits." },
}

const SAVE_FAILED = "The patient could not be saved. Check your connection and try again."

/** Which tab a field path belongs to, so an error on a hidden tab can be pointed at. */
function sectionOf(path: string): PatientTab {
  if (
    path.startsWith("height") ||
    path.startsWith("medications") ||
    path.startsWith("conditions") ||
    path.startsWith("pcp")
  ) {
    return "medical"
  }
  if (path.startsWith("creditCard")) return "billing"
  return "patientInfo"
}

/**
 * A failure → form errors, with two path conventions reconciled: the contract
 * reports `medications.0.name`, TanStack addresses the field as
 * `medications[0].name`, and the copy table keys on `medications.name`.
 */
function toTabbedErrors(
  failure: ValidationFailure,
): { errors: FormErrors; sections: Set<PatientTab> } {
  const fields: Record<string, { message: string }> = {}
  const sections = new Set<PatientTab>()
  for (const [path, codes] of Object.entries(failure.fieldErrors)) {
    const code = codes[0]
    if (code === undefined) continue
    const copyKey = path.replace(/\.\d+\./g, ".").replace(/\.\d+$/, "")
    const fieldKey = path.replace(/\.(\d+)/g, "[$1]")
    fields[fieldKey] = { message: COPY[copyKey]?.[code] ?? FALLBACK_FIELD_MESSAGE }
    sections.add(sectionOf(path))
  }
  const errors: FormErrors =
    failure.formErrors.length > 0 ? { form: FALLBACK_FORM_MESSAGE, fields } : { fields }
  return { errors, sections }
}

/**
 * The client-side parse: each rendered section's schema against the whole
 * value (a Zod object ignores the keys it does not declare), failures merged.
 * Runs before the network, so a submit with an error never leaves the page.
 */
function clientFailure(
  value: PatientFormValues,
  sections: readonly PatientTab[],
): ValidationFailure | null {
  const schemas = [
    ...(sections.includes("patientInfo") ? [patientDemographicsInput] : []),
    ...(sections.includes("medical") ? [patientClinicalInput] : []),
    ...(sections.includes("billing") ? [patientBillingInput] : []),
  ]
  const merged: ValidationFailure = { fieldErrors: {}, formErrors: [] }
  let failed = false
  for (const schema of schemas) {
    const result = schema.safeParse(value)
    if (result.success) continue
    const failure = describeValidationFailure(result.error)
    if (failure === null) continue
    failed = true
    Object.assign(merged.fieldErrors, failure.fieldErrors)
    merged.formErrors.push(...failure.formErrors)
  }
  return failed ? merged : null
}

/** "1985-12-10" → "12/10/1985" without touching Date (and its timezones). */
function formatDob(iso: string): string {
  const [y, m, d] = iso.split("-")
  return m !== undefined && d !== undefined ? `${Number(m)}/${Number(d)}/${y}` : iso
}

/**
 * The referred-by-patient picker — the legacy Kendo autocomplete as a search
 * box: type two or more characters ("Lastname" or "Lastname, Firstname"),
 * pick a result, and the patient id lands in the form. A picked patient shows
 * as a removable chip; editing an existing referral means clearing it first.
 */
function ReferredByPatientPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const search = trpc.patient.searchByName.useQuery(
    { name: query.trim() },
    { enabled: query.trim().length >= 2 },
  )
  const selected = trpc.patient.byId.useQuery({ id: value }, { enabled: value !== "" })

  if (value !== "") {
    const label = selected.data
      ? `${selected.data.lastName}, ${selected.data.firstName} (${formatDob(selected.data.dateOfBirth)})`
      : "Selected patient"
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{label}</Badge>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear referring patient" onClick={() => onChange("")}>
          <XIcon />
        </Button>
      </div>
    )
  }

  const results = query.trim().length >= 2 ? (search.data ?? []) : []

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Lastname, Firstname"
        aria-label="Search for the referring patient"
      />
      {results.length > 0 ? (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-input text-sm">
          {results.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                className="w-full px-2.5 py-1.5 text-left hover:bg-accent"
                onClick={() => {
                  onChange(patient.id)
                  setQuery("")
                }}
              >
                {patient.lastName}, {patient.firstName} ({formatDob(patient.dateOfBirth)})
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && search.isSuccess ? (
        <FieldDescription>No patients match that name.</FieldDescription>
      ) : (
        <FieldDescription>Type at least two letters of the last name.</FieldDescription>
      )}
    </div>
  )
}

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-8"

/** A titled block inside a tab — the Medical tab is several of these, in one fixed order. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

export function PatientForm({
  title = "Patient details",
  sections,
  defaultValues,
  submit,
  submitLabel,
  submittingLabel,
  saved,
  onDirtyChange,
  footerStart,
  /** Off for the self-service intake, which has no picker to search with. */
  allowReferralPicker = true,
  /** On for the intake, where the office decides the queue. */
  officeRequired = false,
}: {
  title?: string
  /** The tabs to render — decided by the page from the session's role, always in PATIENT_TABS order. */
  sections: readonly PatientTab[]
  defaultValues: PatientFormValues
  /** Runs the mutation(s); a thrown tRPC error is mapped back onto the fields. */
  submit: (value: PatientFormSubmission) => Promise<void>
  submitLabel: React.ReactNode
  submittingLabel: string
  /** True once the mutation has succeeded — releases the leave warning. */
  saved: boolean
  /** Lets the page guard its own back-navigation with the form's dirty state. */
  onDirtyChange?: (dirty: boolean) => void
  /** Rendered at the card footer's left edge (the review screen's Reject). */
  footerStart?: React.ReactNode
  allowReferralPicker?: boolean
  officeRequired?: boolean
}) {
  // Opens on the first tab given, which in PATIENT_TABS order is Medical
  // whenever the role renders it.
  const [tab, setTab] = React.useState<PatientTab>(sections[0] ?? "medical")

  // The office pick-list: the active clinics by display name, stored as the
  // legacy string the record keeps; the two non-clinic values; and, if the
  // record already holds something else (a closed clinic, a dead value), that
  // value too, so opening an old record never silently changes it.
  const { activeLocations, nameForOffice } = useLocation()
  const officeItems = React.useMemo(() => {
    const items = [
      // The legacy name as the label too, until the clinic confirms the display names.
      ...activeLocations.map((row) => ({ value: row.legacyName, label: row.legacyName })),
      ...NON_CLINIC_OFFICES.map((value) => ({ value, label: value })),
    ]
    const current = defaultValues.office
    if (current !== "" && !items.some((item) => item.value === current)) {
      items.unshift({ value: current, label: nameForOffice(current) })
    }
    return items
  }, [activeLocations, defaultValues.office, nameForOffice])
  // Tabs holding an error after the last submit — shown as a count on the
  // trigger, so a failure on a hidden tab is never a silent one.
  const [erroring, setErroring] = React.useState<Set<PatientTab>>(new Set())

  const applyFailure = (failure: ValidationFailure): FormErrors => {
    const { errors, sections: failed } = toTabbedErrors(failure)
    setErroring(failed)
    const first = sections.find((section) => failed.has(section))
    if (first !== undefined) setTab(first)
    return errors
  }

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: ({ value }) => {
        const failure = clientFailure(value, sections)
        if (failure === null) {
          setErroring(new Set())
          return undefined
        }
        return applyFailure(failure)
      },
      // Runs only after the client parse passes, so an invalid submit never
      // reaches the network. A thrown mutation is translated back into form
      // errors; returning them (rather than resolving) keeps the submit failed.
      onSubmitAsync: async ({ value }) => {
        try {
          await submit({ ...value, gender: value.gender as PatientGender })
          return undefined
        } catch (error) {
          const failure = validationFrom(error)
          if (failure !== null) return applyFailure(failure)
          return { form: SAVE_FAILED, fields: {} }
        }
      },
    },
  })

  const isDirty = useStore(form.store, (state) => state.isDirty)

  React.useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  /** Chrome ignores the message but requires the preventDefault; both are per spec. */
  React.useEffect(() => {
    if (!isDirty || saved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [isDirty, saved])

  /** Any scalar string field, including a list row's field by bracket path. */
  const textField = (
    name: string,
    label: string,
    options: {
      type?: string
      placeholder?: string
      description?: string
      className?: string
      required?: boolean
    } = {},
  ) => (
    // The name is a runtime string for the list rows; TanStack's typed name
    // union does not cover computed paths, so the cast is confined to here.
    <form.Field name={name as "firstName"}>
      {(field) => (
        <Field className={options.className} data-invalid={!field.state.meta.isValid}>
          <FieldLabel htmlFor={field.name}>
            {label}
            {options.required === true ? <RequiredMark /> : null}
          </FieldLabel>
          <Input
            id={field.name}
            name={field.name}
            type={options.type ?? "text"}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            aria-invalid={!field.state.meta.isValid}
            placeholder={options.placeholder}
          />
          {options.description === undefined ? null : (
            <FieldDescription>{options.description}</FieldDescription>
          )}
          <FieldError errors={field.state.meta.errors} />
        </Field>
      )}
    </form.Field>
  )

  const selectField = (
    name: string,
    label: string,
    items: ReadonlyArray<{ value: string; label: string }>,
    options: { placeholder?: string; description?: string; className?: string; required?: boolean } = {},
  ) => (
    <form.Field name={name as "firstName"}>
      {(field) => (
        <Field className={options.className} data-invalid={!field.state.meta.isValid}>
          <FieldLabel htmlFor={field.name}>
            {label}
            {options.required === true ? <RequiredMark /> : null}
          </FieldLabel>
          <Select
            value={field.state.value}
            onValueChange={(value) => field.handleChange(typeof value === "string" ? value : "")}
          >
            <SelectTrigger id={field.name} className="w-full" aria-invalid={!field.state.meta.isValid}>
              <SelectValue placeholder={options.placeholder ?? "Select…"} />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {options.description === undefined ? null : (
            <FieldDescription>{options.description}</FieldDescription>
          )}
          <FieldError errors={field.state.meta.errors} />
        </Field>
      )}
    </form.Field>
  )

  const asItems = (values: readonly string[]) => values.map((value) => ({ value, label: value }))

  const patientInfoTab = (
    <FieldGroup>
      <div className={GRID}>
        {textField("firstName", "First name", { placeholder: "First name", className: "sm:col-span-2", required: true })}
        {textField("lastName", "Last name", { placeholder: "Last name", className: "sm:col-span-2", required: true })}
        <form.Field name="gender">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel>
                Gender
                <RequiredMark />
              </FieldLabel>
              <RadioGroup
                value={field.state.value}
                onValueChange={(value) => field.handleChange(typeof value === "string" ? value : "")}
                className="flex h-9 flex-row items-center gap-5"
                aria-invalid={!field.state.meta.isValid}
              >
                {PATIENT_GENDERS.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={value} />
                    {value === "male" ? "Male" : "Female"}
                  </label>
                ))}
              </RadioGroup>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        {textField("dateOfBirth", "Date of birth", { type: "date", required: true })}
        {selectField(
          "language",
          "Language",
          PATIENT_LANGUAGES.map((value) => ({
            value,
            label: value === "english" ? "English" : "Spanish",
          })),
        )}
        {selectField("office", "Office", officeItems, {
          required: officeRequired,
          ...(officeRequired ? { description: "The office or program you will visit." } : {}),
        })}

        {textField("email", "Email", {
          type: "email",
          placeholder: "patient@email.com",
          className: "sm:col-span-2",
        })}
        {textField("addressStreet", "Street", { placeholder: "Street address", className: "sm:col-span-2", required: true })}
        {textField("addressCity", "City", { placeholder: "City", required: true })}
        {selectField(
          "addressState",
          "State",
          US_STATES.map((state) => ({ value: state.code, label: state.name })),
          { required: true },
        )}
        {textField("addressZip", "Zip code", { placeholder: "90210", required: true })}
        {textField("phone", "Phone", {
          type: "tel",
          placeholder: "(951) 555-0000",
          description: "Any format, ten digits.",
          required: true,
        })}
        <form.Field name="phoneFollowUpAllowed">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor={field.name}>Follow up</FieldLabel>
              <Select
                value={field.state.value ? "allowed" : "do-not-contact"}
                onValueChange={(value) => field.handleChange(value === "allowed")}
              >
                <SelectTrigger id={field.name} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allowed">Allowed</SelectItem>
                  <SelectItem value="do-not-contact">Do not contact</SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        {selectField("referralSource", "Referral source", asItems(PATIENT_REFERRAL_SOURCES))}
      </div>

      {allowReferralPicker ? (
        <form.Subscribe selector={(state) => state.values.referralSource}>
          {(referralSource) =>
            REFERRED_BY_PATIENT.test(referralSource) ? (
              <form.Field name="referredByPatientId">
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel>Referred by patient</FieldLabel>
                    <ReferredByPatientPicker value={field.state.value} onChange={field.handleChange} />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
      ) : null}

      <form.Subscribe selector={(state) => state.values.office}>
        {(office) =>
          AT_HOME_OFFICE.test(office) ? (
            <div className={GRID}>
              {selectField("programType", "Program name", asItems(PATIENT_PROGRAM_TYPES), {
                description: "The At Home program the patient is enrolled in.",
              })}
            </div>
          ) : null
        }
      </form.Subscribe>
    </FieldGroup>
  )

  const vitals = (
    <div className={GRID}>
      {selectField("heightFeet", "Height (feet)", asItems(FEET), { required: true, placeholder: "ft" })}
      {textField("heightInchesPart", "Height (inches)", {
        placeholder: "4",
        description: "0 to 11, decimals allowed.",
        required: true,
      })}
    </div>
  )

  const medications = (
    <form.Field name="medications" mode="array">
      {(list) => (
        <FieldGroup>
          {list.state.value.length === 0 ? (
            <FieldDescription>No medications listed. Add one per line.</FieldDescription>
          ) : null}
          {list.state.value.map((_, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className={`${GRID} flex-1`}>
                {textField(`medications[${index}].name`, "Medication", {
                  placeholder: "Name",
                  className: "sm:col-span-2",
                  required: true,
                })}
                {textField(`medications[${index}].dose`, "Dose", { placeholder: "10 mg" })}
                {textField(`medications[${index}].frequency`, "Frequency", { placeholder: "Twice daily" })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-6"
                aria-label="Remove medication"
                onClick={() => list.removeValue(index)}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => list.pushValue({ ...EMPTY_MEDICATION })}>
              <PlusIcon data-icon="inline-start" />
              Add medication
            </Button>
          </div>
          <FieldError errors={list.state.meta.errors} />
        </FieldGroup>
      )}
    </form.Field>
  )

  const primaryCareDoctor = (
    <div className={GRID}>
      {textField("pcpName", "Doctor's name", { placeholder: "Dr. Name", className: "sm:col-span-2" })}
      {textField("pcpAddress", "Address", { placeholder: "Practice address", className: "sm:col-span-2" })}
      {textField("pcpPhone", "Phone", {
        type: "tel",
        placeholder: "(951) 555-0000",
        description: "Any format, ten digits.",
      })}
    </div>
  )

  /**
   * The checklist: every item asked, "No" by default, a "Yes" opening the
   * details. Allergies are out of scope and have no place here yet.
   */
  const conditionRow = (condition: PatientCondition, index: number) => (
    <form.Field key={condition} name={`conditions[${index}].present` as "phoneFollowUpAllowed"}>
      {(presentField) => (
        <div className="flex flex-col gap-3 px-4 py-3">
          {/* Two aligned columns: the label gets a fixed track, so every
              No/Yes pair sits on the same vertical line down the list. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <span className="text-sm font-medium">{CONDITION_LABEL[condition]}</span>
            <RadioGroup
              value={presentField.state.value ? "yes" : "no"}
              onValueChange={(value) => presentField.handleChange(value === "yes")}
              className="flex w-auto flex-row items-center gap-5"
              aria-label={CONDITION_LABEL[condition]}
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="no" />
                No
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="yes" />
                Yes
              </label>
            </RadioGroup>
          </div>
          {presentField.state.value ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {textField(`conditions[${index}].onset`, "When", { placeholder: "2019, or age 40" })}
              {textField(`conditions[${index}].treatedBy`, "Who is treating it", { placeholder: "Dr. Name, clinic" })}
              <form.Field name={`conditions[${index}].medicated` as "phoneFollowUpAllowed"}>
                {(medicatedField) => (
                  <Field>
                    <FieldLabel htmlFor={medicatedField.name}>Currently medicated</FieldLabel>
                    <div className="flex h-8 items-center gap-2">
                      <Checkbox
                        id={medicatedField.name}
                        checked={medicatedField.state.value}
                        onCheckedChange={(checked) => medicatedField.handleChange(checked === true)}
                      />
                      <span className="text-sm text-muted-foreground">Yes</span>
                    </div>
                  </Field>
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.conditions[index]?.medicated ?? false}>
                {(medicated) =>
                  medicated
                    ? textField(`conditions[${index}].medications`, "Which medications", {
                        placeholder: "Names and doses",
                      })
                    : null
                }
              </form.Subscribe>
            </div>
          ) : null}
        </div>
      )}
    </form.Field>
  )

  /**
   * The checklist: every item asked, "No" by default, a "Yes" opening the
   * details. Split into two lists side by side from `md`, so fourteen rows
   * do not run the length of the page. Beneath it, "History": one free text
   * box (the Sep 7 sync), saved with the section; the legacy history text
   * was migrated into it, so the migrated record reads as the starting draft.
   */
  const half = Math.ceil(PATIENT_CONDITIONS.length / 2)
  const medicalHistory = (
    <div className="flex flex-col gap-4">
      <FieldDescription>For each condition, answer Yes or No. A Yes opens the details.</FieldDescription>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {PATIENT_CONDITIONS.slice(0, half).map((condition, index) => conditionRow(condition, index))}
        </div>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {PATIENT_CONDITIONS.slice(half).map((condition, index) => conditionRow(condition, index + half))}
        </div>
      </div>
      <form.Field name="historyOther">
        {(field) => (
          <Field data-invalid={!field.state.meta.isValid}>
            <FieldLabel htmlFor={field.name}>History</FieldLabel>
            <Textarea
              id={field.name}
              name={field.name}
              rows={5}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={!field.state.meta.isValid}
              placeholder="Conditions, prior treatments, anything the next provider should read first."
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
    </div>
  )

  const medicalTab = (
    <FieldGroup className="[&>section+section]:mt-3 [&>section+section]:border-t [&>section+section]:border-muted-foreground/40 [&>section+section]:pt-6">
      <Section title="Vitals">{vitals}</Section>
      <Section title="Medications">{medications}</Section>
      <Section title="Primary care doctor">{primaryCareDoctor}</Section>
      <Section title="Medical history">{medicalHistory}</Section>
    </FieldGroup>
  )

  const billingTab = (
    <FieldGroup>
      <Alert>
        <ShieldCheckIcon />
        <AlertTitle>Stored securely</AlertTitle>
        <AlertDescription>
          Card details are stored securely and are never charged or used without the patient&apos;s
          consent.
        </AlertDescription>
      </Alert>
      {/* The provisional card block — the fields the legacy form rendered,
          and only those (no CVV, ever). */}
      <div className={GRID}>
        {textField("creditCardNumber", "Credit card number", { placeholder: "Card number" })}
        {textField("creditCardExpiry", "Expiration (month/year)", {
          placeholder: "09/2030",
          description: "Month and year, like 09/2030 or 9/30.",
        })}
        {textField("creditCardZip", "Billing zip", { placeholder: "90210" })}
      </div>
    </FieldGroup>
  )

  const content: Record<PatientTab, React.ReactNode> = {
    medical: medicalTab,
    patientInfo: patientInfoTab,
    billing: billingTab,
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
            {(formError) =>
              typeof formError === "string" ? (
                <Alert variant="destructive">
                  <AlertTitle>The patient was not saved</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null
            }
          </form.Subscribe>

          <Tabs
            value={tab}
            onValueChange={(value) => {
              if (typeof value === "string" && (PATIENT_TABS as readonly string[]).includes(value)) {
                setTab(value as PatientTab)
              }
            }}
          >
            {/* Always a tab list, even for a role with one tab: the layout is
                the same for everyone, only the count differs. */}
            <TabsList className="flex-wrap">
              {sections.map((section) => (
                <TabsTrigger key={section} value={section}>
                  {PATIENT_TAB_LABEL[section]}
                  {erroring.has(section) ? (
                    <span
                      aria-label="Has errors"
                      className="ml-1.5 inline-block size-2 rounded-full bg-destructive"
                    />
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
            {sections.map((section) => (
              // Every tab stays mounted: TanStack keeps the values either way,
              // but a mounted field is what shows its error after a submit.
              <TabsContent key={section} value={section} className="mt-2" keepMounted>
                {content[section]}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
        <CardFooter className={footerStart === undefined ? "justify-end" : "justify-between"}>
          {footerStart}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? submittingLabel : submitLabel}
              </Button>
            )}
          </form.Subscribe>
        </CardFooter>
      </Card>
    </form>
  )
}
