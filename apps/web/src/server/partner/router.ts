import { PARTNER_OPERATIONS, type PartnerOperations } from '@fastehr/contracts'
import { PartnerApiError } from './errors.ts'

/**
 * Matches a method and path to a registry entry (ADR 38). The registry's
 * `path` is an OpenAPI template; a `{name}` segment matches one path
 * segment and lands in `params` under that name, still a string, for the
 * chain to validate through the operation's `params` schema.
 */
export interface RouteMatch {
  operation: PartnerOperations[number]
  params: Record<string, string>
}

interface CompiledRoute {
  operation: PartnerOperations[number]
  pattern: RegExp
  names: string[]
}

function compile(operation: PartnerOperations[number]): CompiledRoute {
  const names: string[] = []
  const source = operation.path
    .split('/')
    .map((segment) => {
      const match = /^\{([^}]+)\}$/.exec(segment)
      if (match?.[1] === undefined) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      names.push(match[1])
      return '([^/]+)'
    })
    .join('/')
  return { operation, pattern: new RegExp(`^${source}$`), names }
}

const ROUTES: readonly CompiledRoute[] = PARTNER_OPERATIONS.map(compile)

/** A match, or the error to answer with: 404 for an unknown path, 405 (with `Allow`) for a known path and the wrong verb. */
export function matchRoute(method: string, path: string): RouteMatch | PartnerApiError {
  const allowed: string[] = []
  for (const route of ROUTES) {
    const match = route.pattern.exec(path)
    if (match === null) continue
    allowed.push(route.operation.method)
    if (route.operation.method !== method) continue
    const params: Record<string, string> = {}
    route.names.forEach((name, index) => {
      const value = match[index + 1]
      if (value !== undefined) {
        try {
          params[name] = decodeURIComponent(value)
        } catch {
          params[name] = value
        }
      }
    })
    return { operation: route.operation, params }
  }
  if (allowed.length === 0) return new PartnerApiError('not_found')
  return new PartnerApiError('method_not_allowed', { allow: [...new Set(allowed)] })
}
