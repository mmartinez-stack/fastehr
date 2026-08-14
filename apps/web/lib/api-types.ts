/**
 * Type-only surface of the tRPC router.
 *
 * This is the seam a client consumes: a browser tRPC client today, and — if the
 * server layer is ever extracted to its own process — a non-web client such as
 * Electron. The import is erased at compile time, so neither the tRPC runtime
 * nor Prisma is pulled into the client bundle.
 */
export type { AppRouter } from '@server'
