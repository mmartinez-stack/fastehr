"use client"

import Link from "next/link"
import {
  ArrowLeftIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  CalendarPlusIcon,
  CalendarClockIcon,
  MessageSquareIcon,
  TicketPercentIcon,
  DollarSignIcon,
  FileTextIcon,
  StethoscopeIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSurfaces } from "@/components/role-provider"
import {
  LanguageTag,
  PatientStatusBadge,
  SignedBadge,
} from "@/components/status-badges"
import { WaiversColumn } from "@/features/consents/waivers-column"
import {
  CONSENT_TYPES,
  ageFromDob,
  fmtDate,
  fmtDateLong,
  fmtTime,
  fullName,
  type Appointment,
  type Patient,
  type PendingWaiver,
  type Visit,
} from "@/lib/mock-data"
import { WeightChart } from "./weight-chart"
import { RefillDialog } from "./refill-dialog"
import { VisitRecords } from "./visit-records"

const usd = (n: number) => `$${n.toLocaleString("en-US")}`

/**
 * The patient record, split by role.
 *
 * The Aug 7 sync was specific about this screen: a provider opening a patient
 * should not have to read past contact details and consent-form status to
 * reach the chart, because none of it is theirs to act on. So the clerical
 * half — contact, consents, billing, coupons, scheduling — moves to the
 * administrative view, the clinical half stays with the provider, and an
 * administrator sees both.
 *
 * The role comes from a client-side switcher (see RoleProvider): this is a
 * mockup of the division, not an implementation of it. Both halves render from
 * the same fixtures and nothing here withholds data.
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
  const feet = Math.floor(patient.heightIn / 12)
  const inches = patient.heightIn % 12
  const latest = visits[0]
  const earliest = visits[visits.length - 1]
  const startWeight = earliest?.weight ?? 0
  const currentWeight = latest?.weight ?? 0
  const lost = startWeight - currentWeight

  const collected = visits.filter((v) => v.paid).reduce((s, v) => s + v.amount, 0)
  const outstanding = visits.filter((v) => !v.paid).reduce((s, v) => s + v.amount, 0)
  const byMethod = visits
    .filter((v) => v.paid)
    .reduce<Record<string, number>>((acc, v) => {
      acc[v.paymentMethod] = (acc[v.paymentMethod] ?? 0) + v.amount
      return acc
    }, {})

  const onFile = CONSENT_TYPES.filter((c) => !patient.missingConsents.includes(c))

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
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {fullName(patient)}
            </h1>
            <LanguageTag language={patient.language} />
            <PatientStatusBadge status={patient.status} />
            {patient.atHome && (
              <Badge className="bg-appt-athome text-appt-athome-foreground">At-Home</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {patient.gender} &middot; {age} yrs &middot; DOB {fmtDate(patient.dob)} &middot;{" "}
            {feet}&apos;{inches}&quot; &middot; {patient.office}
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

      <div
        className={
          clerical
            ? "mt-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px] 3xl:grid-cols-[320px_minmax(0,1fr)_360px]"
            : "mt-6 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)] 3xl:grid-cols-[340px_minmax(0,1fr)]"
        }
      >
        <aside className="flex flex-col gap-4">
          {clinical && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Progress</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Start</span>
                  <span className="text-lg font-semibold tabular-nums">{startWeight}</span>
                  <span className="text-xs text-muted-foreground">lbs</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Current</span>
                  <span className="text-lg font-semibold tabular-nums">{currentWeight}</span>
                  <span className="text-xs text-muted-foreground">lbs</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Lost</span>
                  <span className="text-lg font-semibold tabular-nums text-success">
                    {lost.toFixed(0)}
                  </span>
                  <span className="text-xs text-muted-foreground">lbs</span>
                </div>
              </CardContent>
            </Card>
          )}

          {clinical && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <StethoscopeIcon className="size-4 text-primary" />
                  Clinical summary
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p className="leading-relaxed text-pretty">{patient.medsHistory}</p>
                <Separator />
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Program</span>
                  <span className="font-medium">{patient.program ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Last visit</span>
                  <span className="font-medium">{fmtDateLong(patient.lastVisit)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Current medication</span>
                  <span className="font-medium">
                    {latest?.meds.map((m) => m.name).join(", ") || "—"}
                  </span>
                </div>
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
                    {patient.address.street}, {patient.address.city},{" "}
                    {patient.address.state} {patient.address.zip}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Referral</span>
                  <span className="font-medium">{patient.referralSource}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Program</span>
                  <span className="font-medium">{patient.program ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last visit</span>
                  <span className="font-medium">{fmtDate(patient.lastVisit)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </aside>

        <div className="min-w-0">
          <Tabs defaultValue={clinical ? "visits" : "consents"}>
            <TabsList>
              {clinical && <TabsTrigger value="visits">Visits</TabsTrigger>}
              {clinical && <TabsTrigger value="records">Records</TabsTrigger>}
              {clinical && <TabsTrigger value="weight">Weight</TabsTrigger>}
              {clerical && <TabsTrigger value="consents">Consents</TabsTrigger>}
              {clerical && <TabsTrigger value="appointments">Appointments</TabsTrigger>}
              {clerical && <TabsTrigger value="finance">Billing</TabsTrigger>}
              {clerical && <TabsTrigger value="coupons">Coupons</TabsTrigger>}
            </TabsList>

            {clinical && (
              <TabsContent value="visits" className="mt-4">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Medication</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visits.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="whitespace-nowrap">
                              {fmtDateLong(v.date)}
                            </TableCell>
                            <TableCell>{v.type}</TableCell>
                            <TableCell className="tabular-nums">{v.weight} lbs</TableCell>
                            <TableCell>
                              {v.meds.map((m) => `${m.name} ${m.dosage}`).join(", ") || "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{v.provider}</TableCell>
                            <TableCell className="text-right">
                              <SignedBadge signed={v.signed} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {clinical && (
              <TabsContent value="records" className="mt-4">
                {visits.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                      <FileTextIcon className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        No visit records on file.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <VisitRecords
                    visits={visits}
                    heightIn={patient.heightIn}
                    currentUser="Mauricio Martinez"
                  />
                )}
              </TabsContent>
            )}

            {clinical && (
              <TabsContent value="weight" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Weight over time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <WeightChart
                      data={[...visits]
                        .reverse()
                        .map((v) => ({ date: v.date, weight: v.weight }))}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {clerical && (
              <TabsContent value="consents" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Consent forms</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Form</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...patient.missingConsents, ...onFile].map((c) => {
                          const pending = patient.missingConsents.includes(c)
                          return (
                            <TableRow key={c}>
                              <TableCell className="font-medium">{c}</TableCell>
                              <TableCell className="text-right">
                                {/* Icon and word, not colour alone — DIA-22. */}
                                <span
                                  className={
                                    "inline-flex items-center gap-1.5 text-sm " +
                                    (pending ? "text-warning-foreground" : "text-success")
                                  }
                                >
                                  {pending ? (
                                    <CircleAlertIcon className="size-4" />
                                  ) : (
                                    <CheckCircle2Icon className="size-4" />
                                  )}
                                  {pending ? "Pending" : "On file"}
                                </span>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {clerical && (
              <TabsContent value="appointments" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Upcoming appointments</CardTitle>
                  </CardHeader>
                  <CardContent className={appointments.length === 0 ? undefined : "p-0"}>
                    {appointments.length === 0 ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarClockIcon className="size-4" />
                        Nothing booked. Use Book Visit to schedule one.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {appointments.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell className="whitespace-nowrap">
                                {fmtDateLong(a.start)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap tabular-nums">
                                {fmtTime(a.start)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{a.type}</Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{a.provider}</TableCell>
                              <TableCell className="text-muted-foreground">{a.notes}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {clerical && (
              <TabsContent value="finance" className="mt-4">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Card>
                      <CardContent className="flex flex-col gap-1 py-4">
                        <span className="text-xs text-muted-foreground">Collected</span>
                        <span className="text-xl font-semibold tabular-nums text-success">
                          {usd(collected)}
                        </span>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="flex flex-col gap-1 py-4">
                        <span className="text-xs text-muted-foreground">Outstanding</span>
                        <span
                          className={
                            "text-xl font-semibold tabular-nums " +
                            (outstanding > 0 ? "text-warning" : "text-foreground")
                          }
                        >
                          {usd(outstanding)}
                        </span>
                      </CardContent>
                    </Card>
                    <Card className="col-span-2 sm:col-span-1">
                      <CardContent className="flex flex-col gap-1 py-4">
                        <span className="text-xs text-muted-foreground">Visits billed</span>
                        <span className="text-xl font-semibold tabular-nums">
                          {visits.length}
                        </span>
                      </CardContent>
                    </Card>
                  </div>

                  {Object.keys(byMethod).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Collected by method</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-4 text-sm">
                        {Object.entries(byMethod).map(([method, amt]) => (
                          <div key={method} className="flex items-center gap-2">
                            <DollarSignIcon className="size-4 text-muted-foreground" />
                            <span className="text-muted-foreground">{method}</span>
                            <span className="font-medium tabular-nums">{usd(amt)}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Billing history</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Tracking</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visits.map((v) => (
                            <TableRow key={v.id}>
                              <TableCell className="whitespace-nowrap">
                                {fmtDateLong(v.date)}
                              </TableCell>
                              <TableCell>{v.type}</TableCell>
                              <TableCell>{v.paymentMethod}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {v.tracking ?? "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {usd(v.amount)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={v.paid ? "ghost" : "outline"}
                                  className={
                                    v.paid
                                      ? "bg-success/15 text-success"
                                      : "border-warning/40 text-warning"
                                  }
                                >
                                  {v.paid ? "Paid" : "Due"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}

            {clerical && (
              <TabsContent value="coupons" className="mt-4">
                <Card>
                  <CardContent className="flex flex-col gap-3 py-4">
                    {patient.coupons.length === 0 && (
                      <p className="text-sm text-muted-foreground">No active coupons.</p>
                    )}
                    {patient.coupons.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-md border border-border bg-accent/40 p-3"
                      >
                        <TicketPercentIcon className="size-5 text-primary" />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{c.description}</span>
                          <span className="text-xs text-muted-foreground">
                            Valid until {fmtDateLong(c.validUntil)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>

        {clerical && (
          <aside>
            <WaiversColumn
              waivers={waivers}
              showPatient={false}
              emptyMessage="Every consent form on file for this patient."
            />
          </aside>
        )}
      </div>

      {!clinical && !clerical && (
        <p className="mt-6 text-sm text-muted-foreground">
          The {role} view has no content on this screen.
        </p>
      )}
    </div>
  )
}
