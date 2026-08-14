import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Language, PatientStatus } from "@/lib/mock-data"

export function LanguageTag({ language }: { language: Language }) {
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      {language}
    </Badge>
  )
}

export function PatientStatusBadge({ status }: { status: PatientStatus }) {
  return (
    <Badge
      variant="ghost"
      className={cn(
        status === "active"
          ? "bg-success/15 text-success"
          : "bg-destructive/10 text-destructive",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "active" ? "bg-success" : "bg-destructive",
        )}
      />
      {status === "active" ? "Active" : "Inactive"}
    </Badge>
  )
}

export function SignedBadge({ signed }: { signed: boolean }) {
  return signed ? (
    <Badge variant="ghost" className="bg-success/15 text-success">
      Signed
    </Badge>
  ) : (
    <Badge variant="ghost" className="bg-warning/20 text-warning-foreground">
      Unsigned
    </Badge>
  )
}

export function LeadStatusBadge({ status }: { status: "New" | "Contacted" | "Scheduled" }) {
  const map = {
    New: "bg-primary/10 text-primary",
    Contacted: "bg-warning/20 text-warning-foreground",
    Scheduled: "bg-success/15 text-success",
  } as const
  return (
    <Badge variant="ghost" className={map[status]}>
      {status}
    </Badge>
  )
}
