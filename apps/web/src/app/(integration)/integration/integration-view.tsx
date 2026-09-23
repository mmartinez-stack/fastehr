"use client"

import * as React from "react"
import { BookOpen, Copy, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { trpc } from "@/trpc/client"

/**
 * What a partner's account sees: nothing clinical. Its integration and the
 * state of its keys (never a stored key: a key is shown once, at issuance or
 * rotation), the calling conventions in a few lines, and one button to the
 * reference, which asks for the key and shows exactly the operations that
 * key covers (ADR 38).
 *
 * Rotation is the one thing the account may change (ADR 36 as amended): the
 * new key copies the old one's scopes and settings, the old key keeps
 * working for a day, and the new key appears here once, to be copied and
 * then forgotten by the page.
 */
function keyState(key: { enabled: boolean; expiresAt: string | null }) {
  if (!key.enabled) {
    return (
      <Badge variant="ghost" className="bg-muted text-muted-foreground">
        Revoked
      </Badge>
    )
  }
  if (key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now()) {
    return (
      <Badge variant="ghost" className="bg-warning/15 text-warning">
        Expired
      </Badge>
    )
  }
  return (
    <Badge variant="ghost" className="bg-success/15 text-success">
      Active
    </Badge>
  )
}

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.")
  }
}

function CopyButton({ label, value }: { label: string; value: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copyText(label, value)}>
      <Copy data-icon="inline-start" />
      Copy
    </Button>
  )
}

export function IntegrationView() {
  const utils = trpc.useUtils()
  const mine = trpc.integration.mine.useQuery()
  const integration = mine.data ?? null
  const activeKeys = integration?.keys.filter((key) => key.enabled) ?? []
  // The origin is a browser fact: read on the client, empty on the server, no effect needed.
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  )
  const baseUrl = `${origin}/api/v1`

  const [confirming, setConfirming] = React.useState<{ id: string; start: string | null } | null>(null)
  const [issued, setIssued] = React.useState<{ key: string; start: string | null; expiresAt: string | null; previousExpiresAt: string } | null>(null)

  const rotate = trpc.integration.rotateKey.useMutation({
    onSuccess: (result) => {
      setConfirming(null)
      setIssued({
        key: result.key,
        start: result.issued.start,
        expiresAt: result.issued.expiresAt,
        previousExpiresAt: result.previousExpiresAt,
      })
      void utils.integration.mine.invalidate()
    },
    onError: (error) => {
      setConfirming(null)
      toast.error(
        error.data?.code === "TOO_MANY_REQUESTS"
          ? "A key was rotated less than an hour ago. Try again later."
          : error.data?.code === "PRECONDITION_FAILED"
            ? "This key cannot be rotated. Ask the clinic for a new one."
            : "The key could not be rotated. Try again.",
      )
    },
  })

  return (
    <div>
      <PageHeader
        title={integration?.name ?? "Integration"}
        description="Your integration with the clinic: the state of your API keys, how to call the API, and the reference."
        actions={
          <Button size="sm" render={<a href="/api/v1/docs" target="_blank" rel="noopener noreferrer" />}>
            <BookOpen data-icon="inline-start" />
            Open the API reference
          </Button>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your API keys</CardTitle>
            <CardDescription>
              The clinic issues your first key and shows it once. Rotate replaces a key with a copy of the same scopes
              and settings: the new key is shown once, and the old one keeps working for 24 hours. This page never stores a
              key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(integration?.keys ?? []).map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{key.start ?? key.id}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{key.scopes.join(", ") || "-"}</TableCell>
                    <TableCell>{key.expiresAt === null ? "-" : new Date(key.expiresAt).toLocaleDateString()}</TableCell>
                    <TableCell>{key.lastUsedAt === null ? "Never" : new Date(key.lastUsedAt).toLocaleString()}</TableCell>
                    <TableCell>{keyState(key)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {key.enabled ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={rotate.isPending}
                            onClick={() => setConfirming({ id: key.id, start: key.start })}
                          >
                            <RefreshCw data-icon="inline-start" />
                            Rotate
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {mine.isPending ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (integration?.keys.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No key has been issued yet. The clinic issues it and hands it over out of band.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calling the API</CardTitle>
            <CardDescription>Server to server, over TLS. The reference has every request and response shape.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span>Base URL:</span>
              <span className="font-mono">{baseUrl}</span>
              {origin ? <CopyButton label="Base URL" value={baseUrl} /> : null}
            </div>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Send your key on every request as <span className="font-mono">Authorization: Bearer &lt;key&gt;</span>. Bodies are
                JSON.
              </li>
              <li>
                Find the caller with <span className="font-mono">POST /patients/lookup</span>. Two request shapes are valid:
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    <span className="font-mono">patientId</span> on its own, for a record you already hold.
                  </li>
                  <li>
                    <span className="font-mono">dateOfBirth</span> (required) with <span className="font-mono">phone</span> and/or{" "}
                    <span className="font-mono">lastName</span> (at least one); <span className="font-mono">firstName</span> is optional
                    and only together with a last name, to narrow it.
                  </li>
                </ul>
                Anything else answers 400 with the field names. Up to five candidates come back with names, the last four digits
                of the phone, and the clinic. Never a date of birth.
              </li>
              <li>
                Prove the caller with <span className="font-mono">POST /patients/{"{patientId}"}/verify</span>: date of birth and
                phone, both required. Success returns a token good for fifteen minutes; send it as{" "}
                <span className="font-mono">X-Patient-Verification</span> on patient-specific calls.
              </li>
              <li>
                Errors are codes, never messages, in{" "}
                <span className="font-mono">{"{ error: { code, requestId } }"}</span>. Quote the request id in any support request.
              </li>
            </ol>
            <p className="text-muted-foreground">
              Limits: 120 requests a minute per key, 30 a minute on lookup and verify, five wrong verifications lock a patient for
              thirty minutes. Honour <span className="font-mono">Retry-After</span>.
            </p>
            <p className="text-muted-foreground">
              {activeKeys.length === 0
                ? "The reference shows your operations once you paste an active key into it."
                : "Paste your key into the reference to see exactly the operations it covers."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirming !== null} onOpenChange={(open) => (open ? undefined : setConfirming(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate this key?</DialogTitle>
            <DialogDescription>
              A new key with the same scopes and settings replaces{" "}
              <span className="font-mono">{confirming?.start ?? confirming?.id}</span>. The new key is shown once, on the next
              screen. The old key keeps working for 24 hours, then expires.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={rotate.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => (confirming === null ? undefined : rotate.mutate({ keyId: confirming.id }))}
              disabled={rotate.isPending}
            >
              {rotate.isPending ? "Rotating…" : "Rotate key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issued !== null} onOpenChange={(open) => (open ? undefined : setIssued(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy it now and store it in your secrets manager. It is not shown again and the clinic cannot recover it.
              {issued?.previousExpiresAt
                ? ` The previous key stops working at ${new Date(issued.previousExpiresAt).toLocaleString()}.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
            <code className="flex-1 break-all font-mono text-xs">{issued?.key}</code>
            {issued ? <CopyButton label="API key" value={issued.key} /> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Starts <span className="font-mono">{issued?.start}</span>
            {issued?.expiresAt ? `, expires ${new Date(issued.expiresAt).toLocaleDateString()}` : null}.
          </p>
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>I have copied it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
