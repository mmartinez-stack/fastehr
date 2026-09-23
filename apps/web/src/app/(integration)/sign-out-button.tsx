"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function SignOutButton() {
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
      onClick={signOut}
    >
      <LogOut data-icon="inline-start" />
      Sign out
    </Button>
  )
}
