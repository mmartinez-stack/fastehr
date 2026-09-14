"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  CameraIcon,
  CheckIcon,
  ClipboardCheckIcon,
  MessageSquarePlusIcon,
  PenLineIcon,
  PhoneIcon,
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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { SignedBadge } from "@/components/status-badges"
import { useSurfaces } from "@/components/role-provider"
import { cn } from "@/lib/utils"
import {
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
 */
export const RECORD_KIND_LABEL: Record<RecordAuthor, string> = {
  provider: "Visit records",
  administrative: "Administrative records",
}

function Addendum({ addendum }: { addendum: VisitAddendum }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/60 px-3 py-2 text-sm">
      <p className="leading-relaxed text-pretty">{addendum.notes}</p>
      <p className="text-xs text-muted-foreground">
        {addendum.signedBy} on {fmtDateTime(addendum.signedAt)}
      </p>
    </div>
  )
}

/** A comment of this kind left on a visit of the other kind. */
export interface CrossComment {
  visit: Visit
  addendum: VisitAddendum
}

export function VisitRecords({
  kind,
  visits,
  comments = [],
  currentUser,
}: {
  kind: RecordAuthor
  /** Visits of this kind, newest first. */
  visits: Visit[]
  /** Comments of this kind on visits of the other kind, shown in the same timeline. */
  comments?: CrossComment[]
  currentUser: string
}) {
  const { clinical, staff } = useSurfaces()
  const [signedIds, setSignedIds] = useState<Record<string, string>>({})
  const [added, setAdded] = useState<Record<string, VisitAddendum[]>>({})
  const [drafting, setDrafting] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState<Visit | null>(null)

  function sign(v: Visit) {
    setSignedIds((prev) => ({ ...prev, [v.id]: currentUser }))
    toast.success(`Visit note signed as ${currentUser}`)
  }

  function saveAddendum(v: Visit) {
    const notes = draft.trim()
    if (notes === "") return
    const addendum: VisitAddendum = {
      notes,
      // A comment belongs to the tab it is written from.
      author: kind,
      signedBy: currentUser,
      signedAt: new Date().toISOString(),
    }
    setAdded((prev) => ({ ...prev, [v.id]: [...(prev[v.id] ?? []), addendum] }))
    setDraft("")
    setDrafting(null)
    toast.success("Note added and signed")
  }

  // One timeline: the visits of this kind and this kind's comments on the
  // other kind's visits, newest first.
  const timeline: ({ at: string; visit: Visit } | { at: string; comment: CrossComment })[] = [
    ...visits.filter((v) => !deleted.has(v.id)).map((visit) => ({ at: visit.date, visit })),
    ...comments.map((comment) => ({ at: comment.addendum.signedAt, comment })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at))

  if (timeline.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-sm text-muted-foreground">
        No {RECORD_KIND_LABEL[kind].toLowerCase()} on file.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {timeline.map((entry) => {
        if ("comment" in entry) {
          const { visit, addendum } = entry.comment
          return (
            <article key={`${visit.id}:${addendum.signedAt}`} className="rounded-lg border border-border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5 text-sm">
                <span className="font-semibold">Comment on the {fmtDateLong(visit.date)} visit</span>
                <Badge variant="outline">{visit.type}</Badge>
              </header>
              <div className="px-4 py-3">
                <Addendum addendum={addendum} />
              </div>
            </article>
          )
        }
        const v = entry.visit
          const locallySigned = signedIds[v.id]
          const isSigned = v.signed || Boolean(locallySigned)
          const signedByName = v.signedBy ?? locallySigned
          const addenda = [...v.addenda, ...(added[v.id] ?? [])].filter((a) => a.author === kind)

          return (
            <article key={v.id} className={cn("rounded-lg border border-border", isSigned ? "bg-card" : "bg-warning/10")}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold">On: {fmtDateLong(v.date)}</span>
                  <span className="text-muted-foreground">{v.provider}</span>
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
                {v.meds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {v.meds.map((m, i) => (
                      <span
                        key={i}
                        className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium"
                      >
                        {m.name} {m.dosage}
                      </span>
                    ))}
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
                  <div className="flex flex-col gap-2">
                    {addenda.map((addendum, i) => (
                      <Addendum key={i} addendum={addendum} />
                    ))}
                  </div>
                )}

                {drafting === v.id && (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={3}
                      autoFocus
                      aria-label="Note to add"
                      placeholder="A comment on this visit. It is signed with your name when saved."
                    />
                    <div className="flex justify-end gap-2">
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
                      <Button size="sm" onClick={() => saveAddendum(v)} disabled={draft.trim() === ""}>
                        <PenLineIcon data-icon="inline-start" />
                        Save and sign
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    <span>Opened on {v.openedAt ? fmtDateTime(v.openedAt) : fmtDateLong(v.date)}</span>
                    {isSigned && signedByName && v.signedAt && (
                      <span>
                        Signed by {signedByName} on {fmtDateTime(v.signedAt)}
                      </span>
                    )}
                    {isSigned && signedByName && !v.signedAt && <span>Signed by {signedByName}</span>}
                    {v.reviewedBy && v.reviewedAt && (
                      <span>
                        Reviewed by {v.reviewedBy} on {fmtDateTime(v.reviewedAt)}
                      </span>
                    )}
                  </div>
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
