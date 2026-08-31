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
 * and wired to `patient.update`. Activate/deactivate is its own action beside
 * the save button, exactly as the legacy edit view kept it apart from Save.
 */
export default function EditPatientPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const utils = trpc.useUtils()
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const dirtyRef = React.useRef(false)

  const patient = trpc.patient.byId.useQuery({ id: params.id })

  const invalidate = () => {
    void utils.patient.list.invalidate()
    void utils.patient.recent.invalidate()
    void utils.patient.search.invalidate()
    void utils.patient.byId.invalidate({ id: params.id })
  }

  const updatePatient = trpc.patient.update.useMutation({
    onSuccess: (updated) => {
      invalidate()
      toast.success(`${updated.firstName} ${updated.lastName} saved`)
    },
  })

  const setStatus = trpc.patient.setStatus.useMutation({
    onSuccess: (updated) => {
      invalidate()
      toast.success(
        updated.status === "active"
          ? `${updated.firstName} ${updated.lastName} is active again`
          : `${updated.firstName} ${updated.lastName} marked inactive`,
      )
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
  const isActive = record.status === "active"

  return (
    <div>
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

      <PageHeader
        title={`${record.firstName} ${record.lastName}`}
        description={isActive ? "Edit the patient record." : "This patient is inactive."}
      />

      <PatientForm
        // Remount on a fresh server copy so the form's defaults track the record.
        key={`${record.id}:${record.status}`}
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
        footerStart={
          <Button
            type="button"
            variant={isActive ? "destructive" : "outline"}
            disabled={setStatus.isPending}
            onClick={() =>
              setStatus.mutate({ id: record.id, status: isActive ? "inactive" : "active" })
            }
          >
            {isActive ? "Make Inactive" : "Make Active"}
          </Button>
        }
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
