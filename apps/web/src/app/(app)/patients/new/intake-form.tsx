"use client"

import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { Copy, MessageSquareText } from "lucide-react"
import { toast } from "sonner"
import {
  describeValidationFailure,
  INTAKE_LINK_TTL_HOURS,
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
import { toFormErrors, validationFrom, type FormCopy } from "@/lib/form-errors"
import { trpc } from "@/trpc/client"

/**
 * The legacy "Send Intake Form" panel: text a person a link to the
 * self-service intake page, before any patient record exists — they enter
 * their own details from their phone, in the language chosen here (DIA-72,
 * ADR 29). The link is single-use and expires; what comes back waits in the
 * Pending tab of the office the person picks.
 *
 * Validates through `sendPatientIntakeInput` (ADR 25) and submits to
 * `intake.send`. Without Twilio credentials the server prints the text to
 * its log instead of sending it, and answers with the link itself: the
 * alert below shows it with a copy button, so a tester can open the form
 * without reading the log and nobody waits for a phone to buzz.
 */

const COPY: FormCopy = {
  firstName: { too_small: "Enter the person's first name.", too_big: "First name can be at most 50 characters." },
  lastName: { too_small: "Enter the person's last name.", too_big: "Last name can be at most 100 characters." },
  phone: { invalid_format: "Enter a phone number with ten digits." },
  language: { invalid_value: "Select a language from the list." },
}

const SEND_FAILED = "The link could not be sent. Check your connection and try again."

/** Display formatting only — storage stays ten bare digits. */
function formatPhone(phone: string): string {
  return phone.length === 10 ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}` : phone
}

export function IntakeForm() {
  const [sent, setSent] = React.useState<{ to: string; link: string | null } | null>(null)
  const send = trpc.intake.send.useMutation()

  const form = useForm({
    defaultValues: { firstName: "", lastName: "", phone: "", language: "" },
    validators: {
      onSubmit: ({ value }) => {
        const result = sendPatientIntakeInput.safeParse(value)
        if (result.success) return undefined
        const failure = describeValidationFailure(result.error)
        return failure === null ? undefined : toFormErrors(failure, COPY)
      },
      onSubmitAsync: async ({ value, formApi }) => {
        try {
          const { request, link } = await send.mutateAsync(value)
          setSent({ to: request.phone, link })
          toast.success(
            link === null
              ? `Intake link sent to ${request.firstName} ${request.lastName}`
              : `Intake link created for ${request.firstName} ${request.lastName}`,
          )
          formApi.reset()
          return undefined
        } catch (error) {
          const failure = validationFrom(error)
          if (failure !== null) return toFormErrors(failure, COPY)
          return { form: SEND_FAILED, fields: {} }
        }
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
              details from their phone and pick the office they will visit; the submission then
              waits in that office&apos;s Pending tab for review. The link works once and expires
              after {INTAKE_LINK_TTL_HOURS} hours.
            </p>

            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(formError) =>
                typeof formError === "string" ? (
                  <Alert variant="destructive">
                    <AlertTitle>The link was not sent</AlertTitle>
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                ) : null
              }
            </form.Subscribe>

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

            {sent === null ? null : sent.link === null ? (
              <Alert>
                <MessageSquareText />
                <AlertTitle>Link sent to {formatPhone(sent.to)}</AlertTitle>
                <AlertDescription>
                  The submission will appear in the Pending tab of the office the person picks.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <MessageSquareText />
                <AlertTitle>Text messaging is not configured, so nothing was sent to {formatPhone(sent.to)}</AlertTitle>
                <AlertDescription className="flex flex-col gap-2">
                  <span>
                    Open the link yourself or pass it on. It works once and expires after{" "}
                    {INTAKE_LINK_TTL_HOURS} hours.
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{sent.link}</code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(sent.link ?? "").then(
                          () => toast.success("Link copied"),
                          () => toast.error("The link could not be copied. Select it and copy it by hand."),
                        )
                      }}
                    >
                      <Copy data-icon="inline-start" />
                      Copy link
                    </Button>
                  </span>
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                <MessageSquareText data-icon="inline-start" />
                {isSubmitting ? "Sending…" : "Send Intake Form"}
              </Button>
            )}
          </form.Subscribe>
        </CardFooter>
      </Card>
    </form>
  )
}
