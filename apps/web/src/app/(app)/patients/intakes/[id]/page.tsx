"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Check, FileSignature, X } from "lucide-react"
import { toast } from "sonner"

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { PageHeader } from "@/components/page-header"
import { useLocation } from "@/components/location-provider"
import { useSurfaces } from "@/components/role-provider"
import { PatientForm, toIntakeFormValues } from "@/features/patients/patient-form"
import { INTAKE_TABS } from "@/features/patients/patient-tabs"
import { trpc } from "@/trpc/client"

/**
 * Reviewing a pending intake (DIA-72): the submission opens in the tabbed
 * form, editable, and the front desk either accepts it — the reviewed form
 * becomes the patient record and the page moves to it — or rejects it. Both
 * take the request out of the queue. Billing is absent, as it was on the
 * person's form; it is entered on the record afterwards.
 *
 * Two things the person gave are not form fields and show above it: when
 * they would like to be called, and the consent they signed (name, date,
 * language). Both stay on the request (ADR 29 as amended).
 */

const CONTACT_TIME_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as const

function formatSigned(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Display formatting only; storage stays ten bare digits. */
function formatPhone(phone: string): string {
  return phone.length === 10 ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}` : phone
}

/** The submission's name once there is one, the request's when typed, the phone otherwise. */
function requestName(request: { firstName: string | null; lastName: string | null; phone: string; submission?: { firstName: string; lastName: string } | null }): string {
  if (request.submission) return `${request.submission.firstName} ${request.submission.lastName}`
  const typed = `${request.firstName ?? ""} ${request.lastName ?? ""}`.trim()
  return typed === "" ? formatPhone(request.phone) : typed
}

export default function ReviewIntakePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const utils = trpc.useUtils()
  const { clerical } = useSurfaces()
  const { nameForOffice } = useLocation()
  const [confirmingReject, setConfirmingReject] = React.useState(false)
  const [accepted, setAccepted] = React.useState(false)

  const request = trpc.intake.byId.useQuery({ id: params.id }, { enabled: clerical, retry: false })
  const accept = trpc.intake.accept.useMutation()
  const reject = trpc.intake.reject.useMutation({
    onSuccess: (rejected) => {
      void utils.intake.listPending.invalidate()
      toast.success(`Intake from ${requestName(rejected)} rejected`)
      router.push("/patients")
    },
    onError: () => toast.error("The intake could not be rejected. It may already have been reviewed."),
  })

  if (!clerical) {
    return (
      <Empty>
        <EmptyTitle>Front desk only</EmptyTitle>
        <EmptyDescription>
          Pending intakes are reviewed by the front desk.{" "}
          <Link href="/patients" className="underline">Back to patients</Link>
        </EmptyDescription>
      </Empty>
    )
  }

  if (request.isPending) {
    return <p className="py-8 text-center text-muted-foreground">Loading intake…</p>
  }

  if (request.isError || request.data === undefined || request.data.submission === null) {
    return (
      <Empty>
        <EmptyTitle>Intake not found</EmptyTitle>
        <EmptyDescription>
          This intake does not exist or has not been submitted yet.{" "}
          <Link href="/patients" className="underline">Back to patients</Link>
        </EmptyDescription>
      </Empty>
    )
  }

  const pending = request.data
  const submission = pending.submission
  if (pending.status !== "submitted" || submission === null) {
    return (
      <Empty>
        <EmptyTitle>Already reviewed</EmptyTitle>
        <EmptyDescription>
          This intake was {pending.status}.{" "}
          {pending.patientId !== null ? (
            <Link href={`/patients/${pending.patientId}/edit`} className="underline">Open the patient record</Link>
          ) : (
            <Link href="/patients" className="underline">Back to patients</Link>
          )}
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to patients"
          className="-ml-2"
          nativeButton={false}
          render={<Link href="/patients" />}
        >
          <ArrowLeft />
        </Button>
        <PageHeader
          className="mb-0 flex-1"
          title={requestName(pending)}
          description={`Pending intake for ${pending.office === null ? "an office" : nameForOffice(pending.office)}. Review, edit if needed, then accept or reject.`}
        />
      </div>

      <Alert className="mb-4">
        <FileSignature />
        <AlertTitle>
          {pending.consent === null
            ? "No consent on file for this submission"
            : `Consent signed by ${pending.consent.signature} on ${formatSigned(pending.consent.signedAt)} (${pending.consent.language === "spanish" ? "Spanish" : "English"})`}
        </AlertTitle>
        <AlertDescription>
          Best time to call:{" "}
          {submission.preferredContactTime === undefined
            ? "not given"
            : CONTACT_TIME_LABEL[submission.preferredContactTime]}
          . Submitted from the self-service form; the office was the person&apos;s choice.
        </AlertDescription>
      </Alert>

      <PatientForm
        title="Submitted information"
        key={pending.id}
        sections={INTAKE_TABS}
        defaultValues={toIntakeFormValues(submission)}
        submit={async (value) => {
          const chart = await accept.mutateAsync({ ...value, id: pending.id })
          setAccepted(true)
          void utils.intake.listPending.invalidate()
          void utils.patient.recent.invalidate()
          toast.success(`${chart.firstName} ${chart.lastName} added`)
          router.push(`/patients/${chart.id}/edit`)
        }}
        submitLabel={
          <>
            <Check data-icon="inline-start" />
            Accept into patient record
          </>
        }
        submittingLabel="Accepting…"
        saved={accepted}
        officeRequired
        footerStart={
          <Button
            type="button"
            variant="destructive"
            disabled={reject.isPending}
            onClick={() => setConfirmingReject(true)}
          >
            <X data-icon="inline-start" />
            Reject
          </Button>
        }
      />

      <AlertDialog open={confirmingReject} onOpenChange={setConfirmingReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this intake?</AlertDialogTitle>
            <AlertDialogDescription>
              No patient record will be created and the submission leaves the queue. The person
              would need a new link to try again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => reject.mutate({ id: pending.id })}>
              Reject intake
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
