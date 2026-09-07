"use client"

import * as React from "react"
import Link from "next/link"
import { ClipboardCheck, Play } from "lucide-react"
import { toast } from "sonner"
import { REVIEW_SAMPLE_RATE_DEFAULT } from "@fastehr/contracts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
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
import { PageHeader } from "@/components/page-header"
import { useRole, useSurfaces } from "@/components/role-provider"
import { trpc } from "@/trpc/client"

/**
 * The medical-director review queue (DIA-74, ADR 30): the sampled notes not
 * yet signed off, oldest pick first. Visible only with the medical-director
 * flag — a flag, not a role, so the page reads the session's flag and the
 * procedures behind it refuse anyone else.
 *
 * An admin who also holds the flag gets the sampling run on demand here,
 * for catch-ups and for a demo that cannot wait for the weekly job.
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

function RunSampleCard() {
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
    <Card>
      <CardHeader>
        <CardTitle>Run sampling now</CardTitle>
        <CardDescription>
          The weekly job picks a random one in {REVIEW_SAMPLE_RATE_DEFAULT} of the notes signed
          since its last run. Run it early here, or catch up from an earlier date.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-4"
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
      </CardContent>
    </Card>
  )
}

export default function ReviewQueuePage() {
  const { medicalDirector } = useRole()
  const { staff } = useSurfaces()
  const queue = trpc.review.queue.useQuery(undefined, { enabled: medicalDirector })
  const rows = queue.data ?? []

  if (!medicalDirector) {
    return (
      <Empty>
        <EmptyTitle>Medical director only</EmptyTitle>
        <EmptyDescription>
          The review queue is for accounts with the medical director flag.{" "}
          <Link href="/patients" className="underline">Back to patients</Link>
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Medical director review"
        description="A random sample of signed clinic notes, awaiting your review and sign-off."
      />

      {staff ? <RunSampleCard /> : null}

      <Card>
        <CardContent>
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
                  <TableCell>{item.office ?? "-"}</TableCell>
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
                        Open
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
        </CardContent>
      </Card>
    </div>
  )
}
