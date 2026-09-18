import type { LocationSlug } from '@fastehr/contracts'
import { db, type Db } from '@fastehr/db'
import { createAuditSink, type AuditSink } from './audit-log.ts'
import { getAppBaseUrl } from './auth.ts'
import { smsTransportFromEnv, type SmsTransport } from './sms.ts'

/**
 * Request-scoped context: who is asking, and what they can ask of.
 *
 * Kept apart from the tRPC instance because the host builds this — the route
 * handler today, an RSC caller or a worker tomorrow — while the instance is
 * internal machinery. The separation is also what keeps the import graph
 * acyclic once middlewares live in their own files: everything can depend on
 * the context type without depending on `t`.
 */

/**
 * The authenticated caller, resolved by `actorFromHeaders` in ./auth.ts.
 *
 * `locations` is the set of clinics this actor may filter by. It is part of
 * the *identity*, resolved server-side — never taken from a request, and
 * never from a client-side selection (ADR 22). Since the Aug 21 sync a
 * location is a filter rather than a boundary, so every actor holds every
 * clinic (ADR 32); the shape stays so the check has one place to live.
 */
export interface Actor {
  id: string
  roles: readonly string[]
  locations: readonly LocationSlug[]
  /**
   * Set when the account holds an admin-issued temporary credential. The
   * session is real, but `requireSession` refuses to hand it out until the
   * password is changed. Optional so test fixtures stay terse; absent means
   * false.
   */
  mustChangePassword?: boolean
}

export interface Context {
  actor: Actor | null
  /**
   * Repositories, not a Prisma client. `@fastehr/db` exposes no persistence
   * types (ADR 3), so a procedure can only ask for contract-shaped
   * data — there is no `ctx.prisma` to reach past it with.
   */
  db: Db
  /**
   * Outbound text messages (the intake link). On the context for the same
   * reason `db` is: a test hands in a fake and asserts what was sent, and
   * the real transport is chosen from the environment at first use.
   */
  sms: SmsTransport
  /** The origin public links are built on — resolved lazily, like the auth env. */
  appBaseUrl: () => string
  /**
   * The PHI audit sink (ADR 35): stdout plus the audit table. On the context
   * so the tRPC middleware and the partner chain write through one seam, and
   * so a test hands in a recording sink and reads the trail back.
   */
  audit: AuditSink
}

/**
 * Request-scoped context factory. The caller — the route handler, or whatever
 * host mounts this router — is responsible for resolving the actor from its own
 * transport and passing it in.
 *
 * `db` defaults to the shared repositories and exists as a parameter for two
 * reasons. A test can pass fakes and exercise a procedure with no database, no
 * Prisma, and no environment — which is what makes the middleware chain and the
 * procedures above it cheap enough to test properly. And a caller that needs
 * several repositories inside one transaction can pass a transaction-scoped
 * `Db` built by `createDb`, rather than the router reaching for a client of its
 * own.
 */
export function createContext({
  actor,
  db: repositories = db,
  sms = smsTransportFromEnv(),
  appBaseUrl = getAppBaseUrl,
  audit = createAuditSink(repositories.audit),
}: {
  actor: Actor | null
  db?: Db
  sms?: SmsTransport
  appBaseUrl?: () => string
  audit?: AuditSink
}): Context {
  return { actor, db: repositories, sms, appBaseUrl, audit }
}
