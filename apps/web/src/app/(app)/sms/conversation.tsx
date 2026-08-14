"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type SmsThread, type SmsMessage, SMS_TEMPLATES, fmtTime } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { SendIcon, UserIcon } from "lucide-react"

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
}

export function Conversation({ thread }: { thread: SmsThread }) {
  const [messages, setMessages] = useState<SmsMessage[]>(thread.messages)
  const [draft, setDraft] = useState("")

  // reset local state when switching threads
  const [activeId, setActiveId] = useState(thread.id)
  if (activeId !== thread.id) {
    setActiveId(thread.id)
    setMessages(thread.messages)
    setDraft("")
  }

  function send() {
    const text = draft.trim()
    if (!text) return
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, direction: "out", text, time: new Date().toISOString() },
    ])
    setDraft("")
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar>
          <AvatarFallback>{initials(thread.patientName)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <Link
            href={`/patients/${thread.patientId}`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {thread.patientName}
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">{thread.phone}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          nativeButton={false}
          render={<Link href={`/patients/${thread.patientId}`} />}
        >
          <UserIcon data-icon="inline-start" />
          Chart
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-muted/30 p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex flex-col gap-1", m.direction === "out" ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-[78%] rounded-2xl px-4 py-2 text-sm",
                m.direction === "out"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-card text-card-foreground shadow-sm",
              )}
            >
              {m.text}
            </div>
            <span className="px-1 text-[11px] text-muted-foreground">{fmtTime(m.time)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Template:</span>
          <Select
            items={SMS_TEMPLATES.map((t) => ({ label: t.label, value: t.text }))}
            onValueChange={(v) => setDraft(v as string)}
          >
            <SelectTrigger size="sm" className="w-56">
              <SelectValue placeholder="Insert a template..." />
            </SelectTrigger>
            <SelectContent>
              {SMS_TEMPLATES.map((t) => (
                <SelectItem key={t.label} value={t.text}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <InputGroup>
          <InputGroupTextarea
            placeholder="Type a message..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                send()
              }
            }}
          />
          <InputGroupAddon align="block-end">
            <Badge variant="secondary" className="text-[11px]">
              {draft.length}/160
            </Badge>
            <InputGroupButton className="ml-auto" onClick={send} disabled={!draft.trim()}>
              <SendIcon data-icon="inline-start" />
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  )
}
