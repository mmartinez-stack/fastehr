"use client"

import * as React from "react"
import { PlusIcon, Send, Trash2Icon } from "lucide-react"
import { useForm } from "@tanstack/react-form"
import {
  describeValidationFailure,
  INTAKE_CONSENT_TEXT,
  INTAKE_CONSENT_VERSION,
  INTAKE_CONTACT_TIMES,
  PATIENT_CONDITIONS,
  PATIENT_GENDERS,
  PATIENT_OFFICES,
  PATIENT_REFERRAL_SOURCES,
  submitIntakeInput,
  type IntakeContactTime,
  type PatientCondition,
  type PatientGender,
  type PatientLanguage,
  type PatientOffice,
  type ValidationFailure,
} from "@fastehr/contracts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { RequiredMark } from "@/components/required-mark"
import { US_STATES } from "@/features/patients/us-states.ts"
import { validationFrom, type FormErrors } from "@/lib/form-errors"
import { trpc } from "@/trpc/client"
import { INTAKE_COPY } from "./intake-copy.ts"

/**
 * The person's side of the intake (DIA-72, ADR 29 as amended): one scrolling
 * page for a phone, six short sections in the order the legacy form asked
 * them, and a consent to sign at the end. Not the staff form: no tabs, no
 * clinical shorthand, one column, plain labels in the person's language.
 *
 * Underneath it is the same contract the staff review screen reads
 * (`submitIntakeInput`), so what lands in the queue prefills the reviewer's
 * form without translation. The checklist here is the fourteen conditions as
 * Yes/No with "since when"; who treats it and whether it is medicated are the
 * reviewer's to add if the person mentions them at the visit.
 *
 * Validation follows docs/forms.md: the contract parses on submit here, the
 * server parses again, and every message comes from the copy table for the
 * language the page is in. The page scrolls to the first field that failed.
 */

interface MedicationRowValues {
  name: string
  dose: string
  frequency: string
}

interface ConditionRowValues {
  condition: PatientCondition
  present: boolean
  onset: string
  treatedBy: string
  medicated: boolean
  medications: string
}

export interface PatientIntakeValues {
  firstName: string
  lastName: string
  gender: string
  dateOfBirth: string
  phone: string
  phoneFollowUpAllowed: boolean
  preferredContactTime: string
  email: string
  addressStreet: string
  addressCity: string
  addressState: string
  addressZip: string
  office: string
  referralSource: string
  heightFeet: string
  heightInchesPart: string
  conditions: ConditionRowValues[]
  medications: MedicationRowValues[]
  pcpName: string
  pcpPhone: string
  consentAcknowledged: boolean
  consentSignature: string
}

const EMPTY_MEDICATION: MedicationRowValues = { name: "", dose: "", frequency: "" }

export function emptyIntakeValues(firstName: string, lastName: string): PatientIntakeValues {
  return {
    firstName,
    lastName,
    gender: "",
    dateOfBirth: "",
    phone: "",
    phoneFollowUpAllowed: true,
    preferredContactTime: "",
    email: "",
    addressStreet: "",
    addressCity: "",
    addressState: "",
    addressZip: "",
    office: "",
    referralSource: "",
    heightFeet: "",
    heightInchesPart: "",
    conditions: PATIENT_CONDITIONS.map((condition) => ({
      condition,
      present: false,
      onset: "",
      treatedBy: "",
      medicated: false,
      medications: "",
    })),
    medications: [],
    pcpName: "",
    pcpPhone: "",
    consentAcknowledged: false,
    consentSignature: "",
  }
}

const FEET = ["3", "4", "5", "6", "7"]

/**
 * What the contract parses: the form's values plus what the page knows and
 * the person does not type (the token, the language, the consent version)
 * and the staff-only fields the schema still lists, blank.
 */
function toSubmitInput(value: PatientIntakeValues, token: string, language: PatientLanguage) {
  return {
    ...value,
    token,
    language,
    referredByPatientId: "",
    programType: "",
    pcpAddress: "",
    consentVersion: INTAKE_CONSENT_VERSION,
  }
}

/**
 * A failure → field errors, the contract's `medications.0.name` addressed
 * as TanStack's `medications[0].name` and looked up as `medications.name`.
 */
function toFieldErrors(failure: ValidationFailure, language: PatientLanguage): FormErrors {
  const copy = INTAKE_COPY[language]
  const fields: Record<string, { message: string }> = {}
  for (const [path, codes] of Object.entries(failure.fieldErrors)) {
    const code = codes[0]
    if (code === undefined) continue
    const copyKey = path.replace(/\.\d+\./g, ".").replace(/\.\d+$/, "")
    const fieldKey = path.replace(/\.(\d+)/g, "[$1]")
    fields[fieldKey] = { message: copy.errors[copyKey]?.[code] ?? copy.page.fallbackField }
  }
  return { form: copy.page.fixFields, fields }
}

/** After a failed submit on a long page, the first problem comes into view. */
function scrollToFirstInvalid() {
  window.requestAnimationFrame(() => {
    document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" })
  })
}

/** "2026-09-13" in the person's locale, from the calendar date rather than an instant. */
function formatToday(language: PatientLanguage): string {
  return new Date().toLocaleDateString(language === "spanish" ? "es-US" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function PatientIntakeForm({
  token,
  language,
  defaultValues,
  onDone,
}: {
  token: string
  language: PatientLanguage
  defaultValues: PatientIntakeValues
  onDone: () => void
}) {
  const copy = INTAKE_COPY[language]
  const submit = trpc.intake.submit.useMutation()

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: ({ value }) => {
        const result = submitIntakeInput.safeParse(toSubmitInput(value, token, language))
        if (result.success) return undefined
        const failure = describeValidationFailure(result.error)
        if (failure === null) return undefined
        scrollToFirstInvalid()
        return toFieldErrors(failure, language)
      },
      onSubmitAsync: async ({ value }) => {
        try {
          // The client parse above already accepted these; the casts only
          // name what it accepted.
          await submit.mutateAsync({
            ...toSubmitInput(value, token, language),
            gender: value.gender as PatientGender,
            office: value.office as PatientOffice,
            preferredContactTime: value.preferredContactTime as IntakeContactTime,
            consentAcknowledged: true,
          })
          onDone()
          return undefined
        } catch (error) {
          const failure = validationFrom(error)
          if (failure !== null) {
            scrollToFirstInvalid()
            return toFieldErrors(failure, language)
          }
          return { form: copy.page.notSent, fields: {} }
        }
      },
    },
  })

  const textField = (
    name: string,
    label: string,
    options: {
      type?: string
      inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
      autoComplete?: string
      placeholder?: string
      description?: string
      required?: boolean
      disabled?: boolean
    } = {},
  ) => (
    <form.Field name={name as "firstName"}>
      {(field) => (
        <Field data-invalid={!field.state.meta.isValid}>
          <FieldLabel htmlFor={field.name}>
            {label}
            {options.required === true ? <RequiredMark /> : null}
          </FieldLabel>
          <Input
            id={field.name}
            name={field.name}
            type={options.type ?? "text"}
            inputMode={options.inputMode}
            autoComplete={options.autoComplete}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            aria-invalid={!field.state.meta.isValid}
            placeholder={options.placeholder}
            disabled={options.disabled}
            className="h-10"
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
    options: { description?: string; required?: boolean } = {},
  ) => (
    <form.Field name={name as "firstName"}>
      {(field) => (
        <Field data-invalid={!field.state.meta.isValid}>
          <FieldLabel htmlFor={field.name}>
            {label}
            {options.required === true ? <RequiredMark /> : null}
          </FieldLabel>
          <Select
            value={field.state.value}
            onValueChange={(value) => field.handleChange(typeof value === "string" ? value : "")}
          >
            <SelectTrigger id={field.name} className="h-10 w-full" aria-invalid={!field.state.meta.isValid}>
              <SelectValue placeholder={copy.options.select} />
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

  /** A row of large touch targets: one radio per option, label included in the target. */
  const radioField = (
    name: string,
    label: string,
    items: ReadonlyArray<{ value: string; label: string }>,
    options: { required?: boolean } = {},
  ) => (
    <form.Field name={name as "firstName"}>
      {(field) => (
        <Field data-invalid={!field.state.meta.isValid}>
          <FieldLabel>
            {label}
            {options.required === true ? <RequiredMark /> : null}
          </FieldLabel>
          <RadioGroup
            value={field.state.value}
            onValueChange={(value) => field.handleChange(typeof value === "string" ? value : "")}
            className="flex flex-row flex-wrap gap-2"
            aria-invalid={!field.state.meta.isValid}
            aria-label={label}
          >
            {items.map((item) => (
              <label
                key={item.value}
                className="flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5"
              >
                <RadioGroupItem value={item.value} />
                {item.label}
              </label>
            ))}
          </RadioGroup>
          <FieldError errors={field.state.meta.errors} />
        </Field>
      )}
    </form.Field>
  )

  const conditionRow = (condition: PatientCondition, index: number) => (
    <form.Field key={condition} name={`conditions[${index}].present` as "phoneFollowUpAllowed"}>
      {(presentField) => (
        <div className="flex flex-col gap-3 py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="text-sm font-medium">{copy.conditions[condition]}</span>
            <RadioGroup
              value={presentField.state.value ? "yes" : "no"}
              onValueChange={(value) => presentField.handleChange(value === "yes")}
              className="flex w-auto flex-row items-center gap-2"
              aria-label={copy.conditions[condition]}
            >
              <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5">
                <RadioGroupItem value="no" />
                {copy.options.no}
              </label>
              <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5">
                <RadioGroupItem value="yes" />
                {copy.options.yes}
              </label>
            </RadioGroup>
          </div>
          {presentField.state.value
            ? textField(`conditions[${index}].onset`, copy.labels.onset, { placeholder: "2019" })
            : null}
        </div>
      )}
    </form.Field>
  )

  const fullName = (first: string, last: string) => `${first.trim()} ${last.trim()}`.trim()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      <Section title={copy.sections.about} step={1}>
        {textField("firstName", copy.labels.firstName, { autoComplete: "given-name", required: true })}
        {textField("lastName", copy.labels.lastName, { autoComplete: "family-name", required: true })}
        {textField("dateOfBirth", copy.labels.dateOfBirth, { type: "date", autoComplete: "bday", required: true })}
        {radioField(
          "gender",
          copy.labels.gender,
          PATIENT_GENDERS.map((value) => ({ value, label: copy.options.gender[value] })),
          { required: true },
        )}
      </Section>

      <Section title={copy.sections.reach} step={2}>
        {textField("phone", copy.labels.phone, {
          type: "tel",
          inputMode: "tel",
          autoComplete: "tel",
          placeholder: "(951) 555-0000",
          description: copy.labels.phoneHint,
          required: true,
        })}
        <form.Field name="phoneFollowUpAllowed">
          {(field) => (
            <Field>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <Checkbox
                  id={field.name}
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                  className="mt-0.5"
                />
                <span>{copy.labels.followUp}</span>
              </label>
            </Field>
          )}
        </form.Field>
        {radioField(
          "preferredContactTime",
          copy.labels.contactTime,
          INTAKE_CONTACT_TIMES.map((value) => ({ value, label: copy.options.contactTime[value] })),
          { required: true },
        )}
        {textField("email", copy.labels.email, {
          type: "email",
          inputMode: "email",
          autoComplete: "email",
          placeholder: "name@example.com",
        })}
      </Section>

      <Section title={copy.sections.address} step={3}>
        {textField("addressStreet", copy.labels.street, { autoComplete: "street-address", required: true })}
        {textField("addressCity", copy.labels.city, { autoComplete: "address-level2", required: true })}
        <div className="grid grid-cols-2 gap-4">
          {selectField(
            "addressState",
            copy.labels.state,
            US_STATES.map((state) => ({ value: state.code, label: state.name })),
            { required: true },
          )}
          {textField("addressZip", copy.labels.zip, {
            inputMode: "numeric",
            autoComplete: "postal-code",
            placeholder: "90210",
            required: true,
          })}
        </div>
      </Section>

      <Section title={copy.sections.visit} step={4}>
        {selectField(
          "office",
          copy.labels.office,
          PATIENT_OFFICES.map((value) => ({ value, label: value })),
          { required: true, description: copy.labels.officeHint },
        )}
        {selectField(
          "referralSource",
          copy.labels.referralSource,
          PATIENT_REFERRAL_SOURCES.map((value) => ({ value, label: value })),
        )}
      </Section>

      <Section title={copy.sections.health} step={5}>
        <div className="grid grid-cols-2 gap-4">
          {selectField(
            "heightFeet",
            copy.labels.heightFeet,
            FEET.map((value) => ({ value, label: value })),
            { required: true },
          )}
          {textField("heightInchesPart", copy.labels.heightInches, {
            inputMode: "decimal",
            placeholder: "4",
            description: copy.labels.heightHint,
            required: true,
          })}
        </div>

        <div className="flex flex-col">
          <p className="text-sm font-medium">{copy.labels.conditionsIntro}</p>
          <div className="divide-y divide-border">
            {PATIENT_CONDITIONS.map((condition, index) => conditionRow(condition, index))}
          </div>
        </div>

        <form.Field name="medications" mode="array">
          {(list) => (
            <FieldGroup>
              <p className="text-sm font-medium">{copy.labels.medicationsIntro}</p>
              {list.state.value.map((_, index) => (
                <div key={index} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  {textField(`medications[${index}].name`, copy.labels.medication, { required: true })}
                  <div className="grid grid-cols-2 gap-3">
                    {textField(`medications[${index}].dose`, copy.labels.dose, { placeholder: "10 mg" })}
                    {textField(`medications[${index}].frequency`, copy.labels.frequency)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-end"
                    onClick={() => list.removeValue(index)}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {copy.labels.removeMedication}
                  </Button>
                </div>
              ))}
              <div>
                <Button type="button" variant="outline" onClick={() => list.pushValue({ ...EMPTY_MEDICATION })}>
                  <PlusIcon data-icon="inline-start" />
                  {copy.labels.addMedication}
                </Button>
              </div>
              <FieldError errors={list.state.meta.errors} />
            </FieldGroup>
          )}
        </form.Field>

        {textField("pcpName", copy.labels.pcpName, { placeholder: "Dr. Name" })}
        {textField("pcpPhone", copy.labels.pcpPhone, {
          type: "tel",
          inputMode: "tel",
          placeholder: "(951) 555-0000",
        })}
      </Section>

      <Section title={copy.sections.consent} step={6}>
        <p className="text-sm text-muted-foreground">{copy.labels.consentIntro}</p>
        <div
          className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed"
          tabIndex={0}
          aria-label={copy.sections.consent}
        >
          {INTAKE_CONSENT_TEXT[language]}
        </div>
        <form.Field name="consentAcknowledged">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <label className="flex cursor-pointer items-start gap-3 text-sm font-medium">
                <Checkbox
                  id={field.name}
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                  aria-invalid={!field.state.meta.isValid}
                  className="mt-0.5"
                />
                <span>
                  {copy.labels.consentAcknowledge}
                  <RequiredMark />
                </span>
              </label>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Subscribe
          selector={(state) => ({
            acknowledged: state.values.consentAcknowledged,
            name: fullName(state.values.firstName, state.values.lastName),
          })}
        >
          {({ acknowledged, name }) =>
            textField("consentSignature", copy.labels.signature, {
              autoComplete: "off",
              placeholder: name,
              description: copy.labels.signatureHint(name),
              required: true,
              // Signing comes after reading: the box unlocks the signature.
              disabled: !acknowledged,
            })
          }
        </form.Subscribe>
        <p className="text-sm text-muted-foreground">
          {copy.labels.signedOn}: {formatToday(language)}
        </p>
      </Section>

      <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
        {(formError) =>
          typeof formError === "string" ? (
            <Alert variant="destructive">
              <AlertTitle>{copy.page.notSentTitle}</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null
        }
      </form.Subscribe>

      {/* The action stays in reach on a phone: pinned to the bottom edge,
          above the page's own bottom padding. */}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isSubmitting}>
              <Send data-icon="inline-start" />
              {isSubmitting ? copy.page.sending : copy.page.send}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

/** A numbered card: the person can see how far along they are without a progress bar. */
function Section({ title, step, children }: { title: string; step: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {step}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}
