import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, UserPlus, Archive } from "lucide-react"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/page-header"
import { LeadStatusBadge } from "@/components/status-badges"
import { getStartTreatment, fmtDateLong } from "@/lib/mock-data"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

export default async function StartTreatmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const submission = getStartTreatment(id)
  if (!submission) notFound()

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        nativeButton={false}
        render={<Link href="/queues/start-treatment" />}
      >
        <ArrowLeft data-icon="inline-start" />
        Back to submissions
      </Button>

      <PageHeader title={submission.name} description="Start My Treatment submission">
        <LeadStatusBadge status={submission.status} />
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Submission details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Row label="Submitted" value={fmtDateLong(submission.date)} />
            <Row label="Full name" value={submission.name} />
            <Row label="Phone" value={submission.phone} />
            <Row label="Email" value={submission.email} />
            <Row label="Address" value={submission.address} />
            <Row label="Program of interest" value={submission.program} />
            <Row label="Goal weight" value={`${submission.goalWeight} lbs`} />
            <Row label="How did you hear about us" value={submission.heardFrom} />
          </dl>

          <Separator className="my-4" />

          <Field>
            <FieldLabel htmlFor="followup">Follow-up notes</FieldLabel>
            <Textarea
              id="followup"
              placeholder="Log outreach attempts and notes…"
              defaultValue={submission.notes}
              rows={4}
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline">
            <Archive data-icon="inline-start" />
            Archive
          </Button>
          <Button>
            <UserPlus data-icon="inline-start" />
            Convert to Patient
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
