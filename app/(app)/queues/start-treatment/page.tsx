import Link from "next/link"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { LeadStatusBadge } from "@/components/status-badges"
import { startTreatment, fmtDateLong } from "@/lib/mock-data"
import { QueueSubnav } from "../queue-subnav"

export default function StartTreatmentPage() {
  return (
    <div>
      <PageHeader
        title="Start My Treatment"
        description="Web submissions from prospective patients."
      />
      <QueueSubnav active="Start Treatment" />

      <Card>
        <CardHeader>
          <CardTitle>Web submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {startTreatment.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">
                    {fmtDateLong(s.date)}
                  </TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{s.email}</TableCell>
                  <TableCell>{s.program}</TableCell>
                  <TableCell>
                    <LeadStatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/queues/start-treatment/${s.id}`} />}
                    >
                      View
                    </Button>
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
