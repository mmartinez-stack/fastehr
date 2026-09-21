/**
 * One line per partner request, for the log collector: the request id, the
 * key id, the method, the route template, the status, and the duration.
 *
 * Never the query string, the body, a header value, or the concrete path
 * (a patient id lives in it). The audit trail (ADR 36) is the record; this
 * line is the correlation between it and whatever the proxy logged.
 */
export interface RequestLogLine {
  requestId: string
  keyId: string | null
  method: string
  routeTemplate: string
  status: number
  durationMs: number
}

export function logPartnerRequest(line: RequestLogLine): void {
  console.info('[partner-api]', JSON.stringify(line))
}
