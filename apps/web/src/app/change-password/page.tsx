import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { GuardDenied, requireSession } from '@/server'
import { ChangePasswordForm } from './change-password-form.tsx'

/**
 * The one door a temp credential opens. `allowPendingPasswordChange` is the
 * only call site of that option — everywhere else a pending account is
 * refused outright.
 */
export const dynamic = 'force-dynamic'

export default async function ChangePasswordPage() {
  let authenticated = false
  try {
    await requireSession(await headers(), { allowPendingPasswordChange: true })
    authenticated = true
  } catch (error) {
    if (!(error instanceof GuardDenied)) throw error
  }

  if (!authenticated) redirect('/login')

  return <ChangePasswordForm />
}
