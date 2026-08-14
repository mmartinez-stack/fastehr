"use client"

import { useState } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { callbacks as seedCallbacks, fmtDate } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { PhoneIcon, CheckCircle2Icon } from "lucide-react"

export default function CallbacksPage() {
  const [callbacks, setCallbacks] = useState(seedCallbacks)
  const [showDone, setShowDone] = useState(false)

  function toggle(id: string) {
    setCallbacks((prev) => prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)))
  }

  const visible = callbacks.filter((c) => (showDone ? true : !c.done))
  const openCount = callbacks.filter((c) => !c.done).length

  return (
    <div>
      <PageHeader
        title="Callbacks"
        description="Patients who need a return phone call from the front desk."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{openCount} open</Badge>
            <Button variant="outline" size="sm" onClick={() => setShowDone((s) => !s)}>
              {showDone ? "Hide completed" : "Show completed"}
            </Button>
          </div>
        }
      />

      <Card className="mt-6">
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <CheckCircle2Icon className="size-8 text-success" />
                <EmptyTitle>All caught up</EmptyTitle>
                <EmptyDescription>There are no open callbacks right now.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => (
                  <TableRow key={c.id} className={cn(c.done && "opacity-55")}>
                    <TableCell>
                      <Checkbox
                        checked={c.done}
                        onCheckedChange={() => toggle(c.id)}
                        aria-label={`Mark ${c.patientName} callback done`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(c.date)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/patients/${c.patientId}`}
                        className={cn(
                          "font-medium text-primary hover:underline",
                          c.done && "line-through",
                        )}
                      >
                        {c.patientName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{c.phone}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{c.reason}</span>
                        {c.notes && (
                          <span className="text-xs text-muted-foreground">{c.notes}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.assignedTo}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <PhoneIcon data-icon="inline-start" />
                        Call
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
