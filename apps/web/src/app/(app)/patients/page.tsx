"use client"

import * as React from "react"
import Link from "next/link"
import { Search, UserPlus } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { useSurfaces } from "@/components/role-provider"
import { trpc } from "@/trpc/client"

/**
 * The patient roster — the legacy patient queue on the real seam. Same shape:
 * a filter bar (first name, last name, DOB, phone), a Search action, and the
 * recent list as the unfiltered default (legacy `GET /patients`, 30 most
 * recent). Search semantics live server-side in `patient.search` with the
 * legacy behavior: names match exactly but case-insensitively, phone by its
 * ten digits. The legacy "Visit Date" column returns with the visits domain.
 */

interface SearchFields {
  firstName: string
  lastName: string
  dateOfBirth: string
  phone: string
}

const EMPTY_SEARCH: SearchFields = { firstName: "", lastName: "", dateOfBirth: "", phone: "" }

/**
 * The legacy gating, client-side as it was there: names count with two or
 * more characters, phone with a full ten digits. Anything less is not part
 * of the query.
 */
function toFilters(fields: SearchFields) {
  const digits = fields.phone.replace(/\D/g, "")
  const filters = {
    ...(fields.firstName.trim().length >= 2 ? { firstName: fields.firstName.trim() } : {}),
    ...(fields.lastName.trim().length >= 2 ? { lastName: fields.lastName.trim() } : {}),
    ...(fields.dateOfBirth === "" ? {} : { dateOfBirth: fields.dateOfBirth }),
    ...(digits.length === 10 ? { phone: digits } : {}),
  }
  return Object.keys(filters).length === 0 ? null : filters
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
  if (phone === null) return "—"
  return phone.length === 10 ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}` : phone
}

export default function PatientsPage() {
  const [fields, setFields] = React.useState<SearchFields>(EMPTY_SEARCH)
  // What the Search button last submitted — typing alone never queries,
  // exactly like the legacy queue's explicit Search action.
  const [submitted, setSubmitted] = React.useState<ReturnType<typeof toFilters>>(null)
  // Contact details are clerical, on the roster as much as on the record.
  const { clerical } = useSurfaces()

  const recent = trpc.patient.recent.useQuery(undefined, { enabled: submitted === null })
  const search = trpc.patient.search.useQuery(submitted ?? {}, { enabled: submitted !== null })

  const active = submitted === null ? recent : search
  const patients = active.data ?? []

  const phoneDigits = fields.phone.replace(/\D/g, "")

  const bind = (name: keyof SearchFields) => ({
    value: fields[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setFields((current) => ({ ...current, [name]: event.target.value })),
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
          <form
            className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault()
              setSubmitted(toFilters(fields))
            }}
          >
            <Field>
              <FieldLabel htmlFor="search-first-name">First name</FieldLabel>
              <Input id="search-first-name" {...bind("firstName")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="search-last-name">Last name</FieldLabel>
              <Input id="search-last-name" {...bind("lastName")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="search-dob">Date of birth</FieldLabel>
              <Input id="search-dob" type="date" {...bind("dateOfBirth")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="search-phone">Phone</FieldLabel>
              <Input id="search-phone" type="tel" maxLength={15} {...bind("phone")} />
              {phoneDigits.length > 0 && phoneDigits.length !== 10 ? (
                <FieldDescription>Phone search needs all ten digits.</FieldDescription>
              ) : null}
            </Field>
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
                    setFields(EMPTY_SEARCH)
                    setSubmitted(null)
                  }}
                >
                  Clear
                </Button>
              ) : null}
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
                  <TableCell>{patient.office ?? "—"}</TableCell>
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
