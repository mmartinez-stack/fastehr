"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  FileTextIcon,
  MailIcon,
  MapPinIcon,
  MessageSquareIcon,
  PhoneIcon,
  SaveIcon,
  StethoscopeIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSurfaces } from "@/components/role-provider"
import { LanguageTag, PatientStatusBadge, SignedBadge } from "@/components/status-badges"
import { WaiversColumn } from "@/features/consents/waivers-column"
import { formatHeight } from "@/features/patients/height"
import { ROLE_LABEL } from "@/lib/staff-role-label"
import {
  ageFromDob,
  bmi,
  fmtDate,
  fmtDateLong,
  fullName,
  type Appointment,
  type Patient,
  type PendingWaiver,
  type Visit,
} from "@/lib/mock-data"
import { ClericalTabs } from "./clerical-tabs"
import { RefillDialog } from "./refill-dialog"
import { VisitRecords } from "./visit-records"
import { WeightChart } from "./weight-chart"

/**
 * The patient record, split by role (the Aug 7 sync) and laid out per the
 * Sep 7 review of the provider's view:
 *
 * - The patient information sits top right, the weight bar chart directly
 *   beneath it, and the column is fixed so the provider never scrolls to
 *   find either. Visit records take the centre and left.
 * - Height, weight, and medication are squeezed into one compact strip.
 *   Height reads "5 ft 4 in", never "64".
 * - The medical history is a free text box the provider writes in; no file
 *   upload. Nothing administrative (contact, waivers, billing) is on a
 *   provider's screen, and no dispensing action ("Register new vial") is
 *   either.
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
  const earliest = visits[visits.length - 1]
  const startWeight = earliest?.weight ?? null
  const currentWeight = latest?.weight ?? null
  const lost = startWeight !== null && currentWeight !== null ? startWeight - currentWeight : null
  const currentBmi = currentWeight === null ? null : bmi(currentWeight, patient.heightIn)
  const currentMeds = latest?.meds.map((m) => `${m.name} ${m.dosage}`).join(", ") ?? ""

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
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{fullName(patient)}</h1>
            <LanguageTag language={patient.language} />
            <PatientStatusBadge status={patient.status} />
            {patient.atHome && (
              <Badge className="bg-appt-athome text-appt-athome-foreground">At-Home</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {patient.gender} &middot; {age} yrs &middot; DOB {fmtDateLong(patient.dob)} &middot;{" "}
            {formatHeight(patient.heightIn)} &middot; {patient.office}
          </p>
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
        Centre and left: the work. Right: the reference, fixed. At 1080p the
        right column holds the patient information and the chart without
        scrolling; the extra width at 3xl goes to the chart, not to the text.
      */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 3xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-6">
          {clinical && (
            <VitalsStrip
              height={formatHeight(patient.heightIn)}
              startWeight={startWeight}
              currentWeight={currentWeight}
              lost={lost}
              bmi={currentBmi}
              medication={currentMeds}
            />
          )}

          {clinical && <MedicalHistoryNotes initial={patient.medsHistory} />}

          {clinical && (
            <Tabs defaultValue="records">
              <TabsList>
                <TabsTrigger value="records">Visit records</TabsTrigger>
                <TabsTrigger value="visits">Visits</TabsTrigger>
              </TabsList>

              <TabsContent value="records" className="mt-2">
                {visits.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                      <FileTextIcon className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No visit records on file.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <VisitRecords visits={visits} heightIn={patient.heightIn} currentUser="Mauricio Martinez" />
                )}
              </TabsContent>

              <TabsContent value="visits" className="mt-2">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Weight</TableHead>
                            <TableHead className="text-right">BMI</TableHead>
                            <TableHead>Medication</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visits.map((v) => (
                            <TableRow key={v.id}>
                              <TableCell className="whitespace-nowrap">{fmtDateLong(v.date)}</TableCell>
                              <TableCell>{v.type}</TableCell>
                              <TableCell className="text-right tabular-nums">{v.weight} lbs</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {bmi(v.weight, patient.heightIn) || "-"}
                              </TableCell>
                              <TableCell>
                                {v.meds.map((m) => `${m.name} ${m.dosage}`).join(", ") || "-"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{v.provider}</TableCell>
                              <TableCell className="text-right">
                                <SignedBadge signed={v.signed} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {clerical && <ClericalTabs patient={patient} visits={visits} appointments={appointments} />}
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
          {clinical && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <StethoscopeIcon className="size-4 text-primary" />
                  Patient information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <Term>Age</Term>
                <Detail>{age} yrs</Detail>
                <Term>DOB</Term>
                <Detail>{fmtDateLong(patient.dob)}</Detail>
                <Term>Height</Term>
                <Detail>{formatHeight(patient.heightIn)}</Detail>
                <Term>Office</Term>
                <Detail>{patient.office}</Detail>
                <Term>Program</Term>
                <Detail>{patient.program ?? "-"}</Detail>
                <Term>Last visit</Term>
                <Detail>{fmtDateLong(patient.lastVisit)}</Detail>
                <Term>Medication</Term>
                <Detail>{currentMeds || "-"}</Detail>
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

          {clerical && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <PhoneIcon className="size-4 text-muted-foreground" />
                  <span>{patient.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MailIcon className="size-4 text-muted-foreground" />
                  <span className="truncate">{patient.email}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {patient.address.street}, {patient.address.city}, {patient.address.state}{" "}
                    {patient.address.zip}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Referral</span>
                  <span className="font-medium">{patient.referralSource}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last visit</span>
                  <span className="font-medium">{fmtDate(patient.lastVisit)}</span>
                </div>
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
 * Height, weight, and medication in one row of compact columns (the Sep 7
 * sync: "squeezed down"). Numbers are tabular so the columns line up from
 * one patient to the next.
 */
function VitalsStrip({
  height,
  startWeight,
  currentWeight,
  lost,
  bmi,
  medication,
}: {
  height: string
  startWeight: number | null
  currentWeight: number | null
  lost: number | null
  bmi: number | null
  medication: string
}) {
  const cells: { label: string; value: string; tone?: string }[] = [
    { label: "Height", value: height },
    { label: "Start", value: startWeight === null ? "-" : `${startWeight} lbs` },
    { label: "Current", value: currentWeight === null ? "-" : `${currentWeight} lbs` },
    {
      label: "Lost",
      value: lost === null ? "-" : `${lost.toFixed(0)} lbs`,
      tone: lost !== null && lost > 0 ? "text-success" : undefined,
    },
    { label: "BMI", value: bmi === null || bmi === 0 ? "-" : String(bmi) },
    { label: "Medication", value: medication || "-" },
  ]
  return (
    <Card>
      <CardContent className="grid grid-cols-3 gap-x-4 gap-y-3 py-4 sm:grid-cols-6">
        {cells.map((cell) => (
          <div key={cell.label} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{cell.label}</span>
            <span className={"truncate text-base font-semibold tabular-nums " + (cell.tone ?? "")} title={cell.value}>
              {cell.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
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
