"use client"

import Link from "next/link"
import {
  Eye,
  ImageIcon,
  Check,
  Trash2,
  FileText,
  FileCheck,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { LanguageTag } from "@/components/status-badges"
import { useOffice } from "@/components/office-provider"
import {
  unsignedQueue,
  signedQueue,
  refillRequests,
  fmtDate,
  fmtDateLong,
  type QueueRow,
} from "@/lib/mock-data"
import { QueueSubnav } from "./queue-subnav"

function QueueTable({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-sm text-muted-foreground">
        No charts in this queue.
      </p>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Date</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead className="text-right">DOB</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.visitId}>
            <TableCell className="text-muted-foreground">{fmtDate(r.date)}</TableCell>
            <TableCell>
              <Link
                href={`/patients/${r.patientId}`}
                className="font-medium text-primary hover:underline"
              >
                {r.patientName}
              </Link>
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {fmtDateLong(r.dob)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function QueuesPage() {
  const { office } = useOffice()
  const unsigned = unsignedQueue(office === "At Home" ? "Downtown" : office)
  const signed = signedQueue(office === "At Home" ? "Downtown" : office)

  return (
    <div>
      <PageHeader
        title="Queues"
        description={`Charting queues for the ${office} office.`}
      />
      <QueueSubnav />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-warning-foreground" />
                  Clinic Queue — Unsigned
                </CardTitle>
                <CardDescription>Downtown</CardDescription>
              </div>
              <Badge variant="ghost" className="bg-warning/15 text-warning-foreground">
                {unsigned.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <QueueTable rows={unsigned} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="size-4 text-success" />
                  Clinic Queue — Signed
                </CardTitle>
                <CardDescription>Downtown</CardDescription>
              </div>
              <Badge variant="ghost" className="bg-success/15 text-success">
                {signed.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <QueueTable rows={signed} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Refill Requests — Unsigned</CardTitle>
            <CardDescription>
              Review, add notes, and sign off outstanding refill requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Date</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Lang</TableHead>
                    <TableHead className="min-w-56">Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refillRequests
                    .filter((r) => !r.signed)
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">
                          {fmtDate(r.date)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/patients/${r.patientId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.patientName}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {r.medication} {r.dosage}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDateLong(r.dob)}
                        </TableCell>
                        <TableCell>
                          <LanguageTag language={r.language} />
                        </TableCell>
                        <TableCell>
                          <Textarea
                            defaultValue={r.notes}
                            rows={2}
                            className="min-h-0 w-full resize-none text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="View patient"
                              nativeButton={false}
                              render={<Link href={`/patients/${r.patientId}`} />}
                            >
                              <Eye />
                            </Button>
                            <Button variant="ghost" size="icon-xs" aria-label="View photo">
                              <ImageIcon />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Mark signed"
                              className="text-success"
                            >
                              <Check />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Delete"
                              className="text-destructive"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
