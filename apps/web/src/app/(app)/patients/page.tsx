"use client"

import * as React from "react"
import Link from "next/link"
import { Search, UserPlus } from "lucide-react"
import { interpretPatientSearch, type PatientSearchProblem } from "@fastehr/contracts"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { useSurfaces } from "@/components/role-provider"
import { trpc } from "@/trpc/client"

/**
 * The patient roster — the legacy patient queue on the real seam. One search
 * input for names and phone (ADR 27) — the format of what was typed decides
 * the field — plus a separate date-of-birth field; the two combine as AND.
 * The recent list stays the unfiltered default (legacy `GET /patients`, 30
 * most recent), and match semantics live server-side in `patient.search`.
 * The legacy "Visit Date" column returns with the visits domain.
 *
 * The same `interpretPatientSearch` the server parses with runs here first,
 * so an uninterpretable query becomes an inline hint instead of a request —
 * the docs/forms.md rule, applied to a search.
 */

/** The copy table for interpreter problems — codes travel, the client owns the words (ADR 12). */
const PROBLEM_COPY: Record<PatientSearchProblem, string> = {
  phone_incomplete: "Phone search needs all ten digits.",
  date_in_search: "Use the Date of birth field to search by date.",
  name_too_short: "Name searches need at least two letters per name.",
}

/** "1985-12-10" → "Dec 10, 1985" without touching Date (and its timezones). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function formatDob(iso: string): string {
  const [y, m, d] = iso.split("-")
  const month = m === undefined ? undefined : MONTHS[Number(m) - 1]
  return month === undefined || d === undefined ? iso : `${month} ${Number(d)}, ${y}`
}

/** Display formatting only — storage stays ten bare digits. */
function formatPhone(phone: string | null): string {
  if (phone === null) return "-"
  return phone.length === 10 ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}` : phone
}

export default function PatientsPage() {
  const [query, setQuery] = React.useState("")
  const [dob, setDob] = React.useState("")
  const [status, setStatus] = React.useState("any")
  // What the Search button last submitted — typing alone never queries,
  // exactly like the legacy queue's explicit Search action.
  const [submitted, setSubmitted] = React.useState<{
    query: string
    dateOfBirth: string
    status: string
  } | null>(null)
  // A problem is only shown after a submit attempt, never while typing.
  const [problem, setProblem] = React.useState<PatientSearchProblem | null>(null)
  // Contact details are clerical, on the roster as much as on the record.
  const { clerical } = useSurfaces()

  const recent = trpc.patient.recent.useQuery(undefined, { enabled: submitted === null })
  const search = trpc.patient.search.useQuery(
    submitted ?? { query: "", dateOfBirth: "", status: "" },
    { enabled: submitted !== null },
  )

  const active = submitted === null ? recent : search
  const patients = active.data ?? []

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
          <form
            className="flex items-start gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              const trimmed = query.trim()
              const statusFilter = status === "any" ? "" : status
              if (trimmed === "" && dob === "" && statusFilter === "") {
                setProblem(null)
                setSubmitted(null)
                return
              }
              if (trimmed !== "") {
                const interpreted = interpretPatientSearch(trimmed)
                if (!interpreted.ok) {
                  setProblem(interpreted.problem)
                  return
                }
              }
              setProblem(null)
              setSubmitted({ query: trimmed, dateOfBirth: dob, status: statusFilter })
            }}
          >
            <Field className="flex-1">
              <FieldLabel htmlFor="search-query">Search</FieldLabel>
              <Input
                id="search-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, “Last, First”, or phone"
              />
              <FieldDescription>
                {problem !== null
                  ? PROBLEM_COPY[problem]
                  : "Name or phone. What you type decides the field."}
              </FieldDescription>
            </Field>
            <Field className="w-64 shrink-0">
              <FieldLabel htmlFor="search-dob">Date of birth</FieldLabel>
              <Input
                id="search-dob"
                type="date"
                value={dob}
                onChange={(event) => setDob(event.target.value)}
              />
              <FieldDescription>Combines with the search.</FieldDescription>
            </Field>
            <Field className="w-36 shrink-0">
              <FieldLabel htmlFor="search-status">Status</FieldLabel>
              <Select
                value={status}
                onValueChange={(value) => setStatus(typeof value === "string" ? value : "any")}
              >
                <SelectTrigger id="search-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>Combines with the search.</FieldDescription>
            </Field>
            {/* Mirrors a Field's label-then-control rhythm (gap-2, leading-snug
                label) so the h-8 buttons sit exactly on the inputs' row. */}
            <div className="flex shrink-0 flex-col gap-2">
              <span aria-hidden="true" className="invisible text-sm leading-snug font-medium">
                Search
              </span>
              <div className="flex gap-2">
                <Button type="submit">
                  <Search data-icon="inline-start" />
                  Search
                </Button>
                {submitted !== null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setQuery("")
                      setDob("")
                      setStatus("any")
                      setProblem(null)
                      setSubmitted(null)
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>First name</TableHead>
                <TableHead>Last name</TableHead>
                <TableHead>DOB</TableHead>
                {clerical && <TableHead>Phone</TableHead>}
                <TableHead>Office</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>
                    <Link
                      href={`/patients/${patient.id}/edit`}
                      className="font-medium text-primary hover:underline"
                    >
                      {patient.firstName}
                    </Link>
                  </TableCell>
                  <TableCell>{patient.lastName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDob(patient.dateOfBirth)}
                  </TableCell>
                  {clerical && (
                    <TableCell className="text-muted-foreground">
                      {formatPhone(patient.phone)}
                    </TableCell>
                  )}
                  <TableCell>{patient.office ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={patient.status === "active" ? "secondary" : "outline"}>
                      {patient.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {active.isPending ? (
                <TableRow>
                  <TableCell colSpan={clerical ? 6 : 5} className="py-8 text-center text-muted-foreground">
                    Loading patients…
                  </TableCell>
                </TableRow>
              ) : active.isError ? (
                <TableRow>
                  <TableCell colSpan={clerical ? 6 : 5} className="py-8 text-center text-muted-foreground">
                    The roster could not be loaded. Try again.
                  </TableCell>
                </TableRow>
              ) : patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={clerical ? 6 : 5} className="py-8 text-center text-muted-foreground">
                    {submitted === null ? "No patients yet." : "No patients match your search."}
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
