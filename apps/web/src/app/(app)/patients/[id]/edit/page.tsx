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
import {
  PatientForm,
  toPatientFormValues,
} from "@/features/patients/patient-form"
import { trpc } from "@/trpc/client"

/**
 * Edit — the same shared form as /patients/new, prefilled from `patient.byId`
 * and wired to `patient.update`. The legacy Make Inactive / Make Active
 * action is gone from here with DIA-50: status is no longer exposed anywhere,
 * though its column and procedure remain.
 */
export default function EditPatientPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const utils = trpc.useUtils()
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const dirtyRef = React.useRef(false)

  const patient = trpc.patient.byId.useQuery({ id: params.id })

  const updatePatient = trpc.patient.update.useMutation({
    onSuccess: (updated) => {
      void utils.patient.recent.invalidate()
      void utils.patient.search.invalidate()
      void utils.patient.suggest.invalidate()
      void utils.patient.byId.invalidate({ id: params.id })
      toast.success(`${updated.firstName} ${updated.lastName} saved`)
    },
  })

  const guardLeave = (event: { preventDefault: () => void }) => {
    if (dirtyRef.current && !updatePatient.isSuccess) {
      event.preventDefault()
      setConfirmingLeave(true)
    }
  }

  if (patient.isPending) {
    return <p className="py-8 text-center text-muted-foreground">Loading patient…</p>
  }

  if (patient.data === null || patient.data === undefined) {
    return (
      <Empty>
        <EmptyTitle>Patient not found</EmptyTitle>
        <EmptyDescription>
          This record does not exist. <Link href="/patients" className="underline">Back to patients</Link>
        </EmptyDescription>
      </Empty>
    )
  }

  const record = patient.data

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
        key={record.id}
        defaultValues={toPatientFormValues(record)}
        submit={async (value) => {
          await updatePatient.mutateAsync({ ...value, id: record.id })
        }}
        submitLabel={
          <>
            <Save data-icon="inline-start" />
            Save
          </>
        }
        submittingLabel="Saving…"
        saved={updatePatient.isSuccess}
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
