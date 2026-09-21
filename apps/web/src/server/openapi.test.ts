import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from './openapi.ts'
import { appRouter } from './routers/root.ts'

type Operation = { 'x-access': string; parameters?: unknown[]; requestBody?: { content: Record<string, { schema: { properties: { json: { properties?: Record<string, unknown>; required?: string[] } } } }> }; security: unknown[]; responses: Record<string, unknown> }
type Doc = { openapi: string; paths: Record<string, Record<'get' | 'post', Operation>> }

const doc = buildOpenApiDocument(appRouter) as unknown as Doc
const trpcPaths = Object.keys(doc.paths).filter((path) => path.startsWith('/api/trpc/'))

describe('buildOpenApiDocument', () => {
  it('lists every mounted procedure and nothing else', () => {
    const mounted = Object.keys(appRouter._def.procedures).map((path) => `/api/trpc/${path}`)
    expect(trpcPaths.sort()).toEqual(mounted.sort())
    expect(doc.openapi).toBe('3.1.0')
  })

  it('maps a query to GET with the envelope in ?input and a mutation to POST with it in the body', () => {
    const search = doc.paths['/api/trpc/patient.search']?.get
    expect(search?.parameters).toHaveLength(1)
    expect(search?.requestBody).toBeUndefined()

    const send = doc.paths['/api/trpc/intake.send']?.post
    expect(send?.parameters).toBeUndefined()
    const body = send?.requestBody?.content['application/json']?.schema.properties.json
    // Only the phone is required to send (the Sep 14 decision); the names are optional.
    expect(body?.required).toEqual(['phone'])
    expect(body?.properties).toHaveProperty('firstName')
  })

  it('carries the access level the procedure chain declares, from meta, not from the path', () => {
    expect(doc.paths['/api/trpc/health']?.get['x-access']).toBe('public')
    expect(doc.paths['/api/trpc/intake.open']?.get['x-access']).toBe('public')
    expect(doc.paths['/api/trpc/patient.recent']?.get['x-access']).toBe('session')
    expect(doc.paths['/api/trpc/intake.send']?.post['x-access']).toBe('clerical')
    expect(doc.paths['/api/trpc/intake.listPending']?.get['x-access']).toBe('clerical')
    expect(doc.paths['/api/trpc/staffUsers.list']?.get['x-access']).toBe('staff')
    expect(doc.paths['/api/trpc/review.queue']?.get['x-access']).toBe('review')
  })

  it('declares no security and no 401 for a public procedure, and a 403 only where a role can lack the surface', () => {
    const health = doc.paths['/api/trpc/health']?.get
    expect(health?.security).toEqual([])
    expect(health?.parameters).toBeUndefined()
    expect(health?.responses).not.toHaveProperty('401')

    const recent = doc.paths['/api/trpc/patient.recent']?.get
    expect(recent?.responses).toHaveProperty('401')
    expect(recent?.responses).not.toHaveProperty('403')

    expect(doc.paths['/api/trpc/review.queue']?.get.responses).toHaveProperty('403')
  })

  it('includes the authentication endpoints the app uses', () => {
    expect(doc.paths).toHaveProperty('/api/auth/sign-in/email')
    expect(doc.paths).toHaveProperty('/api/auth/get-session')
    expect(doc.paths).toHaveProperty('/api/auth/change-password')
    expect(doc.paths).toHaveProperty('/api/auth/sign-out')
  })

  it('is plain JSON', () => {
    expect(() => JSON.stringify(doc)).not.toThrow()
  })
})
