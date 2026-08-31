"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Card, CardContent } from "@/components/ui/card"
import { KeyRoundIcon } from "lucide-react"
import { PasswordInput } from "@/components/password-input"
import { authClient } from "@/lib/auth-client"

export function ChangePasswordForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFailed(null)

    const form = new FormData(e.currentTarget)
    const newPassword = String(form.get("newPassword") ?? "")
    if (newPassword !== String(form.get("confirmPassword") ?? "")) {
      setFailed("Passwords do not match.")
      setLoading(false)
      return
    }

    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword,
      revokeOtherSessions: true,
    })

    if (error) {
      setFailed("Password change failed. Check your current password and try again.")
      setLoading(false)
      return
    }

    router.push("/queues")
    router.refresh()
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-secondary px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRoundIcon className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
            <p className="text-sm text-muted-foreground">
              Your temporary password must be replaced before you can continue.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="py-6">
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
                  <PasswordInput
                    id="currentPassword"
                    name="currentPassword"
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                  <PasswordInput
                    id="newPassword"
                    name="newPassword"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
                  <PasswordInput
                    id="confirmPassword"
                    name="confirmPassword"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </Field>
                {failed ? (
                  <p role="alert" className="text-sm text-destructive">
                    {failed}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Saving..." : "Change password"}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
