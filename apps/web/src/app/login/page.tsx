"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Card, CardContent } from "@/components/ui/card"
import { HeartPulseIcon } from "lucide-react"
import { authClient } from "@/lib/auth-client"

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFailed(false)

    const form = new FormData(e.currentTarget)
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    })

    if (error) {
      // One message for every failure. Distinguishing "no such user" from
      // "wrong password" would confirm which staff emails exist.
      setFailed(true)
      setLoading(false)
      return
    }

    const mustChangePassword =
      (data?.user as Record<string, unknown> | undefined)?.mustChangePassword === true

    router.push(mustChangePassword ? "/change-password" : "/queues")
    router.refresh()
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-secondary px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <HeartPulseIcon className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Fastehr</h1>
            <p className="text-sm text-muted-foreground">Sign in to your clinic workspace</p>
          </div>
        </div>

        <Card>
          <CardContent className="py-6">
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input id="email" name="email" type="email" autoComplete="email" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </Field>
                {failed ? (
                  <p role="alert" className="text-sm text-destructive">
                    Invalid email or password.
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
