"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, PenLine } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/page-header"
import { useRole } from "@/components/role-provider"
import { trpc } from "@/trpc/client"

/**
 * One sampled note, opened from the review queue (DIA-74): the body as the
 * provider signed it, read-only, with the reviewer's comments and sign-off
 * beneath. Signing off records reviewer, comments, and timestamp on the
 * note and returns to the queue; a note already signed off shows the review
 * instead of the form.
 */

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function formatDob(iso: string): string {
  const [y, m, d] = iso.split("-")
  const month = m === undefined ? undefined : MONTHS[Number(m) - 1]
  return month === undefined || d === undefined ? iso : `${month} ${Number(d)}, ${y}`
}

export default function ReviewNotePage() {
  const params = useParams<{ visitId: string }>()
  const router = useRouter()
  const utils = trpc.useUtils()
  const { medicalDirector } = useRole()
  const [comments, setComments] = React.useState("")

  const note = trpc.review.note.useQuery({ visitId: params.visitId }, { enabled: medicalDirector, retry: false })
  const signOff = trpc.review.signOff.useMutation({
    onSuccess: (reviewed) => {
      void utils.review.queue.invalidate()
      void utils.review.note.invalidate({ visitId: params.visitId })
      toast.success(`Signed off the note for ${reviewed.patient.firstName} ${reviewed.patient.lastName}`)
      router.push("/review")
    },
    onError: (error) =>
      toast.error(
        error.message === "note is not in the review queue"
          ? "This note has already been signed off."
          : "The sign-off could not be saved. Try again.",
      ),
  })

  if (!medicalDirector) {
    return (
      <Empty>
        <EmptyTitle>Medical director only</EmptyTitle>
        <EmptyDescription>
          Notes under review are for accounts with the medical director flag.{" "}
          <Link href="/patients" className="underline">Back to patients</Link>
        </EmptyDescription>
      </Empty>
    )
  }

  if (note.isPending) {
    return <p className="py-8 text-center text-muted-foreground">Loading note…</p>
  }

  if (note.isError || note.data === undefined) {
    return (
      <Empty>
        <EmptyTitle>Note not found</EmptyTitle>
        <EmptyDescription>
          This note is not in the review queue.{" "}
          <Link href="/review" className="underline">Back to the queue</Link>
        </EmptyDescription>
      </Empty>
    )
  }

  const item = note.data
  const reviewed = item.reviewedAt !== null

  return (
    <div>
      <div className="mb-3 flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to the review queue"
          className="-ml-2"
          nativeButton={false}
          render={<Link href="/review" />}
        >
          <ArrowLeft />
        </Button>
        <PageHeader
          className="mb-0 flex-1"
          title={`${item.patient.lastName}, ${item.patient.firstName}`}
          description={`DOB ${formatDob(item.patient.dateOfBirth)}. Seen ${formatWhen(item.dateOfService)}${item.office === null ? "" : ` at ${item.office}`}.`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Clinic note</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {item.signedAt === null
                ? "Unsigned."
                : `Signed by ${item.signedByName ?? "an unknown provider"} on ${formatWhen(item.signedAt)}.`}
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {item.notes === null || item.notes.trim() === "" ? (
                <span className="text-muted-foreground">This note has no text.</span>
              ) : (
                item.notes
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
          </CardHeader>
          {reviewed ? (
            <CardContent>
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Signed off</AlertTitle>
                <AlertDescription>
                  By {item.reviewedByName ?? "the medical director"} on{" "}
                  {item.reviewedAt === null ? "" : formatWhen(item.reviewedAt)}.
                  {item.reviewComments === null ? null : (
                    <span className="mt-2 block whitespace-pre-wrap">{item.reviewComments}</span>
                  )}
                </AlertDescription>
              </Alert>
            </CardContent>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                signOff.mutate({ visitId: item.visitId, comments })
              }}
            >
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="review-comments">Comments</FieldLabel>
                  <Textarea
                    id="review-comments"
                    rows={8}
                    value={comments}
                    onChange={(event) => setComments(event.target.value)}
                    placeholder="Findings, corrections, or nothing at all"
                  />
                  <FieldDescription>Recorded on the note with your name and the time.</FieldDescription>
                </Field>
              </CardContent>
              <CardFooter className="justify-end">
                <Button type="submit" disabled={signOff.isPending}>
                  <PenLine data-icon="inline-start" />
                  {signOff.isPending ? "Signing off…" : "Sign off"}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
