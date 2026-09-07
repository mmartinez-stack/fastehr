"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Save } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { PageHeader } from "@/components/page-header"
import { useSurfaces } from "@/components/role-provider"
import {
  CLINICAL_SECTIONS,
  PATIENT_SECTIONS,
  PatientForm,
  toPatientFormValues,
} from "@/features/patients/patient-form"
import { trpc } from "@/trpc/client"

/**
 * Edit — the shared sectioned form, prefilled per section and saved per
 * section (ADR 28). Every role reads the chart (`patient.byId`: header plus
 * the clinical half); the clerical roles also read demographics and billing
 * and render those tabs. One Save runs the section mutations the role may
 * call, so a provider's save never carries a phone number and the server
 * never has to trust the tabs it cannot see.
 *
 * The legacy Make Inactive / Make Active action is gone from here with
 * DIA-50: status is no longer exposed anywhere, though its column and
 * procedure remain.
 */
export default function EditPatientPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const utils = trpc.useUtils()
  const { clerical } = useSurfaces()
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const dirtyRef = React.useRef(false)

  const chart = trpc.patient.byId.useQuery({ id: params.id })
  // Clerical sections are fetched only by clerical roles: a provider's page
  // never even asks, so there is nothing for the server to refuse.
  const demographics = trpc.patient.demographics.useQuery({ id: params.id }, { enabled: clerical })
  const billing = trpc.patient.billing.useQuery({ id: params.id }, { enabled: clerical })

  const invalidate = () => {
    void utils.patient.recent.invalidate()
    void utils.patient.search.invalidate()
    void utils.patient.suggest.invalidate()
    void utils.patient.byId.invalidate({ id: params.id })
    void utils.patient.demographics.invalidate({ id: params.id })
    void utils.patient.billing.invalidate({ id: params.id })
  }

  const updateDemographics = trpc.patient.updateDemographics.useMutation()
  const updateClinical = trpc.patient.updateClinical.useMutation()
  const updateBilling = trpc.patient.updateBilling.useMutation()

  const guardLeave = (event: { preventDefault: () => void }) => {
    if (dirtyRef.current && !saved) {
      event.preventDefault()
      setConfirmingLeave(true)
    }
  }

  const loading = chart.isPending || (clerical && (demographics.isPending || billing.isPending))
  if (loading) {
    return <p className="py-8 text-center text-muted-foreground">Loading patient…</p>
  }

  if (chart.data === null || chart.data === undefined) {
    return (
      <Empty>
        <EmptyTitle>Patient not found</EmptyTitle>
        <EmptyDescription>
          This record does not exist. <Link href="/patients" className="underline">Back to patients</Link>
        </EmptyDescription>
      </Empty>
    )
  }

  const record = chart.data
  const sections = clerical ? PATIENT_SECTIONS : CLINICAL_SECTIONS

  return (
    <div>
      {/* Same compact header as /patients/new: the back arrow shares the
          title row instead of spending a row of its own. */}
      <div className="mb-3 flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to patients"
          className="-ml-2"
          nativeButton={false}
          render={<Link href="/patients" onNavigate={guardLeave} />}
        >
          <ArrowLeft />
        </Button>
        <PageHeader
          className="mb-0 flex-1"
          title={`${record.firstName} ${record.lastName}`}
          description="Edit the patient record."
        />
      </div>

      <PatientForm
        // Remount on a fresh server copy so the form's defaults track the record.
        key={`${record.id}:${chart.dataUpdatedAt}`}
        sections={sections}
        defaultValues={toPatientFormValues(record, demographics.data ?? null, billing.data ?? null)}
        submit={async (value) => {
          // The clinical half first: it is the one every role may save, so a
          // refusal on a clerical section can never leave the chart unsaved.
          await updateClinical.mutateAsync({ ...value, id: record.id })
          if (clerical) {
            await updateDemographics.mutateAsync({ ...value, id: record.id })
            await updateBilling.mutateAsync({ ...value, id: record.id })
          }
          setSaved(true)
          invalidate()
          toast.success(`${value.firstName} ${value.lastName} saved`)
        }}
        submitLabel={
          <>
            <Save data-icon="inline-start" />
            Save
          </>
        }
        submittingLabel="Saving…"
        saved={saved}
        onDirtyChange={(dirty) => {
          dirtyRef.current = dirty
        }}
      />

      <AlertDialog open={confirmingLeave} onOpenChange={setConfirmingLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Edits that have not been saved will be lost.
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
