import 'server-only'

import type { StaffRole } from '@fastehr/contracts'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { GuardDenied, requireRole, type Actor } from '@/server'

/**
 * Page-side adapter for the server guards: resolves the request headers,
 * redirects the two recoverable denials (no session → /login, temp credential
 * → /change-password), and hands FORBIDDEN back for the page to render as a
 * refusal.
 *
 * The `redirect` calls sit outside the try/catch on purpose — `redirect`
 * throws its control-flow error, and a catch around it would swallow the
 * navigation.
 */
export async function guardPage(
  ...roles: readonly [StaffRole, ...StaffRole[]]
): Promise<{ status: 'ok'; actor: Actor } | { status: 'forbidden' }> {
  let outcome: { status: 'ok'; actor: Actor } | { status: 'forbidden' } | 'login' | 'change-password'

  try {
    outcome = { status: 'ok', actor: await requireRole(await headers(), ...roles) }
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
