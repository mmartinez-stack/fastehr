"use client"

import * as React from "react"
import { CheckCircle2, HeartPulse } from "lucide-react"
import type { PatientLanguage } from "@fastehr/contracts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { trpc } from "@/trpc/client"
import { INTAKE_COPY } from "./intake-copy.ts"
import { emptyIntakeValues, PatientIntakeForm } from "./patient-intake-form.tsx"

/**
 * The page a texted link opens: the form, or the reasons it cannot be shown
 * (still loading, a dead link) and what follows it (the thank-you). The
 * language starts as the one the front desk chose for the text and the
 * person can switch at the top; the form re-renders in place with its
 * values kept. A dead link has no language to go by, so that state speaks
 * both.
 *
 * Narrow by design: this is a phone surface, and on a larger screen a form
 * column stays readable rather than stretching (the staff app's full-width
 * rule is for the staff app; ADR 29 as amended).
 */
export function IntakeClient({ token }: { token: string }) {
  const invite = trpc.intake.open.useQuery({ token }, { retry: false })
  const [language, setLanguage] = React.useState<PatientLanguage | null>(null)
  const [done, setDone] = React.useState(false)

  const current: PatientLanguage = language ?? invite.data?.language ?? "english"
  const copy = INTAKE_COPY[current]

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-6 pt-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HeartPulse className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Fastehr</span>
        </div>
        {invite.isSuccess && !done ? (
          <div className="flex gap-1" role="group" aria-label="Language / Idioma">
            <LanguageButton active={current === "english"} onClick={() => setLanguage("english")}>
              English
            </LanguageButton>
            <LanguageButton active={current === "spanish"} onClick={() => setLanguage("spanish")}>
              Español
            </LanguageButton>
          </div>
        ) : null}
      </header>

      {invite.isPending ? (
        <p className="py-8 text-center text-muted-foreground">
          {INTAKE_COPY.english.page.opening} / {INTAKE_COPY.spanish.page.opening}
        </p>
      ) : invite.isError || invite.data === undefined ? (
        <Empty>
          <EmptyTitle>{INTAKE_COPY.english.page.invalidTitle}</EmptyTitle>
          <EmptyDescription>{INTAKE_COPY.english.page.invalidDescription}</EmptyDescription>
          <EmptyTitle className="mt-4">{INTAKE_COPY.spanish.page.invalidTitle}</EmptyTitle>
          <EmptyDescription>{INTAKE_COPY.spanish.page.invalidDescription}</EmptyDescription>
        </Empty>
      ) : done ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              {copy.page.doneTitle(invite.data.firstName)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{copy.page.doneDescription}</CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{copy.page.welcome(invite.data.firstName)}</h1>
            <p className="text-sm text-muted-foreground">{copy.page.intro}</p>
            <p className="text-sm text-muted-foreground">{copy.page.requiredHint}</p>
          </div>
          <PatientIntakeForm
            token={token}
            language={current}
            locations={invite.data.locations}
            defaultValues={emptyIntakeValues(invite.data.firstName, invite.data.lastName)}
            onDone={() => setDone(true)}
          />
        </>
      )}
    </main>
  )
}

function LanguageButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  )
}
