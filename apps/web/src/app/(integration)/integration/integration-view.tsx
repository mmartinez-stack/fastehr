"use client"

import { BookOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { trpc } from "@/trpc/client"

/**
 * What a partner's account sees: nothing clinical. Its integration and the
 * state of its keys (never a key itself: a key is shown once, at issuance,
 * by the clinic), the calling conventions in a few lines, and one button to
 * the reference, which asks for the key and shows exactly the operations
 * that key covers (ADR 38).
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

export function IntegrationView() {
  const mine = trpc.integration.mine.useQuery()
  const integration = mine.data ?? null
  const activeKeys = integration?.keys.filter((key) => key.enabled) ?? []

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
              Keys are issued by the clinic and shown once, at issuance. This page shows their state, never the key.
              Ask the clinic to rotate or revoke one.
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
                  </TableRow>
                ))}
                {mine.isPending ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (integration?.keys.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
            <p>
              Base URL: <span className="font-mono">{typeof window === "undefined" ? "" : window.location.origin}/api/v1</span>
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Send your key on every request as <span className="font-mono">Authorization: Bearer &lt;key&gt;</span>. Bodies are
                JSON.
              </li>
              <li>
                Find the caller with <span className="font-mono">POST /patients/lookup</span>: date of birth plus phone or last name.
                Up to five candidates come back with names, the last four digits of the phone, and the clinic. Never a date of
                birth.
              </li>
              <li>
                Prove the caller with <span className="font-mono">POST /patients/{"{patientId}"}/verify</span>: date of birth and
                phone. Success returns a token good for fifteen minutes; send it as{" "}
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
    </div>
  )
}
