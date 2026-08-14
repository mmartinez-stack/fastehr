"use client"

import * as React from "react"
import Link from "next/link"
import { Search, UserPlus } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { LanguageTag, PatientStatusBadge } from "@/components/status-badges"
import { useSurfaces } from "@/components/role-provider"
import { patients, fullName, fmtDateLong } from "@/lib/mock-data"

export default function PatientsPage() {
  const [query, setQuery] = React.useState("")
  // Contact details are clerical, on the roster as much as on the record.
  const { clerical } = useSurfaces()

  const filtered = patients.filter((p) => {
    const q = query.toLowerCase()
    return (
      fullName(p).toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      p.office.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Search and manage the clinic patient roster."
      >
        <Button render={<Link href="/patients/new" />} nativeButton={false}>
          <UserPlus data-icon="inline-start" />
          New Patient
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by name, phone, or office…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>DOB</TableHead>
                {clerical && <TableHead>Phone</TableHead>}
                <TableHead>Office</TableHead>
                <TableHead>Lang</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last visit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/patients/${p.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {fullName(p)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDateLong(p.dob)}
                  </TableCell>
                  {clerical && (
                    <TableCell className="text-muted-foreground">{p.phone}</TableCell>
                  )}
                  <TableCell>{p.office}</TableCell>
                  <TableCell>
                    <LanguageTag language={p.language} />
                  </TableCell>
                  <TableCell>
                    <PatientStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmtDateLong(p.lastVisit)}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={clerical ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No patients match your search.
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
