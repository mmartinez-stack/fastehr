"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, UserPlus } from "lucide-react"
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
import { PageHeader } from "@/components/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  EMPTY_PATIENT_FORM,
  PatientForm,
} from "@/features/patients/patient-form"
import { trpc } from "@/trpc/client"
import { IntakeForm } from "./intake-form"

/**
 * Create — two tabs, the legacy page's two jobs made explicit. "New patient"
 * is the shared legacy-parity form (features/patients/patient-form.tsx, the
 * reference implementation per docs/forms.md) wired to `patient.create`;
 * "Send intake form" is the legacy SMS side panel (see intake-form.tsx). The
 * page owns navigation: the back-guard dialog and the success redirect.
 */
export default function NewPatientPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const dirtyRef = React.useRef(false)

  const createPatient = trpc.patient.create.useMutation({
    onSuccess: (created) => {
      void utils.patient.list.invalidate()
      void utils.patient.recent.invalidate()
      toast.success(`${created.firstName} ${created.lastName} added`)
      router.push("/patients")
    },
  })

  const guardLeave = (event: { preventDefault: () => void }) => {
    if (dirtyRef.current && !createPatient.isSuccess) {
      event.preventDefault()
      setConfirmingLeave(true)
    }
  }

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
        title="New Patient"
        description="Create a record directly, or text the person the self-service intake form."
      />

      <Tabs defaultValue="new" className="mt-6">
        <TabsList>
          <TabsTrigger value="new">New patient</TabsTrigger>
          <TabsTrigger value="intake">Send intake form</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <PatientForm
            defaultValues={EMPTY_PATIENT_FORM}
            submit={async (value) => {
              await createPatient.mutateAsync(value)
            }}
            submitLabel={
              <>
                <UserPlus data-icon="inline-start" />
                Create Patient
              </>
            }
            submittingLabel="Creating…"
            saved={createPatient.isSuccess}
            onDirtyChange={(dirty) => {
              dirtyRef.current = dirty
            }}
          />
        </TabsContent>

        <TabsContent value="intake" className="mt-4">
          <IntakeForm />
        </TabsContent>
      </Tabs>

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
