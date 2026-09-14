import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Language, PatientStatus } from "@/lib/mock-data"

/** `lg` is the record header's size: readable beside a title, not a table cell's tag. */
type BadgeSize = "default" | "lg"

export function LanguageTag({ language, size = "default" }: { language: Language; size?: BadgeSize }) {
  return (
    <Badge
      variant="ghost"
      className={cn(
        "bg-foreground/10 font-mono font-semibold text-foreground",
        size === "lg" ? "px-2.5 py-1 text-sm" : "text-[10px]",
      )}
    >
      {language}
    </Badge>
  )
}

export function PatientStatusBadge({ status, size = "default" }: { status: PatientStatus; size?: BadgeSize }) {
  return (
    <Badge
      variant="ghost"
      className={cn(
        status === "active" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
        size === "lg" && "px-2.5 py-1 text-sm",
      )}
    >
      <span
        className={cn(
          "rounded-full",
          size === "lg" ? "size-2" : "size-1.5",
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
