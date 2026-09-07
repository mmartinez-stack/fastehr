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
import { useRole } from "@/components/role-provider"
import { PatientForm, toPatientFormValues } from "@/features/patients/patient-form"
import { patientTabsFor } from "@/features/patients/patient-tabs"
import { trpc } from "@/trpc/client"

/**
 * Edit — the shared three-tab form, prefilled per tab and saved per tab
 * (ADR 28). Every role reads the Medical tab's data (`patient.byId`: header
 * plus the clinical half); the roles that render Patient Info and Billing
 * also read those sections. One Save runs the section mutations for the
 * tabs rendered, so a provider's save never carries a phone number and the
 * server never has to trust the tabs it cannot see. Which tabs render is
 * `patientTabsFor`'s decision, made once from the session's role.
 *
 * The legacy Make Inactive / Make Active action is gone from here with
 * DIA-50: status is no longer exposed anywhere, though its column and
 * procedure remain.
 */
/** "1985-12-10" → "Dec 10, 1985" without touching Date (and its timezones). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function formatDob(iso: string): string {
  const [y, m, d] = iso.split("-")
  const month = m === undefined ? undefined : MONTHS[Number(m) - 1]
  return month === undefined || d === undefined ? iso : `${month} ${Number(d)}, ${y}`
}

export default function EditPatientPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const utils = trpc.useUtils()
  const { role } = useRole()
  const tabs = patientTabsFor(role)
  const showsPatientInfo = tabs.includes("patientInfo")
  const showsBilling = tabs.includes("billing")
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const dirtyRef = React.useRef(false)

  const chart = trpc.patient.byId.useQuery({ id: params.id })
  // A tab's data is fetched only when the tab renders: a provider's page
  // never even asks for Patient Info, so there is nothing for the server to
  // refuse (it would, and audit the refusal).
  const demographics = trpc.patient.demographics.useQuery({ id: params.id }, { enabled: showsPatientInfo })
  const billing = trpc.patient.billing.useQuery({ id: params.id }, { enabled: showsBilling })

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

  const loading =
    chart.isPending || (showsPatientInfo && demographics.isPending) || (showsBilling && billing.isPending)
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

  return (
    <div>
      {/* Same compact header as /patients/new: the back arrow shares the
          title row instead of spending a row of its own. The header carries
          the name and date of birth and nothing else: those are the only
          fields that may appear outside their tab. */}
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
          description={`Date of birth ${formatDob(record.dateOfBirth)}.`}
        />
      </div>

      <PatientForm
        // Remount on a fresh server copy so the form's defaults track the record.
        key={`${record.id}:${chart.dataUpdatedAt}`}
        sections={tabs}
        defaultValues={toPatientFormValues(record, demographics.data ?? null, billing.data ?? null)}
        historyOnFile={record.historyOther}
        submit={async (value) => {
          // The Medical tab first: it is the one every role may save, so a
          // refusal on a clerical tab can never leave the chart unsaved.
          await updateClinical.mutateAsync({ ...value, id: record.id })
          if (showsPatientInfo) await updateDemographics.mutateAsync({ ...value, id: record.id })
          if (showsBilling) await updateBilling.mutateAsync({ ...value, id: record.id })
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
