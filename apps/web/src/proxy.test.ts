import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { config, proxy } from './proxy.ts'

const SESSION_COOKIE = 'better-auth.session_token=abc123'

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie === undefined ? {} : { cookie },
  })
}

describe('proxy', () => {
  it('redirects an anonymous request to /login carrying the asked-for path', () => {
    const response = proxy(request('/patients/new?tab=contact'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/patients/new?tab=contact')
  })

  it('omits `next` for the root path, which forwards to /queues on its own', () => {
    const response = proxy(request('/'))

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.has('next')).toBe(false)
  })

  it('passes a request that carries a session cookie', () => {
    const response = proxy(request('/queues', SESSION_COOKIE))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('recognises the Secure-prefixed cookie an https deployment sets', () => {
    const response = proxy(request('/queues', `__Secure-${SESSION_COOKIE}`))

    expect(response.status).toBe(200)
  })

  /**
   * The matcher is a static string Next parses at build time; this pins the
   * paths it must and must not cover, so an edit that accidentally starts
   * redirecting the auth mount or the smoke probe fails here first.
   */
  describe('matcher', () => {
    const pattern = new RegExp(`^${config.matcher[0] ?? ''}$`)
    const covered = (path: string) => pattern.test(path)

    it.each(['/queues', '/patients/new', '/users', '/change-password'])('covers %s', (path) => {
      expect(covered(path)).toBe(true)
    })

    it.each(['/login', '/api/auth/sign-in/email', '/api/trpc/patient.list', '/_smoke', '/favicon.ico'])(
      'leaves %s alone',
      (path) => {
        expect(covered(path)).toBe(false)
      },
    )
  })
})
