import Link from "next/link"
import { notFound } from "next/navigation"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  getPatient,
  visitsForPatient,
  fullName,
  ageFromDob,
  fmtDate,
  fmtDateLong,
} from "@/lib/mock-data"
import { LanguageTag, PatientStatusBadge, SignedBadge } from "@/components/status-badges"
import { WeightChart } from "./weight-chart"
import { RefillDialog } from "./refill-dialog"
import { VisitRecords } from "./visit-records"
import {
  ArrowLeftIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  CalendarPlusIcon,
  MessageSquareIcon,
  TriangleAlertIcon,
  TicketPercentIcon,
  DollarSignIcon,
  FileTextIcon,
} from "lucide-react"

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const patient = getPatient(id)
  if (!patient) notFound()

  const visits = visitsForPatient(id)
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
  const usd = (n: number) => `$${n.toLocaleString("en-US")}`

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
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
            {patient.atHome && <Badge className="bg-appt-athome text-appt-athome-foreground">At-Home</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {patient.gender} &middot; {age} yrs &middot; DOB {fmtDate(patient.dob)} &middot; {feet}&apos;{inches}&quot;
            &middot; {patient.office}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefillDialog patientName={fullName(patient)} />
          <Button variant="outline" size="sm">
            <MessageSquareIcon data-icon="inline-start" />
            Text
          </Button>
          <Button size="sm">
            <CalendarPlusIcon data-icon="inline-start" />
            Book Visit
          </Button>
        </div>
      </div>

      {patient.missingConsents.length > 0 && (
        <Alert className="mt-4 border-warning/40 bg-warning/10">
          <TriangleAlertIcon className="text-warning" />
          <AlertTitle>Missing consent forms</AlertTitle>
          <AlertDescription>
            {patient.missingConsents.join(", ")} not yet on file.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
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
                  {patient.address.street}, {patient.address.city}, {patient.address.state} {patient.address.zip}
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
                <span className="text-lg font-semibold tabular-nums text-success">{lost.toFixed(0)}</span>
                <span className="text-xs text-muted-foreground">lbs</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Tabs defaultValue="visits">
            <TabsList>
              <TabsTrigger value="visits">Visits</TabsTrigger>
              <TabsTrigger value="records">Records</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
              <TabsTrigger value="weight">Weight</TabsTrigger>
              <TabsTrigger value="coupons">Coupons</TabsTrigger>
            </TabsList>

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
                          <TableCell className="whitespace-nowrap">{fmtDate(v.date)}</TableCell>
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

            <TabsContent value="records" className="mt-4">
              {visits.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                    <FileTextIcon className="size-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No visit records on file.</p>
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
                      <span className="text-xl font-semibold tabular-nums">{visits.length}</span>
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
                            <TableCell className="whitespace-nowrap">{fmtDate(v.date)}</TableCell>
                            <TableCell>{v.type}</TableCell>
                            <TableCell>{v.paymentMethod}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {v.tracking ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{usd(v.amount)}</TableCell>
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

            <TabsContent value="weight" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Weight over time</CardTitle>
                </CardHeader>
                <CardContent>
                  <WeightChart
                    data={[...visits]
                      .reverse()
                      .map((v) => ({ date: fmtDate(v.date), weight: v.weight }))}
                  />
                </CardContent>
              </Card>
            </TabsContent>

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
          </Tabs>
        </div>
      </div>
    </div>
  )
}
