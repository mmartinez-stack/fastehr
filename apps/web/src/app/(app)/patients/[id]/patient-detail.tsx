"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  FileTextIcon,
  MessageSquareIcon,
  PillIcon,
  SaveIcon,
  StethoscopeIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useSurfaces } from "@/components/role-provider"
import { LanguageTag, PatientStatusBadge } from "@/components/status-badges"
import { WaiversColumn } from "@/features/consents/waivers-column"
import { formatHeight } from "@/features/patients/height"
import { ROLE_LABEL } from "@/lib/staff-role-label"
import {
  ageFromDob,
  bmi,
  fmtDateLong,
  fullName,
  type Appointment,
  type Patient,
  type PendingWaiver,
  type Visit,
} from "@/lib/mock-data"
import { AppointmentsPanel, BillingPanel, ConsentsPanel } from "./clerical-tabs"
import { RefillDialog } from "./refill-dialog"
import { VisitRecords } from "./visit-records"
import { WeightChart } from "./weight-chart"

/**
 * The patient record, split by role (the Aug 7 sync) and laid out per the
 * Sep 7 review of the provider's view:
 *
 * - The patient information sits top right, the current medication and the
 *   weight bar chart beneath it, and the column is fixed so the provider
 *   never scrolls to find them. Visit records take the left, 60/40.
 * - Each fact is shown once (the 2026-09-13 review): age, date of birth,
 *   height, office, weight, and BMI on the patient card; medication on its
 *   own card; the visits as records, with no second table.
 * - The medical history is a free text box the provider writes in; no file
 *   upload. Nothing administrative (contact, billing) is on a provider's
 *   screen, and no dispensing action ("Register new vial") is either.
 * - One tab strip holds every section a role may see: Visit records for
 *   the clinical surface; Consents, Appointments, Billing (coupons inside
 *   it, where the legacy record applied them) for the clerical one.
 *
 * The role comes from a client-side switcher (see RoleProvider): this is a
 * mockup of the division on fixtures, not an implementation of it.
 */
export function PatientDetail({
  patient,
  visits,
  appointments,
  waivers,
}: {
  patient: Patient
  visits: Visit[]
  appointments: Appointment[]
  waivers: PendingWaiver[]
}) {
  const { role, clinical, clerical } = useSurfaces()

  const age = ageFromDob(patient.dob)
  const latest = visits[0]
  const currentWeight = latest?.weight ?? null
  const currentBmi = currentWeight === null ? null : bmi(currentWeight, patient.heightIn)
  const currentMeds = latest?.meds ?? []

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        nativeButton={false}
        render={<Link href="/patients" />}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to patients
      </Button>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{fullName(patient)}</h1>
          <LanguageTag language={patient.language} />
          <PatientStatusBadge status={patient.status} />
          {patient.atHome && (
            <Badge className="bg-appt-athome text-appt-athome-foreground">At-Home</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {clinical && <RefillDialog patientName={fullName(patient)} />}
          {clerical && (
            <>
              <Button variant="outline" size="sm">
                <MessageSquareIcon data-icon="inline-start" />
                Text
              </Button>
              <Button size="sm">
                <CalendarPlusIcon data-icon="inline-start" />
                Book Visit
              </Button>
            </>
          )}
        </div>
      </div>

      {/*
        Left, 60%: the visits, the work. Right, 40%: the patient information
        and the chart, fixed, so at 1080p neither scrolls away. The split is
        proportional rather than a fixed side width so the chart grows with
        the screen instead of the text.
      */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {clinical && <MedicalHistoryNotes initial={patient.medsHistory} />}

          {/* One strip for every section a role may see; each fact lives in one tab. */}
          <Tabs defaultValue={clinical ? "records" : "consents"}>
            <TabsList className="flex-wrap">
              {clinical && <TabsTrigger value="records">Visit records</TabsTrigger>}
              {clerical && <TabsTrigger value="consents">Consents</TabsTrigger>}
              {clerical && <TabsTrigger value="appointments">Appointments</TabsTrigger>}
              {clerical && <TabsTrigger value="billing">Billing</TabsTrigger>}
            </TabsList>

            {clinical && (
              <TabsContent value="records" className="mt-2">
                {visits.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                      <FileTextIcon className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No visit records on file.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <VisitRecords visits={visits} currentUser="Mauricio Martinez" />
                )}
              </TabsContent>
            )}
            {clerical && (
              <TabsContent value="consents" className="mt-2">
                <ConsentsPanel patient={patient} />
              </TabsContent>
            )}
            {clerical && (
              <TabsContent value="appointments" className="mt-2">
                <AppointmentsPanel appointments={appointments} />
              </TabsContent>
            )}
            {clerical && (
              <TabsContent value="billing" className="mt-2">
                <BillingPanel patient={patient} visits={visits} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <StethoscopeIcon className="size-4 text-primary" />
                Patient information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Term>Gender</Term>
              <Detail>{patient.gender}</Detail>
              <Term>Age</Term>
              <Detail>{age} yrs</Detail>
              <Term>DOB</Term>
              <Detail>{fmtDateLong(patient.dob)}</Detail>
              <Term>Height</Term>
              <Detail>{formatHeight(patient.heightIn)}</Detail>
              {clinical && (
                <>
                  <Term>Weight</Term>
                  <Detail>{currentWeight === null ? "-" : `${currentWeight} lbs`}</Detail>
                  <Term>BMI</Term>
                  <Detail>{currentBmi === null || currentBmi === 0 ? "-" : currentBmi}</Detail>
                </>
              )}
              <Term>Office</Term>
              <Detail>{patient.office}</Detail>
              <Term>Program</Term>
              <Detail>{patient.program ?? "-"}</Detail>
              <Term>Last visit</Term>
              <Detail>{fmtDateLong(patient.lastVisit)}</Detail>
            </CardContent>
          </Card>

          {clinical && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PillIcon className="size-4 text-primary" />
                  Medication
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {currentMeds.length === 0 ? (
                  <p className="text-muted-foreground">No current medication.</p>
                ) : (
                  currentMeds.map((m, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{m.name}</span>
                      <span className="tabular-nums text-muted-foreground">{m.dosage}</span>
                    </div>
                  ))
                )}
                {latest && (
                  <p className="text-xs text-muted-foreground">As of the {fmtDateLong(latest.date)} visit.</p>
                )}
              </CardContent>
            </Card>
          )}

          {clinical && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weight by visit</CardTitle>
              </CardHeader>
              <CardContent>
                {visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No visits to chart.</p>
                ) : (
                  <WeightChart
                    className="h-[220px] w-full 3xl:h-[280px]"
                    data={[...visits].reverse().map((v) => ({ date: v.date, weight: v.weight }))}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {clerical && !clinical && (
            <WaiversColumn
              waivers={waivers}
              showPatient={false}
              emptyMessage="Every consent form on file for this patient."
            />
          )}
        </aside>
      </div>

      {!clinical && !clerical && (
        <p className="mt-6 text-sm text-muted-foreground">
          The {ROLE_LABEL[role]} view has no content on this screen.
        </p>
      )}
    </div>
  )
}

function Term({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}

function Detail({ children }: { children: React.ReactNode }) {
  return <span className="font-medium">{children}</span>
}

/**
 * The free text box the Sep 7 sync asked for: a place for the provider to
 * write the medical history in their own words, and no file upload. Local
 * state only in the mockup; the real save is the Medical tab's `historyOther`.
 */
function MedicalHistoryNotes({ initial }: { initial: string }) {
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const dirty = text !== saved

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Medical history</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          aria-label="Medical history"
          placeholder="Conditions, prior treatments, anything the next provider should read first."
          className="text-sm leading-relaxed"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setSaved(text)
              toast.success("Medical history saved")
            }}
          >
            <SaveIcon data-icon="inline-start" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
