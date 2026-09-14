"use client"

import { useState } from "react"
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  DollarSignIcon,
  DownloadIcon,
  GiftIcon,
  PlusIcon,
  SendIcon,
  TicketPercentIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BASE_COUPONS,
  CONSENT_TYPES,
  fmtDateLong,
  fmtTime,
  type Appointment,
  type Coupon,
  type Patient,
  type Visit,
} from "@/lib/mock-data"

const usd = (n: number) => `$${n.toLocaleString("en-US")}`

/**
 * The clerical panels of the record (the Aug 7 split): consents,
 * appointments, billing. Mockup on fixtures. They sit in the record's one
 * tab strip beside Visit records, and none renders for a provider.
 */

/**
 * Consents as the legacy chart handled them: a form is pending or on file,
 * a pending one is sent to the patient by text (one link per form), and a
 * signed one is downloadable. Sending and downloading are mockup here: the
 * text waits for the SMS provider (DIA-67) and the file for storage (DIA-68).
 */
export function ConsentsPanel({ patient }: { patient: Patient }) {
  const onFile = CONSENT_TYPES.filter((c) => !patient.missingConsents.includes(c))
  const [sent, setSent] = useState<Set<string>>(() => new Set())
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consent forms</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Form</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...patient.missingConsents, ...onFile].map((c) => {
              const pending = patient.missingConsents.includes(c)
              return (
                <TableRow key={c}>
                  <TableCell className="font-medium">{c}</TableCell>
                  <TableCell>
                    {/* Icon and word, not colour alone (DIA-22). */}
                    <span
                      className={
                        "inline-flex items-center gap-1.5 text-sm " +
                        (pending ? "text-warning-foreground" : "text-success")
                      }
                    >
                      {pending ? <CircleAlertIcon className="size-4" /> : <CheckCircle2Icon className="size-4" />}
                      {pending ? (sent.has(c) ? "Sent, awaiting signature" : "Pending") : "On file"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {pending ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSent((prev) => new Set(prev).add(c))
                            toast.success(`${c} form texted to ${patient.firstName}`)
                          }}
                        >
                          <SendIcon data-icon="inline-start" />
                          {sent.has(c) ? "Send again" : "Send by text"}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toast.success(`${c} consent download started`)}
                        >
                          <DownloadIcon data-icon="inline-start" />
                          Download
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function AppointmentsPanel({ appointments }: { appointments: Appointment[] }) {
  return (
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
  )
}

/**
 * Billing, with the patient's coupons inside it: the legacy record listed
 * a patient's available coupons on the chart and applied one as a discount
 * on the visit's price, so a coupon is a billing fact, not a section.
 */
export function BillingPanel({ patient, visits }: { patient: Patient; visits: Visit[] }) {
  const [credits, setCredits] = useState(patient.referralCredits)
  const [coupons, setCoupons] = useState<Coupon[]>(patient.coupons)
  const [picked, setPicked] = useState("")
  const assignable = BASE_COUPONS.filter((base) => !coupons.some((c) => c.description === base.description))
  const collected = visits.filter((v) => v.paid).reduce((s, v) => s + v.amount, 0)
  const outstanding = visits.filter((v) => !v.paid).reduce((s, v) => s + v.amount, 0)
  const byMethod = visits
    .filter((v) => v.paid)
    .reduce<Record<string, number>>((acc, v) => {
      acc[v.paymentMethod] = (acc[v.paymentMethod] ?? 0) + v.amount
      return acc
    }, {})

  return (
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
                "text-xl font-semibold tabular-nums " + (outstanding > 0 ? "text-warning" : "text-foreground")
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

      <div className="grid gap-4 md:grid-cols-2">
        {/* Referral credits, as the legacy chart counted them: earned by
            referring, spent as a discount on a visit (DIA-66 owns the rules). */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GiftIcon className="size-4 text-primary" />
              Referral credits
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              <span className="text-2xl font-semibold tabular-nums">{credits}</span>{" "}
              <span className="text-muted-foreground">
                {credits === 1 ? "discount available" : "discounts available"}
              </span>
            </p>
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={credits === 0}
                onClick={() => {
                  setCredits((n) => n - 1)
                  toast.success("Referral discount marked as used")
                }}
              >
                Mark discount as used
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TicketPercentIcon className="size-4 text-primary" />
              Coupons
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {coupons.length === 0 && <p className="text-sm text-muted-foreground">No active coupons.</p>}
            {coupons.map((c, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-accent/40 p-3">
                <TicketPercentIcon className="size-5 text-primary" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{c.description}</span>
                  <span className="text-xs text-muted-foreground">Valid until {fmtDateLong(c.validUntil)}</span>
                </div>
              </div>
            ))}
            {assignable.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Select value={picked} onValueChange={(value) => setPicked(typeof value === "string" ? value : "")}>
                    <SelectTrigger className="w-full" aria-label="Coupon to assign">
                      <SelectValue placeholder="Assign a coupon…" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignable.map((c) => (
                        <SelectItem key={c.description} value={c.description}>
                          {c.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={picked === ""}
                  onClick={() => {
                    const coupon = BASE_COUPONS.find((c) => c.description === picked)
                    if (!coupon) return
                    setCoupons((prev) => [...prev, coupon])
                    setPicked("")
                    toast.success("Coupon assigned to the patient")
                  }}
                >
                  <PlusIcon data-icon="inline-start" />
                  Assign
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                      variant="ghost"
                      className={v.paid ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground"}
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
  )
}
