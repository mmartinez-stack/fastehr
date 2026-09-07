import { IntakeClient } from "./intake-client"

/**
 * The self-service intake page a texted link opens (DIA-72, ADR 29). Outside
 * the `(app)` group on purpose: no session, no nav, no office switcher — the
 * person has no account, and the token in the path is their only credential.
 * The proxy leaves `/intake` alone for the same reason.
 */
export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <IntakeClient token={token} />
}
