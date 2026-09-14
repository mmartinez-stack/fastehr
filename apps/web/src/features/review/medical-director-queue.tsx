"use client"

import * as React from "react"
import Link from "next/link"
import { ClipboardCheck, Play } from "lucide-react"
import { toast } from "sonner"
import { REVIEW_SAMPLE_RATE_DEFAULT } from "@fastehr/contracts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSessionSurfaces, useSurfaces } from "@/components/role-provider"
import { useLocation } from "@/components/location-provider"
import { trpc } from "@/trpc/client"

/**
 * The Medical Director Review Queue (DIA-74, ADR 30, ADR 31): the random one
 * in twenty of signed clinic notes routed for review, oldest pick first, as
 * one card on the Queues page beside the clinic queues. Renders only for the
 * medical director role — the previewed role must have the review surface
 * and so must the session, since the procedures behind it refuse anyone
 * else — and carries the sampling run for catch-ups and demos that cannot
 * wait for the weekly job.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function formatDob(iso: string): string {
  const [y, m, d] = iso.split("-")
  const month = m === undefined ? undefined : MONTHS[Number(m) - 1]
  return month === undefined || d === undefined ? iso : `${month} ${Number(d)}, ${y}`
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** `YYYY-MM-DD` for a date input, `days` ago in local time. */
function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toLocaleDateString("en-CA")
}

function RunSampleForm() {
  const utils = trpc.useUtils()
  const [rate, setRate] = React.useState(String(REVIEW_SAMPLE_RATE_DEFAULT))
  const [since, setSince] = React.useState("")
  const run = trpc.review.runSample.useMutation({
    onSuccess: (result) => {
      void utils.review.queue.invalidate()
      toast.success(
        `${result.sampledCount} of ${result.eligibleCount} signed notes added to the queue (1 in ${result.rate})`,
      )
    },
    onError: () => toast.error("The sampling run failed. Try again."),
  })

  return (
    <form
      className="flex flex-wrap items-end gap-4 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        const parsedRate = Number(rate)
        if (!Number.isInteger(parsedRate) || parsedRate < 1) {
          toast.error("Enter a whole number of 1 or more for the rate.")
          return
        }
        run.mutate({ rate: parsedRate, ...(since === "" ? {} : { windowStart: since }) })
      }}
    >
      <div className="flex w-full flex-col gap-1">
        <span className="text-sm font-medium">Run sampling now</span>
        <span className="text-sm text-muted-foreground">
          The weekly job picks a random one in {REVIEW_SAMPLE_RATE_DEFAULT} of the notes signed
          since its last run. Run it early here, or catch up from an earlier date.
        </span>
      </div>
      <Field className="w-32">
        <FieldLabel htmlFor="sample-rate">One in</FieldLabel>
        <Input id="sample-rate" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} />
        <FieldDescription>20 is five percent.</FieldDescription>
      </Field>
      <Field className="w-52">
        <FieldLabel htmlFor="sample-since">Signed since</FieldLabel>
        <Input
          id="sample-since"
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          placeholder={daysAgo(7)}
        />
        <FieldDescription>Blank continues from the last run.</FieldDescription>
      </Field>
      <Button type="submit" disabled={run.isPending}>
        <Play data-icon="inline-start" />
        {run.isPending ? "Sampling…" : "Run sampling"}
      </Button>
    </form>
  )
}

export function MedicalDirectorQueue({ className }: { className?: string }) {
  const { nameForOffice } = useLocation()
  const { review } = useSurfaces()
  const session = useSessionSurfaces()
  const enabled = review && session.review
  const queue = trpc.review.queue.useQuery(undefined, { enabled })
  const rows = queue.data ?? []

  if (!enabled) return null

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-primary" />
              Medical Director Review Queue
            </CardTitle>
            <CardDescription>
              A random 1 in {REVIEW_SAMPLE_RATE_DEFAULT} sample of signed clinic notes, routed here for
              review and sign-off.
            </CardDescription>
          </div>
          <Badge variant="ghost" className="bg-primary/10 text-primary">
            {rows.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Date of service</TableHead>
                <TableHead>Office</TableHead>
                <TableHead>Signed by</TableHead>
                <TableHead>Sampled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.visitId}>
                  <TableCell className="font-medium">
                    {item.patient.lastName}, {item.patient.firstName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDob(item.patient.dateOfBirth)}</TableCell>
                  <TableCell>{formatDay(item.dateOfService)}</TableCell>
                  <TableCell>{item.office === null ? "-" : nameForOffice(item.office)}</TableCell>
                  <TableCell>{item.signedByName ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDay(item.sampledAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/review/${item.visitId}`} />}
                      >
                        <ClipboardCheck data-icon="inline-start" />
                        Review
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {queue.isPending ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading the queue…
                  </TableCell>
                </TableRow>
              ) : queue.isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    The queue could not be loaded. Try again.
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nothing is waiting for review.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <RunSampleForm />
      </CardContent>
    </Card>
  )
}
