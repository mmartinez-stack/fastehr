"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ClipboardList, Search, UserPlus } from "lucide-react"
import { interpretPatientSearch, type PatientSearchProblem } from "@fastehr/contracts"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageHeader } from "@/components/page-header"
import { useLocation } from "@/components/location-provider"
import { useSurfaces } from "@/components/role-provider"
import { trpc } from "@/trpc/client"

/**
 * The patient roster — the legacy patient queue on the real seam. It opens
 * on the 30 most recently seen patients (legacy `GET /patients`), and the
 * ~50k-row roster is never listed whole: everything past that is a search.
 * One search input for names and phone (ADR 27, as amended) — the format of
 * what was typed decides the field, names match by substring — plus two date
 * fields, date of birth and date of service; all three combine as AND. Match
 * semantics live server-side in `patient.search`.
 *
 * The search box also suggests as the user types: two characters, a short
 * debounce, and `patient.suggest` returns a handful of matches to jump to.
 * The Search button is still what fills the table.
 *
 * Rows sort by last visit, most recent first (DIA-50): the date a patient was
 * last seen is what the roster is for, and it replaced the active/inactive
 * badge, whose column stays in the database unexposed. A visit over a year
 * old gets a red dot — a flag to notice, not a status: those patients are
 * still active.
 *
 * The same `interpretPatientSearch` the server parses with runs here first,
 * so an uninterpretable query becomes an inline hint instead of a request —
 * the docs/forms.md rule, applied to a search.
 *
 * For the clerical roles the page has a second tab, **Pending intakes**: the
 * self-service submissions waiting for review in the clinic currently
 * selected in the header, or in every clinic (DIA-72, ADR 32). A provider sees the roster alone — the
 * tab is not rendered for them, and the procedure behind it would refuse
 * them anyway.
 */

/** The copy table for interpreter problems — codes travel, the client owns the words (ADR 12). */
const PROBLEM_COPY: Record<PatientSearchProblem, string> = {
  phone_incomplete: "Phone search needs all ten digits.",
  date_in_search: "Use the date fields to search by date.",
  name_too_short: "Name searches need at least two letters per name.",
}

/** The server's search cap; when a result fills it, the roster says so. */
const SEARCH_CAP = 100
/** How long the search box waits after the last keystroke before suggesting. */
const SUGGEST_DELAY_MS = 250

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

/** An instant, shown as the clinic's calendar day. */
function formatVisit(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

/**
 * The last-visit cell: the date, with a red dot when it is over a year old.
 * "-" is the roster's empty placeholder (the repo's convention) for a patient
 * with no visit on record.
 */
function LastVisitCell({ lastVisitAt, now }: { lastVisitAt: string | null; now: number }) {
  if (lastVisitAt === null) return <span className="text-muted-foreground">-</span>
  const overAYear = now - new Date(lastVisitAt).getTime() > ONE_YEAR_MS
  return (
    <span className="inline-flex items-center gap-2">
      {formatVisit(lastVisitAt)}
      {overAYear ? (
        <Tooltip>
          <TooltipTrigger
            render={<span aria-label="Last visit over a year ago" className="inline-flex" />}
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-destructive" />
          </TooltipTrigger>
          <TooltipContent>Last visit over a year ago</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}

/** A value that follows `value` after it has held still for `delayMs`. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/** An instant → "Sep 4, 2026, 3:12 PM" in the viewer's zone. */
function formatSubmitted(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** The legacy queue showed when to call; the person's answer, in their words' order. */
const CONTACT_TIME_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as const

/** The clinic's queue of submitted intakes (or every clinic's), each opening the review screen. */
function PendingIntakes() {
  const { location, labelFor } = useLocation()
  const pending = trpc.intake.listPending.useQuery({ location })
  const rows = pending.data ?? []

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>First name</TableHead>
              <TableHead>Last name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Best time to call</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">{request.firstName ?? "-"}</TableCell>
                <TableCell>{request.lastName ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{formatPhone(request.phone)}</TableCell>
                <TableCell>
                  {request.language === null ? "-" : request.language === "english" ? "English" : "Spanish"}
                </TableCell>
                <TableCell>
                  {request.submission?.preferredContactTime === undefined
                    ? "-"
                    : CONTACT_TIME_LABEL[request.submission.preferredContactTime]}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {request.submittedAt === null ? "-" : formatSubmitted(request.submittedAt)}
                </TableCell>
                <TableCell>
                  {/* Actions live on the row itself — no overflow menu. */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/patients/intakes/${request.id}`} />}
                    >
                      <ClipboardList data-icon="inline-start" />
                      Review
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {pending.isPending ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading intakes…
                </TableCell>
              </TableRow>
            ) : pending.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  The queue could not be loaded. Try again.
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No intakes are waiting for review{location === "all" ? "" : ` at ${labelFor(location)}`}.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

interface Criteria {
  query: string
  dateOfBirth: string
  serviceDate: string
}

export default function PatientsPage() {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [dob, setDob] = React.useState("")
  const [serviceDate, setServiceDate] = React.useState("")
  // What the Search button last submitted — the table fills only from an
  // explicit Search, exactly like the legacy queue's action.
  const [submitted, setSubmitted] = React.useState<Criteria | null>(null)
  // A problem is only shown after a submit attempt, never while typing.
  const [problem, setProblem] = React.useState<PatientSearchProblem | null>(null)
  // Whether the suggestion list may show — closed on Escape, blur, or a pick.
  const [suggesting, setSuggesting] = React.useState(false)
  // Contact details are clerical, on the roster as much as on the record.
  const { clerical } = useSurfaces()
  const { location, nameForOffice } = useLocation()
  // The tab's count: fetched only for the roles that can see the tab.
  const pendingCount = trpc.intake.listPending.useQuery({ location }, { enabled: clerical })
  // "Now" for the over-a-year flag, read once per mount: a render is pure,
  // and the day boundary does not need to move under an open screen.
  const [now] = React.useState(() => Date.now())

  const recent = trpc.patient.recent.useQuery(undefined, { enabled: submitted === null })
  const search = trpc.patient.search.useQuery(
    submitted ?? { query: "", dateOfBirth: "", serviceDate: "" },
    { enabled: submitted !== null },
  )
  const active = submitted === null ? recent : search

  // Type-ahead: only for a query the interpreter accepts, after it settles.
  const settled = useDebounced(query.trim(), SUGGEST_DELAY_MS)
  const suggestable = settled.length >= 2 && interpretPatientSearch(settled).ok
  const suggest = trpc.patient.suggest.useQuery(
    { query: settled },
    { enabled: suggestable && suggesting, placeholderData: (previous) => previous },
  )
  const suggestions = suggestable && suggesting ? (suggest.data ?? []) : []

  const patients = active.data ?? []
  const columns = clerical ? 6 : 5

  const runSearch = () => {
    const trimmed = query.trim()
    if (trimmed === "" && dob === "" && serviceDate === "") {
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
    setSuggesting(false)
    setSubmitted({ query: trimmed, dateOfBirth: dob, serviceDate })
  }

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

      {clerical ? (
        <Tabs defaultValue="roster">
          <TabsList>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="pending">
              Pending intakes
              {pendingCount.data !== undefined && pendingCount.data.length > 0 ? (
                <Badge variant="secondary" className="ml-1.5">{pendingCount.data.length}</Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="roster" className="mt-2">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <form
                className="flex items-start gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  runSearch()
                }}
              >
                <Field className="relative flex-1">
                  <FieldLabel htmlFor="search-query">Search</FieldLabel>
                  <Input
                    id="search-query"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setSuggesting(true)
                    }}
                    onFocus={() => setSuggesting(true)}
                    onBlur={() => setSuggesting(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setSuggesting(false)
                    }}
                    placeholder="Name, “Last, First”, or phone"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={suggestions.length > 0}
                    aria-controls="search-suggestions"
                    aria-autocomplete="list"
                  />
                  <FieldDescription>
                    {problem !== null
                      ? PROBLEM_COPY[problem]
                      : "Any part of a name, or a phone number. Suggestions appear as you type."}
                  </FieldDescription>
                  {suggestions.length > 0 ? (
                    <ul
                      id="search-suggestions"
                      role="listbox"
                      aria-label="Matching patients"
                      className="absolute top-full left-0 z-30 mt-1 w-full overflow-hidden rounded-lg border border-input bg-popover text-sm shadow-md"
                    >
                      {suggestions.map((patient) => (
                        <li key={patient.id} role="option" aria-selected={false}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-4 px-2.5 py-1.5 text-left hover:bg-accent"
                            // The input blurs before a click lands; keep the list
                            // open for the click by refusing focus here.
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setSuggesting(false)
                              router.push(`/patients/${patient.id}/edit`)
                            }}
                          >
                            <span className="font-medium">
                              {patient.lastName}, {patient.firstName}
                            </span>
                            <span className="text-muted-foreground">{formatDob(patient.dateOfBirth)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Field>
                <Field className="w-52 shrink-0">
                  <FieldLabel htmlFor="search-dob">Date of birth</FieldLabel>
                  <Input
                    id="search-dob"
                    type="date"
                    value={dob}
                    onChange={(event) => setDob(event.target.value)}
                  />
                  <FieldDescription>Combines with the search.</FieldDescription>
                </Field>
                <Field className="w-52 shrink-0">
                  <FieldLabel htmlFor="search-service-date">Seen on</FieldLabel>
                  <Input
                    id="search-service-date"
                    type="date"
                    value={serviceDate}
                    onChange={(event) => setServiceDate(event.target.value)}
                  />
                  <FieldDescription>Patients with a visit that day.</FieldDescription>
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
                          setServiceDate("")
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
                    <TableHead>Last visit</TableHead>
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
                      <TableCell>{patient.office === null ? "-" : nameForOffice(patient.office)}</TableCell>
                      <TableCell>
                        <LastVisitCell lastVisitAt={patient.lastVisitAt} now={now} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {active.isPending ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                        Loading patients…
                      </TableCell>
                    </TableRow>
                  ) : active.isError ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                        The roster could not be loaded. Try again.
                      </TableCell>
                    </TableRow>
                  ) : patients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                        {submitted === null ? "No patients yet." : "No patients match your search."}
                      </TableCell>
                    </TableRow>
                  ) : submitted !== null && patients.length >= SEARCH_CAP ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-4 text-center text-muted-foreground">
                        Showing the first {SEARCH_CAP} matches. Narrow the search to see the rest.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </TabsContent>
          <TabsContent value="pending" className="mt-2">
            <PendingIntakes />
          </TabsContent>
        </Tabs>
      ) : (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex items-start gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              runSearch()
            }}
          >
            <Field className="relative flex-1">
              <FieldLabel htmlFor="search-query">Search</FieldLabel>
              <Input
                id="search-query"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSuggesting(true)
                }}
                onFocus={() => setSuggesting(true)}
                onBlur={() => setSuggesting(false)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSuggesting(false)
                }}
                placeholder="Name, “Last, First”, or phone"
                autoComplete="off"
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls="search-suggestions"
                aria-autocomplete="list"
              />
              <FieldDescription>
                {problem !== null
                  ? PROBLEM_COPY[problem]
                  : "Any part of a name, or a phone number. Suggestions appear as you type."}
              </FieldDescription>
              {suggestions.length > 0 ? (
                <ul
                  id="search-suggestions"
                  role="listbox"
                  aria-label="Matching patients"
                  className="absolute top-full left-0 z-30 mt-1 w-full overflow-hidden rounded-lg border border-input bg-popover text-sm shadow-md"
                >
                  {suggestions.map((patient) => (
                    <li key={patient.id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 px-2.5 py-1.5 text-left hover:bg-accent"
                        // The input blurs before a click lands; keep the list
                        // open for the click by refusing focus here.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setSuggesting(false)
                          router.push(`/patients/${patient.id}/edit`)
                        }}
                      >
                        <span className="font-medium">
                          {patient.lastName}, {patient.firstName}
                        </span>
                        <span className="text-muted-foreground">{formatDob(patient.dateOfBirth)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>
            <Field className="w-52 shrink-0">
              <FieldLabel htmlFor="search-dob">Date of birth</FieldLabel>
              <Input
                id="search-dob"
                type="date"
                value={dob}
                onChange={(event) => setDob(event.target.value)}
              />
              <FieldDescription>Combines with the search.</FieldDescription>
            </Field>
            <Field className="w-52 shrink-0">
              <FieldLabel htmlFor="search-service-date">Seen on</FieldLabel>
              <Input
                id="search-service-date"
                type="date"
                value={serviceDate}
                onChange={(event) => setServiceDate(event.target.value)}
              />
              <FieldDescription>Patients with a visit that day.</FieldDescription>
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
                      setServiceDate("")
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
                <TableHead>Last visit</TableHead>
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
                  <TableCell>{patient.office === null ? "-" : nameForOffice(patient.office)}</TableCell>
                  <TableCell>
                    <LastVisitCell lastVisitAt={patient.lastVisitAt} now={now} />
                  </TableCell>
                </TableRow>
              ))}
              {active.isPending ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                    Loading patients…
                  </TableCell>
                </TableRow>
              ) : active.isError ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                    The roster could not be loaded. Try again.
                  </TableCell>
                </TableRow>
              ) : patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                    {submitted === null ? "No patients yet." : "No patients match your search."}
                  </TableCell>
                </TableRow>
              ) : submitted !== null && patients.length >= SEARCH_CAP ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-4 text-center text-muted-foreground">
                    Showing the first {SEARCH_CAP} matches. Narrow the search to see the rest.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}
    </div>
  )
}
