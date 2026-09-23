/**
 * What a procedure declares about who may call it, carried as tRPC meta so
 * that the OpenAPI document (`openapi.ts`, ADR 35) can say it without
 * re-deriving it from the middleware chain. Set once per base procedure in
 * `trpc.ts` and `procedures.ts`; a router never sets it by hand, so the
 * document cannot claim an access level the chain does not enforce.
 */
export type ProcedureAccess =
  /** No session: the input carries its own credential, or there is nothing to protect. */
  | 'public'
  /** Any signed-in staff account. */
  | 'session'
  /** The clerical surface (front desk and administrators). */
  | 'clerical'
  /** The staff-administration surface (administrators). */
  | 'staff'
  /** The note-review surface (the medical director). */
  | 'review'
  /** The partner account's own page: its integration and keys (ADR 36 as amended). */
  | 'integration'

export interface ProcedureMeta {
  access: ProcedureAccess
  /** The input carries a location filter, refused outside the actor's locations (ADR 32). */
  locationScoped?: boolean
}
