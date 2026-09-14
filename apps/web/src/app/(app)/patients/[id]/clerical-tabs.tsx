"use client"

import {
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  DollarSignIcon,
  TicketPercentIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CONSENT_TYPES,
  fmtDateLong,
  fmtTime,
  type Appointment,
  type Patient,
  type Visit,
} from "@/lib/mock-data"

const usd = (n: number) => `$${n.toLocaleString("en-US")}`

/**
 * The clerical half of the record (the Aug 7 split): consents, appointments,
 * billing, coupons. Mockup on fixtures. Nothing here is a provider's to act
 * on, which is why it is its own component and never renders for one.
 */
export function ClericalTabs({
  patient,
  visits,
  appointments,
}: {
  patient: Patient
  visits: Visit[]
  appointments: Appointment[]
}) {
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
    <Tabs defaultValue="consents">
      <TabsList className="flex-wrap">
        <TabsTrigger value="consents">Consents</TabsTrigger>
        <TabsTrigger value="appointments">Appointments</TabsTrigger>
        <TabsTrigger value="finance">Billing</TabsTrigger>
        <TabsTrigger value="coupons">Coupons</TabsTrigger>
      </TabsList>

      <TabsContent value="consents" className="mt-2">
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
                        {/* Icon and word, not colour alone (DIA-22). */}
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

      <TabsContent value="appointments" className="mt-2">
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
                      <TableCell className="whitespace-nowrap">{fmtDateLong(a.start)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{fmtTime(a.start)}</TableCell>
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

      <TabsContent value="finance" className="mt-2">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col gap-1 py-4">
                <span className="text-xs text-muted-foreground">Collected</span>
                <span className="text-xl font-semibold tabular-nums text-success">{usd(collected)}</span>
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
                      <TableCell className="whitespace-nowrap">{fmtDateLong(v.date)}</TableCell>
                      <TableCell>{v.type}</TableCell>
                      <TableCell>{v.paymentMethod}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{v.tracking ?? "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{usd(v.amount)}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={v.paid ? "ghost" : "outline"}
                          className={v.paid ? "bg-success/15 text-success" : "border-warning/40 text-warning"}
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

      <TabsContent value="coupons" className="mt-2">
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
  )
}
