"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { useForm, useStore } from "@tanstack/react-form"
import {
  createPatientInput,
  describeValidationFailure,
  PATIENT_GENDERS,
  PATIENT_LANGUAGES,
  PATIENT_OFFICES,
  PATIENT_PROGRAM_TYPES,
  PATIENT_REFERRAL_SOURCES,
  type Patient,
  type PatientGender,
} from "@fastehr/contracts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { toFormErrors, validationFrom, type FormCopy, type FormErrors } from "@/lib/form-errors"
import { trpc } from "@/trpc/client"
import { US_STATES } from "./us-states.ts"

/**
 * The patient form, shared by /patients/new and /patients/[id]/edit — the
 * legacy system's create/edit form rebuilt on the reference
 * pattern (docs/forms.md, ADR 25): `createPatientInput` validates on both
 * sides, the mutation runs inside the submit validator, and every message a
 * user reads lives in the copy table here.
 *
 * Same fields, same requiredness, same conditionals as the legacy form:
 * the program picker appears for the At Home office, the referred-by-patient
 * picker appears when the referral source names a patient. Two legacy blocks
 * are deliberately absent — the credit-card fields (stored in plaintext there;
 * payment data is not entering this system ungoverned) and the SMS intake
 * side-panel (returns with the messaging domain).
 */

/**
 * What the mutations accept: the form's strings with `gender` narrowed to the
 * vocabulary. The narrowing is safe where it happens — inside the submit
 * validator, after `createPatientInput` has already accepted the value.
 */
export type PatientFormSubmission = Omit<PatientFormValues, "gender"> & { gender: PatientGender }

export interface PatientFormValues {
  firstName: string
  lastName: string
  gender: string
  heightInches: string
  dateOfBirth: string
  healthyWeight: string
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
  historyNotes: string
  programType: string
}

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  firstName: "",
  lastName: "",
  gender: "",
  heightInches: "",
  dateOfBirth: "",
  healthyWeight: "",
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
  historyNotes: "",
  programType: "",
}

/** A stored patient → the form's editable strings (edit page prefill). */
export function toPatientFormValues(patient: Patient): PatientFormValues {
  return {
    firstName: patient.firstName,
    lastName: patient.lastName,
    gender: patient.gender ?? "",
    heightInches: patient.heightInches === null ? "" : String(patient.heightInches),
    dateOfBirth: patient.dateOfBirth,
    healthyWeight: patient.healthyWeight === null ? "" : String(patient.healthyWeight),
    language: patient.language ?? "",
    office: patient.office ?? "",
    email: patient.email ?? "",
    addressStreet: patient.addressStreet ?? "",
    addressCity: patient.addressCity ?? "",
    addressState: patient.addressState ?? "",
    addressZip: patient.addressZip ?? "",
    phone: patient.phone ?? "",
    phoneFollowUpAllowed: patient.phoneFollowUpAllowed,
    referralSource: patient.referralSource ?? "",
    referredByPatientId: patient.referredByPatientId ?? "",
    historyNotes: patient.historyNotes ?? "",
    programType: patient.programType ?? "",
  }
}

/** The legacy system's office → at-home test, verbatim. */
const AT_HOME_OFFICE = /(.*\s)home$/i
/** The legacy referral-source → show-patient-picker test, verbatim. */
const REFERRED_BY_PATIENT = /patient/

/**
 * Every message a user reads, keyed by field and issue code — codes are all
 * the server sends (ADR 12). Good copy says what to do next; it never repeats
 * what was typed, and never names a system.
 */
const COPY: FormCopy = {
  firstName: { too_small: "Enter the patient's first name.", too_big: "First name can be at most 50 characters." },
  lastName: { too_small: "Enter the patient's last name.", too_big: "Last name can be at most 100 characters." },
  gender: { invalid_value: "Select the patient's gender." },
  heightInches: { invalid_format: "Enter height in inches — two digits, decimals allowed." },
  dateOfBirth: {
    invalid_format: "Enter the patient's date of birth.",
    custom: "Date of birth must be a past date.",
  },
  healthyWeight: { invalid_format: "Enter a weight in pounds — up to three digits, decimals allowed." },
  language: { invalid_value: "Select a language from the list." },
  office: { invalid_value: "Select an office from the list." },
  email: { invalid_format: "Enter a valid email address, like name@example.com." },
  addressStreet: { too_small: "Enter the street address.", too_big: "Street can be at most 200 characters." },
  addressCity: { too_small: "Enter the city.", too_big: "City can be at most 100 characters." },
  addressState: { invalid_format: "Select a state." },
  addressZip: { invalid_format: "Enter a zip code of three to eight digits." },
  phone: { invalid_format: "Enter a phone number with ten digits." },
  referralSource: { invalid_value: "Select a referral source from the list." },
  referredByPatientId: { invalid_format: "Pick the referring patient from the search results." },
  historyNotes: { too_big: "History is limited to 10,000 characters." },
  programType: { invalid_value: "Select a program from the list." },
}

const SAVE_FAILED = "The patient could not be saved. Check your connection and try again."

function clientErrors(value: unknown): FormErrors | undefined {
  const result = createPatientInput.safeParse(value)
  if (result.success) return undefined
  const failure = describeValidationFailure(result.error)
  return failure === null ? undefined : toFormErrors(failure, COPY)
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
      ? `${selected.data.lastName}, ${selected.data.firstName} — ${formatDob(selected.data.dateOfBirth)}`
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
                {patient.lastName}, {patient.firstName} — {formatDob(patient.dateOfBirth)}
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

export function PatientForm({
  defaultValues,
  submit,
  submitLabel,
  submittingLabel,
  saved,
  footerStart,
  onDirtyChange,
}: {
  defaultValues: PatientFormValues
  /** Runs the mutation; a thrown tRPC error is mapped back onto the fields. */
  submit: (value: PatientFormSubmission) => Promise<void>
  submitLabel: React.ReactNode
  submittingLabel: string
  /** True once the mutation has succeeded — releases the leave warning. */
  saved: boolean
  /** Rendered at the card footer's left edge (the edit page's status action). */
  footerStart?: React.ReactNode
  /** Lets the page guard its own back-navigation with the form's dirty state. */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: ({ value }) => clientErrors(value),
      // Runs only after the client parse passes, so an invalid submit never
      // reaches the network. A thrown mutation is translated back into form
      // errors; returning them (rather than resolving) keeps the submit failed.
      onSubmitAsync: async ({ value }) => {
        try {
          await submit({ ...value, gender: value.gender as PatientGender })
          return undefined
        } catch (error) {
          const failure = validationFrom(error)
          if (failure !== null) return toFormErrors(failure, COPY)
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

  type TextFieldName = {
    [K in keyof PatientFormValues]: PatientFormValues[K] extends string ? K : never
  }[keyof PatientFormValues]

  const textField = (
    name: TextFieldName,
    label: string,
    options: {
      type?: string
      placeholder?: string
      description?: string
      className?: string
    } = {},
  ) => (
    <form.Field name={name}>
      {(field) => (
        <Field className={options.className} data-invalid={!field.state.meta.isValid}>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
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
    name: TextFieldName,
    label: string,
    items: ReadonlyArray<{ value: string; label: string }>,
    options: { placeholder?: string; description?: string; className?: string } = {},
  ) => (
    <form.Field name={name}>
      {(field) => (
        <Field className={options.className} data-invalid={!field.state.meta.isValid}>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
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
          <CardTitle>Patient intake</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
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

            <div className="grid gap-4 sm:grid-cols-2 3xl:grid-cols-4">
              {textField("firstName", "First name", { placeholder: "First name" })}
              {textField("lastName", "Last name", { placeholder: "Last name" })}
              {selectField(
                "gender",
                "Gender",
                PATIENT_GENDERS.map((value) => ({ value, label: value === "male" ? "Male" : "Female" })),
              )}
              {textField("heightInches", "Height (inches)", { placeholder: "64" })}
              {textField("dateOfBirth", "Date of birth", { type: "date" })}
              {textField("healthyWeight", "Healthy weight (lbs)", {
                placeholder: "135",
                description: "Optional.",
              })}
              {selectField(
                "language",
                "Language",
                PATIENT_LANGUAGES.map((value) => ({
                  value,
                  label: value === "english" ? "English" : "Spanish",
                })),
                { description: "Optional." },
              )}
              {selectField("office", "Office", asItems(PATIENT_OFFICES), { description: "Optional." })}

              {textField("email", "Email", {
                type: "email",
                placeholder: "patient@email.com",
                description: "Optional.",
              })}
              {textField("addressStreet", "Street", { placeholder: "Street address" })}
              {textField("addressCity", "City", { placeholder: "City" })}
              {selectField(
                "addressState",
                "State",
                US_STATES.map((state) => ({ value: state.code, label: state.name })),
              )}
              {textField("addressZip", "Zip code", { placeholder: "90210" })}
              {textField("phone", "Phone", {
                type: "tel",
                placeholder: "(951) 555-0000",
                description: "Any format — ten digits.",
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
              {selectField("referralSource", "Referral source", asItems(PATIENT_REFERRAL_SOURCES), {
                description: "Optional.",
              })}
            </div>

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

            <form.Field name="historyNotes">
              {(field) => (
                <Field data-invalid={!field.state.meta.isValid}>
                  <FieldLabel htmlFor={field.name}>Current medications and pertinent history</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    rows={6}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={!field.state.meta.isValid}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.office}>
              {(office) =>
                AT_HOME_OFFICE.test(office) ? (
                  <div className="grid gap-4 sm:grid-cols-2 3xl:grid-cols-4">
                    {selectField("programType", "Program name", asItems(PATIENT_PROGRAM_TYPES), {
                      description: "The At Home program the patient is enrolled in.",
                    })}
                  </div>
                ) : null
              }
            </form.Subscribe>
          </FieldGroup>
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
