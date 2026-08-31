"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { LeadStatusBadge } from "@/components/status-badges"
import { rfiEntries, fmtDate, type RfiEntry } from "@/lib/mock-data"
import { SearchIcon, MailIcon, PhoneIcon, CalendarCheckIcon } from "lucide-react"

export default function RfiPage() {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<RfiEntry | null>(null)

  const filtered = rfiEntries.filter((r) =>
    `${r.name} ${r.phone} ${r.email} ${r.program}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div>
      <PageHeader
        title="Requests for Information"
        description="New leads and inquiries from the website and phone."
        actions={<Button size="sm">Add Lead</Button>}
      />

      <div className="mt-6 flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search leads..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <Card className="mt-4">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.program}</TableCell>
                  <TableCell>{r.source}</TableCell>
                  <TableCell>
                    <LeadStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelected(r)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  Lead received {fmtDate(selected.date)} via {selected.source}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
                <div className="flex items-center gap-2">
                  <LeadStatusBadge status={selected.status} />
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <PhoneIcon className="size-4 text-muted-foreground" />
                    {selected.phone}
                  </div>
                  <div className="flex items-center gap-2">
                    <MailIcon className="size-4 text-muted-foreground" />
                    <span className="truncate">{selected.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarCheckIcon className="size-4 text-muted-foreground" />
                    Interested in {selected.program}
                  </div>
                </div>
                <Separator />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Message</span>
                  <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {selected.message}
                  </p>
                </div>
                <Separator />
                <div className="flex flex-col gap-3">
                  <span className="text-sm font-medium">Follow-up history</span>
                  {selected.followups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No follow-ups logged yet.</p>
                  ) : (
                    <ol className="flex flex-col gap-3">
                      {selected.followups.map((f, i) => (
                        <li key={i} className="flex gap-3">
                          <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">{f.time}</span>
                            <span className="text-sm">{f.note}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                <Textarea placeholder="Log a new follow-up note..." rows={3} />
              </div>
              <SheetFooter>
                <Button>Save Follow-up</Button>
                <SheetClose render={<Button variant="outline">Close</Button>} />
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
