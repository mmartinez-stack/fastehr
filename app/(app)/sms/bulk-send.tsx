"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { patients, SMS_TEMPLATES, OFFICES, type Office } from "@/lib/mock-data"
import { toast } from "sonner"
import { UsersIcon, SendIcon } from "lucide-react"

type Audience = "all" | Office | "spanish" | "active"

const AUDIENCES: { label: string; value: Audience }[] = [
  { label: "All patients", value: "all" },
  { label: "Active patients", value: "active" },
  { label: "Spanish-speaking", value: "spanish" },
  ...OFFICES.map((o) => ({ label: `${o} office`, value: o as Audience })),
]

function countAudience(a: Audience) {
  return patients.filter((p) => {
    if (a === "all") return true
    if (a === "active") return p.status === "active"
    if (a === "spanish") return p.language === "SPA"
    return p.office === a
  }).length
}

export function BulkSend() {
  const [audience, setAudience] = useState<Audience>("all")
  const [message, setMessage] = useState("")

  const recipients = countAudience(audience)

  function send() {
    if (!message.trim()) return
    toast.success("Broadcast queued", {
      description: `Sending to ${recipients} patient${recipients === 1 ? "" : "s"}.`,
    })
    setMessage("")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Compose broadcast</CardTitle>
          <CardDescription>Send a one-way SMS to a group of patients at once.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Audience</FieldLabel>
              <Select
                value={audience}
                onValueChange={(v) => setAudience(v as Audience)}
                items={AUDIENCES}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Patients matching this filter will receive the message.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Template</FieldLabel>
              <Select
                items={SMS_TEMPLATES.map((t) => ({ label: t.label, value: t.text }))}
                onValueChange={(v) => setMessage(v as string)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Start from a template..." />
                </SelectTrigger>
                <SelectContent>
                  {SMS_TEMPLATES.map((t) => (
                    <SelectItem key={t.label} value={t.text}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="bulk-message">Message</FieldLabel>
              <Textarea
                id="bulk-message"
                rows={5}
                placeholder="Write your broadcast message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <FieldDescription>{message.length} characters</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg bg-accent p-4">
            <UsersIcon className="size-6 text-primary" />
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tabular-nums">{recipients}</span>
              <span className="text-xs text-muted-foreground">recipients</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Audience</span>
            <Badge variant="secondary" className="w-fit">
              {AUDIENCES.find((a) => a.value === audience)?.label}
            </Badge>
          </div>
          <Button onClick={send} disabled={!message.trim()} className="w-full">
            <SendIcon data-icon="inline-start" />
            Send Broadcast
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
