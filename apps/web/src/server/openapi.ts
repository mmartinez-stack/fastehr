import { toJsonSchema, type JsonSchema } from '@fastehr/contracts'
import type { AnyTRPCRouter } from '@trpc/server'
import type { ProcedureAccess, ProcedureMeta } from './procedure-meta.ts'

/**
 * An OpenAPI 3.1 document for the deployed API, built from the router itself
 * (ADR 35). Nothing here is written by hand per procedure: the path, the
 * method, the input schema and the access level all come from what the
 * router already declares, so the document cannot describe an endpoint that
 * does not exist or an access level the chain does not enforce.
 *
 * tRPC over HTTP is two shapes: a query is `GET /api/trpc/<path>` with the
 * input as a URL-encoded superjson envelope in `?input=`, and a mutation is
 * `POST /api/trpc/<path>` with the envelope as the body (ADR 11). The
 * document says exactly that, which is what makes Swagger UI's "try it out"
 * produce requests the server accepts.
 *
 * Outputs are not declared by the router (the procedure parses its own
 * result through a contract), so responses are described as the envelope
 * around an unspecified value. Framework-agnostic on purpose (ADR 9).
 */

/** The parts of a tRPC procedure definition this document reads. */
interface ProcedureDef {
  type: 'query' | 'mutation' | 'subscription'
  inputs?: readonly unknown[]
  meta?: ProcedureMeta
}

const ACCESS_TEXT: Record<ProcedureAccess, string> = {
  public: 'No session. The input carries its own credential, or there is nothing to protect.',
  session: 'Any signed-in staff account.',
  clerical: 'The clerical surface: front desk and administrators.',
  staff: 'The staff-administration surface: administrators.',
  review: 'The note-review surface: the medical director.',
}

const SECURITY_SCHEME = 'sessionCookie'

function envelope(schema: JsonSchema | null): JsonSchema {
  return {
    type: 'object',
    description: 'The superjson envelope (ADR 11).',
    properties: { json: schema ?? { description: 'No input.', type: 'null' } },
    required: ['json'],
  }
}

function inputSchema(inputs: readonly unknown[]): JsonSchema | null {
  if (inputs.length === 0) return null
  if (inputs.length === 1) return toJsonSchema(inputs[0])
  return { allOf: inputs.map((input) => toJsonSchema(input)) }
}

function procedureOperation(path: string, def: ProcedureDef): JsonSchema {
  const [tag] = path.split('.')
  const access = def.meta?.access ?? 'session'
  const schema = inputSchema(def.inputs ?? [])
  const description = [
    ACCESS_TEXT[access],
    def.meta?.locationScoped === true
      ? 'The `location` input is refused (403) outside the caller\'s own locations.'
      : null,
    `Input contract: see \`packages/contracts\`. Validation failures answer 400 with codes, never messages (ADR 12).`,
  ]
    .filter((line): line is string => line !== null)
    .join(' ')

  const operation: JsonSchema = {
    operationId: path,
    tags: [tag === path ? 'root' : (tag ?? 'root')],
    summary: path,
    description,
    'x-access': access,
    security: access === 'public' ? [] : [{ [SECURITY_SCHEME]: [] }],
    responses: {
      '200': {
        description: 'The result inside the superjson envelope.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { result: { type: 'object', properties: { data: envelope({}) } } },
            },
          },
        },
      },
      '400': { $ref: '#/components/responses/ValidationFailure' },
      ...(access === 'public' ? {} : { '401': { $ref: '#/components/responses/Unauthorized' } }),
      ...(access === 'public' || access === 'session' ? {} : { '403': { $ref: '#/components/responses/Forbidden' } }),
    },
  }

  if (def.type === 'query') {
    if (schema !== null) {
      operation['parameters'] = [
        {
          name: 'input',
          in: 'query',
          required: true,
          description: 'The superjson envelope, URL-encoded: {"json": <input>}.',
          content: { 'application/json': { schema: envelope(schema) } },
        },
      ]
    }
  } else {
    operation['requestBody'] = {
      required: true,
      content: { 'application/json': { schema: envelope(schema) } },
    }
  }

  return operation
}

/** Better Auth's endpoints the app uses, described by hand: they are not tRPC. */
const AUTH_PATHS: Record<string, JsonSchema> = {
  '/api/auth/sign-in/email': {
    post: {
      operationId: 'auth.signIn',
      tags: ['auth'],
      summary: 'Sign in with email and password',
      description:
        'Sets the session cookie. Every POST to /api/auth needs an `Origin` header with this site\'s origin and `content-type: application/json`. A wrong password answers 401 INVALID_EMAIL_OR_PASSWORD.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
              required: ['email', 'password'],
            },
          },
        },
      },
      responses: { '200': { description: 'The user, and the session cookie in `Set-Cookie`.' }, '401': { description: 'Invalid email or password.' } },
    },
  },
  '/api/auth/get-session': {
    get: {
      operationId: 'auth.getSession',
      tags: ['auth'],
      summary: 'The current session and user',
      description: '`user.role` is the staff role; `user.mustChangePassword` is true while a temporary password is in force.',
      security: [{ [SECURITY_SCHEME]: [] }],
      responses: { '200': { description: 'The session and user, or `null` without a session.' } },
    },
  },
  '/api/auth/change-password': {
    post: {
      operationId: 'auth.changePassword',
      tags: ['auth'],
      summary: 'Change the password',
      description: 'Required once after a temporary password; clears `mustChangePassword`.',
      security: [{ [SECURITY_SCHEME]: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                currentPassword: { type: 'string' },
                newPassword: { type: 'string' },
                revokeOtherSessions: { type: 'boolean' },
              },
              required: ['currentPassword', 'newPassword'],
            },
          },
        },
      },
      responses: { '200': { description: 'The user; a new session token when other sessions were revoked.' }, '400': { description: 'Wrong current password or a rejected new one.' } },
    },
  },
  '/api/auth/sign-out': {
    post: {
      operationId: 'auth.signOut',
      tags: ['auth'],
      summary: 'Sign out',
      description: 'The body must be JSON, `{}` will do.',
      security: [{ [SECURITY_SCHEME]: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
      responses: { '200': { description: '`{"success": true}`; the cookie is cleared.' } },
    },
  },
}

export function buildOpenApiDocument(router: AnyTRPCRouter, options: { version?: string } = {}): JsonSchema {
  const procedures = router._def.procedures as Record<string, { _def: ProcedureDef }>
  const paths: Record<string, JsonSchema> = { ...AUTH_PATHS }
  const tags = new Set<string>(['auth'])

  for (const [path, procedure] of Object.entries(procedures)) {
    const def = procedure._def
    if (def.type === 'subscription') continue
    const operation = procedureOperation(path, def)
    for (const tag of operation['tags'] as string[]) tags.add(tag)
    paths[`/api/trpc/${path}`] = { [def.type === 'query' ? 'get' : 'post']: operation }
  }

  const errorSchema = (code: string): JsonSchema => ({
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          json: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'integer' },
              data: { type: 'object', properties: { code: { type: 'string', const: code }, httpStatus: { type: 'integer' }, path: { type: 'string' } } },
            },
          },
        },
      },
    },
  })

  return {
    openapi: '3.1.0',
    info: {
      title: 'FastEHR API',
      version: options.version ?? '0.0.0',
      description:
        'tRPC procedures over HTTP (queries are GET with `?input=`, mutations are POST) plus the authentication endpoints. Inputs and results travel in the superjson envelope `{"json": …}`. Generated from the router at request time; what is listed is what is mounted.',
    },
    servers: [{ url: '/' }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        [SECURITY_SCHEME]: {
          type: 'apiKey',
          in: 'cookie',
          name: '__Secure-better-auth.session_token',
          description: 'The session cookie set by sign-in. A browser on this origin sends it on its own.',
        },
      },
      responses: {
        Unauthorized: { description: 'No session, or an expired one.', content: { 'application/json': { schema: errorSchema('UNAUTHORIZED') } } },
        Forbidden: { description: 'The session\'s role lacks this procedure\'s surface.', content: { 'application/json': { schema: errorSchema('FORBIDDEN') } } },
        ValidationFailure: {
          description: 'Input rejected by the contract. `data.validation` carries issue codes per field, never messages (ADR 12).',
          content: { 'application/json': { schema: errorSchema('BAD_REQUEST') } },
        },
      },
    },
  }
}
