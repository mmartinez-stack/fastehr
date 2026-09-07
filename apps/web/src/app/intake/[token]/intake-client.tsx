"use client"

import * as React from "react"
import { CheckCircle2, HeartPulse, Send } from "lucide-react"
import type { PatientOffice } from "@fastehr/contracts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { EMPTY_PATIENT_FORM, PatientForm } from "@/features/patients/patient-form"
import { INTAKE_TABS } from "@/features/patients/patient-tabs"
import { trpc } from "@/trpc/client"

/**
 * The person's side of the intake: the same tabbed form the front desk
 * uses, minus Billing (no card details are ever asked for here), with the
 * office required because it decides which queue the submission lands in.
 * The name arrives prefilled from the request; everything else is theirs to
 * type. One submit, then a thank-you — the link is spent.
 */

export function IntakeClient({ token }: { token: string }) {
  const invite = trpc.intake.open.useQuery({ token }, { retry: false })
  const submit = trpc.intake.submit.useMutation()
  const [done, setDone] = React.useState(false)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <HeartPulse className="size-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Fastehr</span>
      </header>

      {invite.isPending ? (
        <p className="py-8 text-center text-muted-foreground">Opening your form…</p>
      ) : invite.isError || invite.data === undefined ? (
        <Empty>
          <EmptyTitle>This link is no longer valid</EmptyTitle>
          <EmptyDescription>
            It may have expired or already been used. Please ask the clinic to send you a new one.
          </EmptyDescription>
        </Empty>
      ) : done ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              Thank you, {invite.data.firstName}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Your information has been sent to the clinic. The front desk will review it before your
            visit. You can close this page.
          </CardContent>
        </Card>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome, {invite.data.firstName}</h1>
            <p className="text-sm text-muted-foreground">
              Please fill in each tab and choose the office you will visit, then send the form.
              Fields marked with * are required.
            </p>
          </div>
          <PatientForm
            title="Your information"
            sections={INTAKE_TABS}
            defaultValues={{
              ...EMPTY_PATIENT_FORM,
              firstName: invite.data.firstName,
              lastName: invite.data.lastName,
              language: invite.data.language ?? "",
            }}
            submit={async (value) => {
              // The office is required here and the schema refuses anything
              // outside the list; the narrowing only names what it accepts.
              await submit.mutateAsync({ ...value, token, office: value.office as PatientOffice })
              setDone(true)
            }}
            submitLabel={
              <>
                <Send data-icon="inline-start" />
                Send to the clinic
              </>
            }
            submittingLabel="Sending…"
            saved={done}
            allowReferralPicker={false}
            officeRequired
          />
        </>
      )}
    </main>
  )
}
