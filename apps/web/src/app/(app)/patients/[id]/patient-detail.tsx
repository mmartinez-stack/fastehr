"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  CameraIcon,
  CircleAlertIcon,
  ClipboardPlusIcon,
  FileTextIcon,
  HeartPulseIcon,
  HouseIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  PackageCheckIcon,
  PillIcon,
  SaveIcon,
  StethoscopeIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useSurfaces } from "@/components/role-provider"
import { LanguageTag, PatientStatusBadge } from "@/components/status-badges"
import { WaiversColumn } from "@/features/consents/waivers-column"
import { formatHeight } from "@/features/patients/height"
import { ROLE_LABEL } from "@/lib/staff-role-label"
import { cn } from "@/lib/utils"
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
import { ConsultationForm } from "./consultation-form"
import { RefillDialog } from "./refill-dialog"
import { VisitRecords, type CrossComment } from "./visit-records"
import { WeightChart } from "./weight-chart"

/**
 * The patient record, split by role (the Aug 7 sync), laid out per the
 * Sep 7 review of the provider's view and tightened per the Sep 14 review:
 *
 * - One box across the top, split in half: the patient information on the
 *   left, the medical history on the right with its own lines for
 *   conditions and drug allergies and the free text beneath them (the Sep
 *   14 review). The current medication and the weight bar chart keep their
 *   place in the right column, fixed, so the provider never scrolls to find
 *   them. Visit records take the left, 60/40.
 * - Each fact is shown once (the 2026-09-13 review): age, date of birth,
 *   height, office, weight, and BMI on the patient card; medication on its
 *   own card; the visits as records, with no second table.
 * - The medical history is a free text box the provider writes in; no file
 *   upload. Nothing administrative (contact, billing) is on a provider's
 *   screen, and no dispensing action ("Register new vial") is either.
 * - One tab strip holds every section a role may see, and the records are
 *   split by kind rather than colour-coded: Visit records (the clinical
 *   notes) for the clinical surface; Administrative records (payment,
 *   mailing, calls, and the front desk's comments on clinical visits),
 *   Consents, Appointments, and Billing (coupons inside it, where the
 *   legacy record applied them) for the clerical one. An administrator has
 *   both surfaces and sees every tab.
 *
 * The role comes from a client-side switcher (see RoleProvider): this is a
 * mockup of the division on fixtures, not an implementation of it.
 */
export function PatientDetail({
  patient,
  visits: onFile,
  appointments,
  waivers,
}: {
  patient: Patient
  visits: Visit[]
  appointments: Appointment[]
  waivers: PendingWaiver[]
}) {
  const { role, clinical, clerical } = useSurfaces()
  const currentUser = "Mauricio Martinez"

  // A visit opened on this screen (the consultation form) joins the records
  // at once, newest first; mockup state, gone on reload.
  const [opened, setOpened] = useState<Visit[]>([])
  const [composing, setComposing] = useState(false)
  const visits = [...opened, ...onFile]

  const age = ageFromDob(patient.dob)
  const latest = visits[0]
  // A visit saved without a weight carries 0; that is no weight, not a weight.
  const currentWeight = latest === undefined || latest.weight === 0 ? null : latest.weight
  const currentBmi = currentWeight === null ? null : bmi(currentWeight, patient.heightIn)

  // Records split by kind, each on its own tab (the 2026-09-13 review). A
  // comment goes with the kind of its author, referencing the visit it is on.
  const clinicalVisits = visits.filter((v) => v.author === "provider")
  // Current medication is what the last clinical visit dispensed; an
  // administrative entry in between does not change it.
  const currentMeds = clinicalVisits[0]?.meds ?? []
  const administrativeVisits = visits.filter((v) => v.author === "administrative")
  const crossComments = (kind: "provider" | "administrative"): CrossComment[] =>
    visits
      .filter((v) => v.author !== kind)
      .flatMap((visit) => visit.addenda.filter((a) => a.author === kind).map((addendum) => ({ visit, addendum })))

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
          <LanguageTag language={patient.language} size="lg" />
          <PatientStatusBadge status={patient.status} size="lg" />
          {patient.atHome && (
            <Badge className="bg-appt-athome px-2.5 py-1 text-sm text-appt-athome-foreground">At-Home</Badge>
          )}
        </div>
        {/* The record's actions at `lg`: the four buttons a visit starts from,
            sized to be found and hit without aiming (DIA-22). */}
        <div className="flex flex-wrap gap-2">
          {(clinical || clerical) && (
            <Button size="lg" onClick={() => setComposing(true)} disabled={composing}>
              <ClipboardPlusIcon data-icon="inline-start" />
              New visit
            </Button>
          )}
          {clinical && <RefillDialog patientName={fullName(patient)} />}
          {clerical && (
            <>
              <Button variant="outline" size="lg">
                <MessageSquareIcon data-icon="inline-start" />
                Text
              </Button>
              <Button
                variant="outline"
                size="lg"
                nativeButton={false}
                render={<Link href="/sms" />}
              >
                <MessagesSquareIcon data-icon="inline-start" />
                SMS chat
              </Button>
              <Button variant="outline" size="lg">
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
      <PatientSummary
        patient={patient}
        age={age}
        currentWeight={clinical ? currentWeight : null}
        currentBmi={clinical ? currentBmi : null}
        showHistory={clinical}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {composing && (
            <ConsultationForm
              patient={patient}
              visitCount={visits.length}
              currentUser={currentUser}
              onCancel={() => setComposing(false)}
              onSave={(visit) => {
                setOpened((prev) => [visit, ...prev])
                setComposing(false)
              }}
            />
          )}

          {/* One strip for every section a role may see; each fact lives in one tab. */}
          <Tabs defaultValue={clinical ? "records" : "administrative"}>
            <TabsList className="flex-wrap">
              {clinical && <TabsTrigger value="records">Visit records</TabsTrigger>}
              {clerical && <TabsTrigger value="administrative">Administrative records</TabsTrigger>}
              {clerical && <TabsTrigger value="consents">Consents</TabsTrigger>}
              {clerical && <TabsTrigger value="appointments">Appointments</TabsTrigger>}
              {clerical && <TabsTrigger value="billing">Billing</TabsTrigger>}
            </TabsList>

            {clinical && (
              <TabsContent value="records" className="mt-2">
                {clinicalVisits.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                      <FileTextIcon className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No visit records on file.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <VisitRecords
                    kind="provider"
                    visits={clinicalVisits}
                    comments={crossComments("provider")}
                    currentUser={currentUser}
                    heightIn={patient.heightIn}
                    providerViewDefault={!clerical}
                  />
                )}
              </TabsContent>
            )}
            {clerical && (
              <TabsContent value="administrative" className="mt-2">
                <VisitRecords
                  kind="administrative"
                  visits={administrativeVisits}
                  comments={crossComments("administrative")}
                  currentUser={currentUser}
                  heightIn={patient.heightIn}
                />
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
                    data={[...visits]
                      .filter((v) => v.weight > 0)
                      .reverse()
                      .map((v) => ({ date: v.date, weight: v.weight }))}
                    exportName={`${patient.lastName}-${patient.firstName}-weight`}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {clinical && visits.some((v) => v.photo) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CameraIcon className="size-4 text-primary" />
                  Visit photos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Placeholders: the images wait for PHI file storage (DIA-68, DIA-71). */}
                <div className="grid grid-cols-3 gap-2">
                  {visits
                    .filter((v) => v.photo)
                    .map((v) => (
                      <figure key={v.id} className="flex flex-col gap-1">
                        <div className="flex aspect-[3/4] items-center justify-center rounded-md border border-dashed border-border bg-muted/40">
                          <CameraIcon className="size-5 text-muted-foreground" />
                        </div>
                        <figcaption className="text-center text-xs text-muted-foreground">{fmtDateLong(v.date)}</figcaption>
                      </figure>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {clerical && patient.atHome && <AtHomeCard patient={patient} />}

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

/**
 * The At-Home program block the legacy chart kept beside the patient: the
 * welcome package's tracking number and the text that tells the patient it
 * shipped, and a warning when the program type the contract needs is
 * missing. Front desk only.
 */
function AtHomeCard({ patient }: { patient: Patient }) {
  const [tracking, setTracking] = useState(patient.trackingNumber ?? "")
  const [sent, setSent] = useState(patient.welcomePackageSent)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HouseIcon className="size-4 text-appt-athome" />
          At-Home program
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {patient.program === undefined && (
          <p className="flex items-center gap-2 text-warning-foreground">
            <CircleAlertIcon className="size-4" />
            Missing program type for the contract.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tracking-number" className="text-sm font-medium">
            Welcome package tracking number
          </label>
          <Input
            id="tracking-number"
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            placeholder="9405 5111 05…"
            className="font-mono"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {sent ? "Package sent, patient texted." : "Not sent yet."}
          </span>
          <Button
            size="sm"
            variant={sent ? "outline" : "default"}
            disabled={tracking.trim() === ""}
            onClick={() => {
              setSent(true)
              toast.success(`Welcome package text sent to ${patient.firstName} with the tracking number`)
            }}
          >
            <PackageCheckIcon data-icon="inline-start" />
            {sent ? "Send again" : "Welcome package sent"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The top box, split in half (the Sep 14 review): the patient information
 * on the left, the medical history on the right with a line for the
 * conditions and a line for the drug allergies above the provider's free
 * text. The header's weight and BMI are the current values; each clinical
 * note carries its own visit's pair.
 */
function PatientSummary({
  patient,
  age,
  currentWeight,
  currentBmi,
  showHistory,
}: {
  patient: Patient
  age: number
  currentWeight: number | null
  currentBmi: number | null
  showHistory: boolean
}) {
  return (
    <Card className="mt-6">
      <CardContent className={cn("grid gap-6 pt-6", showHistory && "md:grid-cols-2")}>
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <StethoscopeIcon className="size-4 text-primary" />
            Patient information
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <Term>Gender</Term>
            <Detail>{patient.gender}</Detail>
            <Term>Age</Term>
            <Detail>{age} yrs</Detail>
            <Term>DOB</Term>
            <Detail>{fmtDateLong(patient.dob)}</Detail>
            <Term>Height</Term>
            <Detail>{formatHeight(patient.heightIn)}</Detail>
            {showHistory && (
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
          </dl>
        </section>

        {showHistory && (
          <section className="flex flex-col gap-3 md:border-l md:border-border md:pl-6">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <HeartPulseIcon className="size-4 text-primary" />
              Medical history
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Term>Conditions</Term>
              <Detail>{patient.conditions.length === 0 ? "None on file" : patient.conditions.join(", ")}</Detail>
              <Term>Drug allergies</Term>
              <Detail>
                {patient.drugAllergies.length === 0 ? (
                  "None known"
                ) : (
                  <span className="text-destructive">{patient.drugAllergies.join(", ")}</span>
                )}
              </Detail>
            </dl>
            <MedicalHistoryNotes initial={patient.medsHistory} />
          </section>
        )}
      </CardContent>
    </Card>
  )
}

function Term({ children }: { children: React.ReactNode }) {
  return <dt className="text-muted-foreground">{children}</dt>
}

function Detail({ children }: { children: React.ReactNode }) {
  return <dd className="font-medium">{children}</dd>
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
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        aria-label="Medical history notes"
        placeholder="Prior treatments, anything the next provider should read first."
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
    </div>
  )
}
