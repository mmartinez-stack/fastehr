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
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { PageHeader } from "@/components/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSurfaces } from "@/components/role-provider"
import {
  EMPTY_PATIENT_FORM,
  PATIENT_SECTIONS,
  PatientForm,
} from "@/features/patients/patient-form"
import { trpc } from "@/trpc/client"
import { IntakeForm } from "./intake-form"

/**
 * Create — two tabs, the legacy page's two jobs made explicit. "New patient"
 * is the shared sectioned form (features/patients/patient-form.tsx, the
 * reference implementation per docs/forms.md) with every section, wired to
 * `patient.create`; "Send intake form" is the legacy SMS side panel (see
 * intake-form.tsx). The page owns navigation: the back-guard dialog and the
 * success redirect.
 *
 * Creating a record is clerical (ADR 28): it needs the demographics a
 * provider never sees. The server refuses a provider's `patient.create`; this
 * page says so first rather than rendering a form that cannot be submitted.
 */
export default function NewPatientPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { clerical } = useSurfaces()
  const [confirmingLeave, setConfirmingLeave] = React.useState(false)
  const dirtyRef = React.useRef(false)

  const createPatient = trpc.patient.create.useMutation({
    onSuccess: (created) => {
      void utils.patient.recent.invalidate()
      void utils.patient.search.invalidate()
      void utils.patient.suggest.invalidate()
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

  if (!clerical) {
    return (
      <Empty>
        <EmptyTitle>Front desk only</EmptyTitle>
        <EmptyDescription>
          New patient records are created by the front desk.{" "}
          <Link href="/patients" className="underline">Back to patients</Link>
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div>
      {/* The back arrow shares the title row — a stacked back link above the
          header spent a full row on it (the whitespace complaint). */}
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
          title="New Patient"
          description="Create a record directly, or text the person the self-service intake form."
        />
      </div>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">New patient</TabsTrigger>
          <TabsTrigger value="intake">Send intake form</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-2">
          <PatientForm
            sections={PATIENT_SECTIONS}
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

        <TabsContent value="intake" className="mt-2">
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
