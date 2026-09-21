"use client"

import { useId, useState } from "react"
import { toast } from "sonner"
import {
  CameraIcon,
  CheckIcon,
  ClipboardCheckIcon,
  MessageSquarePlusIcon,
  PenLineIcon,
  PhoneIcon,
  SaveIcon,
  Trash2Icon,
  TruckIcon,
  UserXIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { SignedBadge } from "@/components/status-badges"
import { useSurfaces } from "@/components/role-provider"
import { cn } from "@/lib/utils"
import {
  bmi,
  fmtDateLong,
  fmtDateTime,
  type RecordAuthor,
  type Visit,
  type VisitAddendum,
} from "@/lib/mock-data"

/**
 * The records of one kind, on their own tab (the 2026-09-13 review): the
 * clinical notes for the provider, the administrative entries (payment,
 * mailing, a call) for the front desk, instead of the legacy chart's colour
 * per author in one list. Which tab a role sees is the surface split
 * (ADR 28); an administrator has both. A comment added after signing
 * (an addendum) belongs to the kind of the person who wrote it: a billing
 * remark on a clinical visit shows on the administrative tab, referencing
 * the visit, not beneath the clinical note.
 *
 * The Sep 14 review, on the clinical notes:
 * - Each note carries its visit's weight and BMI, top right beside the
 *   medication, as the legacy chart did; the header's pair is the current one.
 * - "Signed by" is its own line beneath the note, where the legacy chart's
 *   Sign panel put it, not a footnote.
 * - Addenda are a thread with room between entries.
 * - Two buttons on a draft: Save keeps it unsigned, Save and sign finalises it.
 * - A reviewer signs a reviewed note a second time ("Sign reviewed as", the
 *   legacy button).
 * - A Provider view checkbox: clinical notes and refill requests only,
 *   colour-coded green; the front desk's comments on them stay out of sight.
 */
export const RECORD_KIND_LABEL: Record<RecordAuthor, string> = {
  provider: "Visit records",
  administrative: "Administrative records",
}

/** A comment of this kind left on a visit of the other kind. */
export interface CrossComment {
  visit: Visit
  addendum: VisitAddendum
}

function AddendumThread({
  addenda,
  onSign,
}: {
  addenda: VisitAddendum[]
  onSign: (index: number) => void
}) {
  return (
    <ol className="ml-1 flex flex-col gap-3 border-l-2 border-primary/30 pl-4" aria-label="Addenda">
      {addenda.map((addendum, index) => (
        <li key={`${addendum.signedAt}:${index}`} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-semibold text-foreground">{addendum.signedBy}</span>
            <span className="text-muted-foreground">{fmtDateTime(addendum.signedAt)}</span>
            {addendum.draft === true && (
              <Badge variant="ghost" className="bg-warning/20 text-warning-foreground">
                Draft, not signed
              </Badge>
            )}
          </div>
          <p className="text-sm leading-relaxed text-pretty">{addendum.notes}</p>
          {addendum.draft === true && (
            <div>
              <Button variant="outline" size="sm" onClick={() => onSign(index)}>
                <PenLineIcon data-icon="inline-start" />
                Sign
              </Button>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

export function VisitRecords({
  kind,
  visits,
  comments = [],
  currentUser,
  heightIn,
  providerViewDefault = false,
}: {
  kind: RecordAuthor
  /** Visits of this kind, newest first. */
  visits: Visit[]
  /** Comments of this kind on visits of the other kind, shown in the same timeline. */
  comments?: CrossComment[]
  currentUser: string
  /** The patient's height, for each note's BMI. */
  heightIn: number
  /** Whether the Provider view starts on (a provider's own screen) or off (an administrator's). */
  providerViewDefault?: boolean
}) {
  const { clinical, staff } = useSurfaces()
  const providerViewId = useId()
  const [providerView, setProviderView] = useState(providerViewDefault)
  const [signedIds, setSignedIds] = useState<Record<string, string>>({})
  const [reviewSignatures, setReviewSignatures] = useState<Record<string, { by: string; at: string }>>({})
  const [added, setAdded] = useState<Record<string, VisitAddendum[]>>({})
  const [drafting, setDrafting] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState<Visit | null>(null)

  function sign(v: Visit) {
    setSignedIds((prev) => ({ ...prev, [v.id]: currentUser }))
    toast.success(`Visit note signed as ${currentUser}`)
  }

  function signReviewed(v: Visit) {
    setReviewSignatures((prev) => ({ ...prev, [v.id]: { by: currentUser, at: new Date().toISOString() } }))
    toast.success(`Reviewed note signed as ${currentUser}`)
  }

  function saveAddendum(v: Visit, signed: boolean) {
    const notes = draft.trim()
    if (notes === "") return
    const addendum: VisitAddendum = {
      notes,
      // A comment belongs to the tab it is written from.
      author: kind,
      signedBy: currentUser,
      signedAt: new Date().toISOString(),
      draft: signed ? undefined : true,
    }
    setAdded((prev) => ({ ...prev, [v.id]: [...(prev[v.id] ?? []), addendum] }))
    setDraft("")
    setDrafting(null)
    toast.success(signed ? "Note added and signed" : "Note saved as a draft")
  }

  function signAddendum(v: Visit, index: number) {
    setAdded((prev) => {
      const list = [...(prev[v.id] ?? [])]
      const entry = list[index]
      if (entry === undefined) return prev
      list[index] = { ...entry, draft: undefined, signedBy: currentUser, signedAt: new Date().toISOString() }
      return { ...prev, [v.id]: list }
    })
    toast.success(`Note signed as ${currentUser}`)
  }

  // The Provider view (clinical tab only): the front desk's comments on
  // clinical visits are administrative entries, and leave the timeline.
  const hideComments = kind === "provider" && providerView

  // One timeline: the visits of this kind and this kind's comments on the
  // other kind's visits, newest first.
  const timeline: ({ at: string; visit: Visit } | { at: string; comment: CrossComment })[] = [
    ...visits.filter((v) => !deleted.has(v.id)).map((visit) => ({ at: visit.date, visit })),
    ...(hideComments ? [] : comments.map((comment) => ({ at: comment.addendum.signedAt, comment }))),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at))

  const providerViewToggle =
    kind === "provider" && clinical ? (
      <div className="flex items-center gap-2 px-1">
        <Checkbox
          id={providerViewId}
          checked={providerView}
          onCheckedChange={(checked) => setProviderView(checked === true)}
        />
        <Label htmlFor={providerViewId} className="text-sm font-normal text-muted-foreground">
          Provider view: clinical notes and refill requests only, in green
        </Label>
      </div>
    ) : null

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {providerViewToggle}
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          No {RECORD_KIND_LABEL[kind].toLowerCase()} on file.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {providerViewToggle}
      {timeline.map((entry) => {
        if ("comment" in entry) {
          const { visit, addendum } = entry.comment
          return (
            <article
              key={`${visit.id}:${addendum.signedAt}`}
              className="rounded-lg border border-foreground/15 bg-card shadow-sm"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 bg-muted/50 px-4 py-2.5 text-sm">
                <span className="font-semibold">Comment on the {fmtDateLong(visit.date)} visit</span>
                <Badge variant="outline">{visit.type}</Badge>
              </header>
              <div className="px-4 py-3">
                <AddendumThread addenda={[addendum]} onSign={() => undefined} />
              </div>
            </article>
          )
        }
        const v = entry.visit
        const locallySigned = signedIds[v.id]
        const isSigned = v.signed || Boolean(locallySigned)
        const signedByName = v.signedBy ?? locallySigned
        const reviewSignature = reviewSignatures[v.id]
        const addenda = [...v.addenda, ...(added[v.id] ?? [])].filter((a) => a.author === kind)
        const visitBmi = v.weight > 0 ? bmi(v.weight, heightIn) : null
        const green = kind === "provider" && providerView

        return (
          <article
            key={v.id}
            className={cn(
              "rounded-lg border shadow-sm",
              isSigned ? "border-foreground/15 bg-card" : "border-warning/50 bg-warning/10",
              green && "border-l-4 border-l-success",
            )}
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 bg-muted/50 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold">On: {fmtDateLong(v.date)}</span>
                <span className="text-foreground/80">{v.provider}</span>
                {v.bloodPressure && (
                  <span className="text-muted-foreground">
                    BP{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {v.bloodPressure.systolic}/{v.bloodPressure.diastolic}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{v.type}</Badge>
                {v.phoneVisit && (
                  <Badge variant="outline" className="gap-1">
                    <PhoneIcon className="size-3" />
                    Phone visit
                  </Badge>
                )}
                {v.phoneVisit && v.mailingCompleted && (
                  <Badge variant="ghost" className="gap-1 bg-success/15 text-success">
                    <CheckIcon className="size-3" />
                    Mailed
                  </Badge>
                )}
                {v.noShow && (
                  <Badge variant="ghost" className="gap-1 bg-destructive/10 text-destructive">
                    <UserXIcon className="size-3" />
                    No show
                  </Badge>
                )}
                {v.reviewedBy && (
                  <Badge variant="ghost" className="gap-1 bg-primary/10 text-primary">
                    <ClipboardCheckIcon className="size-3" />
                    Reviewed
                  </Badge>
                )}
                <SignedBadge signed={isSigned} />
              </div>
            </header>

            <div className="flex flex-col gap-3 px-4 py-3">
              {/* Medication is clinical detail; an administrative entry has none
                  to show. The visit's weight and BMI sit at the top right beside
                  it (the Sep 14 review); the header's pair is the current one. */}
              {kind === "provider" && (v.meds.length > 0 || visitBmi !== null) && (
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {v.meds.map((m, i) => (
                      <span
                        key={i}
                        className="rounded border border-foreground/15 bg-muted px-2 py-0.5 text-xs font-medium"
                      >
                        {m.name} {m.dosage}
                      </span>
                    ))}
                  </div>
                  {visitBmi !== null && (
                    <dl className="flex items-baseline gap-3 text-xs">
                      <div className="flex items-baseline gap-1">
                        <dt className="text-muted-foreground">Weight</dt>
                        <dd className="font-semibold tabular-nums">{v.weight} lbs</dd>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <dt className="text-muted-foreground">BMI</dt>
                        <dd className="font-semibold tabular-nums">{visitBmi}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              )}

              <p className="text-sm leading-relaxed text-pretty">{v.notes}</p>

              {v.tracking && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TruckIcon className="size-3.5" />
                  Tracking: <span className="font-mono">{v.tracking}</span>
                </p>
              )}

              {addenda.length > 0 && (
                <AddendumThread addenda={addenda} onSign={(index) => signAddendum(v, index - v.addenda.length)} />
              )}

              {drafting === v.id && (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={3}
                    autoFocus
                    aria-label="Note to add"
                    placeholder="A comment on this visit. Save keeps a draft; Save and sign puts your name on it."
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDrafting(null)
                        setDraft("")
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveAddendum(v, false)}
                      disabled={draft.trim() === ""}
                    >
                      <SaveIcon data-icon="inline-start" />
                      Save
                    </Button>
                    <Button size="sm" onClick={() => saveAddendum(v, true)} disabled={draft.trim() === ""}>
                      <PenLineIcon data-icon="inline-start" />
                      Save and sign
                    </Button>
                  </div>
                </div>
              )}

              {/* The signature, on its own line beneath the note, where the
                  legacy chart's Sign panel showed it. */}
              <div className="flex flex-col gap-0.5 text-sm">
                {isSigned && signedByName ? (
                  <p>
                    Signed by: <span className="font-medium">{signedByName}</span>
                    {v.signedAt && <span> on {fmtDateTime(v.signedAt)}</span>}
                  </p>
                ) : (
                  <p className="text-warning-foreground">Not signed</p>
                )}
                {v.reviewedBy && v.reviewedAt && (
                  <p className="text-muted-foreground">
                    Reviewed by {v.reviewedBy} on {fmtDateTime(v.reviewedAt)}
                  </p>
                )}
                {reviewSignature && (
                  <p>
                    Reviewed note signed by: <span className="font-medium">{reviewSignature.by}</span> on{" "}
                    {fmtDateTime(reviewSignature.at)}
                  </p>
                )}
              </div>

              <Separator />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Opened on {v.openedAt ? fmtDateTime(v.openedAt) : fmtDateLong(v.date)}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {v.photo && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CameraIcon className="size-3.5" />
                      Photo on file
                    </span>
                  )}
                  {isSigned && drafting !== v.id && (
                    <Button variant="ghost" size="sm" onClick={() => setDrafting(v.id)}>
                      <MessageSquarePlusIcon data-icon="inline-start" />
                      Add note
                    </Button>
                  )}
                  {!isSigned && (kind === "administrative" || clinical) && (
                    <Button variant="outline" size="sm" onClick={() => sign(v)}>
                      <PenLineIcon data-icon="inline-start" />
                      Sign as {currentUser}
                    </Button>
                  )}
                  {/* The legacy chart's second signature: a reviewer signs a
                      reviewed note again after the initial signing. */}
                  {isSigned && v.reviewedBy && clinical && !reviewSignature && (
                    <Button variant="outline" size="sm" onClick={() => signReviewed(v)}>
                      <ClipboardCheckIcon data-icon="inline-start" />
                      Sign reviewed as {currentUser}
                    </Button>
                  )}
                  {staff && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setConfirmDelete(v)}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </article>
        )
      })}

      {/* Admin only, as in the legacy chart: for a duplicate, never a correction. */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this visit?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `The ${fmtDateLong(confirmDelete.date)} record and its notes will be removed. Use this for a duplicate entry only.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDelete) {
                  setDeleted((prev) => new Set(prev).add(confirmDelete.id))
                  toast.success("Visit deleted")
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
