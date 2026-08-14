"use client"

import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { macros, OFFICES } from "@/lib/mock-data"
import { toast } from "sonner"

const NOTIFICATIONS = [
  { label: "New SMS from patients", desc: "Alert the front desk when a patient replies.", on: true },
  { label: "Unsigned visit reminders", desc: "Daily digest of visits awaiting a signature.", on: true },
  { label: "New lead notifications", desc: "Notify when a new RFI comes in from the website.", on: false },
  { label: "Refill request alerts", desc: "Ping providers when a refill needs approval.", on: true },
]

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
      <PageHeader title="Settings" description="Configure your clinic, macros, and notifications." />

      <Tabs defaultValue="clinic" className="mt-6">
        <TabsList>
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="macros">Text Macros</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Clinic profile</CardTitle>
              <CardDescription>Basic information shown to patients.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="clinic-name">Clinic name</FieldLabel>
                  <Input id="clinic-name" defaultValue="iCardio Weight & Wellness" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="clinic-phone">Main phone</FieldLabel>
                    <Input id="clinic-phone" defaultValue="(951) 555-0100" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="clinic-email">Reply-to email</FieldLabel>
                    <Input id="clinic-email" type="email" defaultValue="front-desk@icardio.com" />
                  </Field>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Offices</CardTitle>
              <CardDescription>Locations available across the app.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {OFFICES.map((o, i) => (
                <div key={o}>
                  {i > 0 && <Separator className="mb-3" />}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{o}</span>
                      <span className="text-xs text-muted-foreground">
                        {o === "At Home" ? "Mobile / in-home visits" : `${o} clinic location`}
                      </span>
                    </div>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => toast.success("Settings saved")}>Save changes</Button>
          </div>
        </TabsContent>

        <TabsContent value="macros" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Text macros</CardTitle>
              <CardDescription>
                Shortcuts that expand into full note text while charting.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Shortcut</TableHead>
                    <TableHead>Expands to</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {macros.map((m) => (
                    <TableRow key={m.shortcut}>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {m.shortcut}
                        </code>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.expansion}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notifications</CardTitle>
              <CardDescription>Choose which alerts your team receives.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {NOTIFICATIONS.map((n, i) => (
                <div key={n.label}>
                  {i > 0 && <Separator className="my-3" />}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{n.label}</span>
                      <span className="text-xs text-muted-foreground">{n.desc}</span>
                    </div>
                    <Switch defaultChecked={n.on} aria-label={n.label} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
