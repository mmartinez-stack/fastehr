import 'server-only'

import type { RoleSurface } from '@fastehr/contracts'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { GuardDenied, requireSurface, type Actor } from '@/server'

/**
 * Page-side adapter for the server guards: resolves the request headers,
 * redirects the two recoverable denials (no session → /login, temp credential
 * → /change-password), and hands FORBIDDEN back for the page to render as a
 * refusal. The check is by surface, against the one access matrix (ADR 31),
 * so a page never names a role.
 *
 * The `redirect` calls sit outside the try/catch on purpose — `redirect`
 * throws its control-flow error, and a catch around it would swallow the
 * navigation.
 */
export async function guardPage(
  surface: RoleSurface,
): Promise<{ status: 'ok'; actor: Actor } | { status: 'forbidden' }> {
  let outcome: { status: 'ok'; actor: Actor } | { status: 'forbidden' } | 'login' | 'change-password'

  try {
    outcome = { status: 'ok', actor: await requireSurface(await headers(), surface) }
  } catch (error) {
    if (!(error instanceof GuardDenied)) throw error
    if (error.code === 'UNAUTHENTICATED') outcome = 'login'
    else if (error.code === 'PASSWORD_CHANGE_REQUIRED') outcome = 'change-password'
    else outcome = { status: 'forbidden' }
  }

  if (outcome === 'login') redirect('/login')
  if (outcome === 'change-password') redirect('/change-password')

  return outcome
}
