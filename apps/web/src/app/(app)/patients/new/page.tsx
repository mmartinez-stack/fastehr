"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { useForm, useStore } from "@tanstack/react-form"
import { createPatientInput, describeValidationFailure } from "@fastehr/contracts"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { PageHeader } from "@/components/page-header"
import { toFormErrors, validationFrom, type FormCopy, type FormErrors } from "@/lib/form-errors"
import { trpc } from "@/trpc/client"

/**
 * The reference form (docs/forms.md). The shape to copy:
 *
 * - One schema, `createPatientInput` from `@fastehr/contracts`, validates on
 *   both sides. The submit validator runs it here for immediate errors; the
 *   mutation runs it again on the server, and a failure from either side is a
 *   `ValidationFailure` resolved through the same copy table below.
 * - The mutation runs inside `onSubmitAsync`, so a server rejection lands in
 *   the form's own error state and the success path only runs when the row
 *   exists.
 * - Fields the backend does not persist yet are not on the form. They return
 *   with their domain tickets — a control that silently drops what was typed
 *   into it is worse than its absence.
 */

/**
 * Every message a user reads, keyed by field and issue code — codes are all
 * the server sends (ADR 12). Good copy says what to do next; it never repeats
 * what was typed, and never names a system.
 */
const COPY: FormCopy = {
  firstName: { too_small: "Enter the patient's first name." },
  lastName: { too_small: "Enter the patient's last name." },
  dateOfBirth: {
    invalid_format: "Enter the patient's date of birth.",
    custom: "Date of birth must be a past date.",
  },
  email: { invalid_format: "Enter a valid email address, like name@example.com." },
  phone: { invalid_format: "Enter a phone number with ten digits." },
}

const SAVE_FAILED = "The patient could not be saved. Check your connection and try again."

function clientErrors(value: unknown): FormErrors | undefined {
  const result = createPatientInput.safeParse(value)
  if (result.success) return undefined
  const failure = describeValidationFailure(result.error)
  return failure === null ? undefined : toFormErrors(failure, COPY)
}

/** Chrome ignores the message but requires the preventDefault; both are per spec. */
function useLeaveWarning(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [enabled])
}

const DEFAULTS = { firstName: "", lastName: "", dateOfBirth: "", email: "", phone: "" }

export default function NewPatientPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)

  const createPatient = trpc.patient.create.useMutation({
    onSuccess: (created) => {
      void utils.patient.list.invalidate()
      toast.success(`${created.firstName} ${created.lastName} added`)
      router.push("/patients")
    },
  })

  const form = useForm({
    defaultValues: DEFAULTS,
    validators: {
      onSubmit: ({ value }) => clientErrors(value),
      // Runs only after the client parse passes, so an invalid submit never
      // reaches the network. A thrown mutation is translated back into form
      // errors; returning them (rather than resolving) keeps the submit failed.
      onSubmitAsync: async ({ value }) => {
        try {
          await createPatient.mutateAsync(value)
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
  useLeaveWarning(isDirty && !createPatient.isSuccess)

  const guardLeave = (event: { preventDefault: () => void }) => {
    if (form.state.isDirty && !createPatient.isSuccess) {
      event.preventDefault()
      setConfirmingLeave(true)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        nativeButton={false}
        render={<Link href="/patients" onNavigate={guardLeave} />}
      >
        <ArrowLeft data-icon="inline-start" />
        Back to patients
      </Button>

      <PageHeader title="New Patient" description="Create a new patient record." />

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

              <div className="grid gap-4 sm:grid-cols-2">
                <form.Field name="firstName">
                  {(field) => (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <FieldLabel htmlFor={field.name}>First name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!field.state.meta.isValid}
                        placeholder="First name"
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="lastName">
                  {(field) => (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <FieldLabel htmlFor={field.name}>Last name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!field.state.meta.isValid}
                        placeholder="Last name"
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="dateOfBirth">
                  {(field) => (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <FieldLabel htmlFor={field.name}>Date of birth</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="date"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!field.state.meta.isValid}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="phone">
                  {(field) => (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <FieldLabel htmlFor={field.name}>Phone</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="tel"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!field.state.meta.isValid}
                        placeholder="(951) 555-0000"
                      />
                      <FieldDescription>Optional. Any format — ten digits.</FieldDescription>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="email">
                  {(field) => (
                    <Field className="sm:col-span-2" data-invalid={!field.state.meta.isValid}>
                      <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!field.state.meta.isValid}
                        placeholder="patient@email.com"
                      />
                      <FieldDescription>Optional.</FieldDescription>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
              </div>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  <UserPlus data-icon="inline-start" />
                  {isSubmitting ? "Creating…" : "Create Patient"}
                </Button>
              )}
            </form.Subscribe>
          </CardFooter>
        </Card>
      </form>

      <AlertDialog open={confirmingLeave} onOpenChange={setConfirmingLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this patient?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing has been saved. What you entered will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => router.push("/patients")}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
