"use client"

import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { MessageSquareText } from "lucide-react"
import {
  describeValidationFailure,
  PATIENT_LANGUAGES,
  sendPatientIntakeInput,
} from "@fastehr/contracts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/required-mark"
import { toFormErrors, type FormCopy } from "@/lib/form-errors"

/**
 * The legacy "Send Intake Form" panel: text a person a link to the
 * self-service intake page, before any patient record exists — they enter
 * their own details from their phone, in the language chosen here.
 *
 * The form validates through `sendPatientIntakeInput` (ADR 25) today; the
 * send itself belongs to the messaging domain, which is not wired yet, so a
 * valid submit says exactly that instead of pretending a text went out. When
 * the messaging procedure lands, the submit handler is the only thing that
 * changes.
 */

const COPY: FormCopy = {
  firstName: { too_small: "Enter the person's first name.", too_big: "First name can be at most 50 characters." },
  lastName: { too_small: "Enter the person's last name.", too_big: "Last name can be at most 100 characters." },
  phone: { invalid_format: "Enter a phone number with ten digits." },
  language: { invalid_value: "Select a language from the list." },
}

export function IntakeForm() {
  const [readyToSend, setReadyToSend] = React.useState(false)

  const form = useForm({
    defaultValues: { firstName: "", lastName: "", phone: "", language: "" },
    validators: {
      onSubmit: ({ value }) => {
        setReadyToSend(false)
        const result = sendPatientIntakeInput.safeParse(value)
        if (result.success) {
          setReadyToSend(true)
          return undefined
        }
        const failure = describeValidationFailure(result.error)
        return failure === null ? undefined : toFormErrors(failure, COPY)
      },
    },
  })

  const textField = (
    name: "firstName" | "lastName" | "phone",
    label: string,
    options: { type?: string; placeholder?: string; description?: string; required?: boolean } = {},
  ) => (
    <form.Field name={name}>
      {(field) => (
        <Field data-invalid={!field.state.meta.isValid}>
          <FieldLabel htmlFor={`intake-${field.name}`}>
            {label}
            {options.required === true ? <RequiredMark /> : null}
          </FieldLabel>
          <Input
            id={`intake-${field.name}`}
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
          <CardTitle>Send intake form</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <p className="text-sm text-muted-foreground">
              Texts the person a link to the self-service intake page. They fill in their own
              details from their phone, and no record is created here first.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-8">
              {textField("firstName", "First name", { placeholder: "First name", required: true })}
              {textField("lastName", "Last name", { placeholder: "Last name", required: true })}
              {textField("phone", "Phone", {
                type: "tel",
                placeholder: "(951) 555-0000",
                description: "Any format, ten digits.",
                required: true,
              })}
              <form.Field name="language">
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel htmlFor="intake-language">Language</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(typeof value === "string" ? value : "")
                      }
                    >
                      <SelectTrigger
                        id="intake-language"
                        className="w-full"
                        aria-invalid={!field.state.meta.isValid}
                      >
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {PATIENT_LANGUAGES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value === "english" ? "English" : "Spanish"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>Picks the translation of the text.</FieldDescription>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            </div>

            {readyToSend ? (
              <Alert>
                <MessageSquareText />
                <AlertTitle>Nothing was sent</AlertTitle>
                <AlertDescription>
                  The details are valid, but text messaging is not connected yet. This form will
                  send the intake link once the messaging integration lands.
                </AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit">
            <MessageSquareText data-icon="inline-start" />
            Send Intake Form
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
