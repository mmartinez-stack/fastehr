"use client"

import Link from "next/link"
import {
  CalendarClockIcon,
  ClipboardListIcon,
  PhoneCallIcon,
  InboxIcon,
  UserPlusIcon,
  LockIcon,
} from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useOffice } from "@/components/office-provider"
import { useSurfaces } from "@/components/role-provider"
import { WaiversColumn } from "@/features/consents/waivers-column"
import {
  appointments,
  callbacks,
  fmtDate,
  fmtDateLong,
  fmtTime,
  pendingWaivers,
  rfiEntries,
  startTreatment,
} from "@/lib/mock-data"

/**
 * The administrative desk.
 *
 * The Aug 7 sync asked for medical assistants to have a screen of their own —
 * consent forms, appointments, and the clerical follow-up work — rather than
 * finding those things scattered across screens built around charting. The
 * three columns are the three standing jobs, and waivers leads because it is
 * the one with a deadline attached to it.
 */
export default function AdminDeskPage() {
  const { office } = useOffice()
  const { clerical } = useSurfaces()

  const waivers = pendingWaivers(office)
  const openCallbacks = callbacks.filter((c) => !c.done)
  const newLeads = rfiEntries.filter((r) => r.status !== "Scheduled")
  const newSubmissions = startTreatment.filter((s) => s.status === "New")

  if (!clerical) {
    return (
      <div>
        <PageHeader title="Admin Desk" />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <LockIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">This is an administrative screen.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Clerical work sits outside the provider view. Switch the role in the
              header to see it — in the built system this screen would not be
              reachable at all.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Admin Desk"
        description={`Consent forms, appointments, and clerical follow-up for the ${office} office.`}
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/patients/new" />}>
            <UserPlusIcon data-icon="inline-start" />
            New Patient
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)] 3xl:grid-cols-[360px_minmax(0,1fr)_minmax(0,1fr)]">
        <WaiversColumn waivers={waivers} />

        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClockIcon className="size-4 text-primary" />
                Appointments this week
              </CardTitle>
              <Badge variant="secondary">{appointments.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Provider</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDate(a.start)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {fmtTime(a.start)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/patients/${a.patientId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.patientName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      {a.provider}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="h-full xl:col-span-2 3xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardListIcon className="size-4 text-primary" />
              Clerical tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <PhoneCallIcon className="size-4 text-muted-foreground" />
                  Callbacks to make
                </h3>
                <Button
                  variant="ghost"
                  size="xs"
                  nativeButton={false}
                  render={<Link href="/callbacks" />}
                >
                  Open
                </Button>
              </div>
              <ul className="flex flex-col divide-y divide-border text-sm">
                {openCallbacks.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <Link
                      href={`/patients/${c.patientId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.patientName}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <InboxIcon className="size-4 text-muted-foreground" />
                  Leads awaiting contact
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    nativeButton={false}
                    render={<Link href="/rfi" />}
                  >
                    RFI
                  </Button>
                  {/*
                    Start My Treatment submissions live under /queues, which is
                    a clinical route — so without this link the role that
                    actually works the leads has no way to reach them. Where
                    that screen belongs in a role-split IA is a question for
                    DIA-18, not something to answer by moving it here.
                  */}
                  <Button
                    variant="ghost"
                    size="xs"
                    nativeButton={false}
                    render={<Link href="/queues/start-treatment" />}
                  >
                    Submissions
                  </Button>
                </div>
              </div>
              <ul className="flex flex-col divide-y divide-border text-sm">
                {newLeads.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.program} · {fmtDate(r.date)}
                    </span>
                  </li>
                ))}
                {newSubmissions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <Link
                      href={`/queues/start-treatment/${s.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      Start My Treatment · {fmtDateLong(s.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
