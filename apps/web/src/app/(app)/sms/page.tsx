"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { smsThreads, fmtTime } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { Conversation } from "./conversation"
import { BulkSend } from "./bulk-send"

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
}

export default function SmsPage() {
  const [activeId, setActiveId] = useState(smsThreads[0].id)
  const active = smsThreads.find((t) => t.id === activeId) ?? smsThreads[0]

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col px-4 py-6 md:px-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground">Two-way SMS with your patients.</p>
        </div>
      </div>

      <Tabs defaultValue="inbox" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Send</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4 min-h-0 flex-1">
          <Card className="grid h-full grid-cols-1 overflow-hidden p-0 md:grid-cols-[300px_1fr]">
            <div className="flex flex-col overflow-y-auto border-r border-border">
              {smsThreads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    "flex items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/50",
                    t.id === activeId && "bg-accent",
                  )}
                >
                  <Avatar className="mt-0.5">
                    <AvatarFallback>{initials(t.patientName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{t.patientName}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {fmtTime(t.timestamp)}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "truncate text-xs",
                        t.unread ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t.lastMessage}
                    </span>
                  </div>
                  {t.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
            <Conversation thread={active} />
          </Card>
        </TabsContent>

        <TabsContent value="bulk" className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <BulkSend />
        </TabsContent>
      </Tabs>
    </div>
  )
}
