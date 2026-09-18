import { smsEnvSchema, type SmsEnv } from '@fastehr/contracts'

/**
 * Outbound text messages — today, only the intake link (DIA-72).
 *
 * Two transports behind one interface. **Twilio**, through its REST API
 * directly rather than the SDK (one POST with basic auth; a dependency for
 * that would be a dependency for nothing), when the three `TWILIO_*`
 * variables are set. **Console** otherwise: the message is printed to the
 * server log, which is how development and the credential-less dev
 * environment work — the developer copies the link out of the terminal. The
 * choice is made from the environment at first use, not at import, for the
 * same reason the auth instance is lazy (ADR 24): a build must not need
 * messaging credentials.
 *
 * Framework-agnostic on purpose (ADR 9): `fetch` and `console`, nothing from
 * Next.
 */
/**
 * Whether the message reached a carrier. `logged` is the console transport:
 * nothing was sent, and a caller may need to hand the content over some
 * other way (the intake link is shown to the front desk in that case).
 */
export type SmsOutcome = 'delivered' | 'logged'

export interface SmsTransport {
  /** `to` is ten bare digits, as the contract normalizes phone numbers. */
  send(message: { to: string; body: string }): Promise<SmsOutcome>
}

/** The subset of the environment the transport reads — structural, so a test can pass a literal. */
type SmsProcessEnv = Record<string, string | undefined>

function requireSmsEnv(env: SmsProcessEnv): SmsEnv {
  const parsed = smsEnvSchema.safeParse({
    TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: env.TWILIO_FROM_NUMBER,
  })
  if (!parsed.success) {
    throw new Error(`SMS configuration: ${parsed.error.issues[0]?.message ?? 'invalid'}. See .env.example.`)
  }
  return parsed.data
}

/** The log line names the recipient by its last four digits only. */
function maskPhone(to: string): string {
  return `+1 (***) ***-${to.slice(-4)}`
}

export const consoleSmsTransport: SmsTransport = {
  async send({ to, body }) {
    console.info(`[sms] console transport (no TWILIO_* configured) → ${maskPhone(to)}\n${body}`)
    return 'logged'
  },
}

export function twilioSmsTransport(config: {
  accountSid: string
  authToken: string
  from: string
  fetch?: typeof fetch
}): SmsTransport {
  const doFetch = config.fetch ?? fetch
  return {
    async send({ to, body }) {
      const response = await doFetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: `+1${to}`, From: config.from, Body: body }),
        },
      )
      if (!response.ok) {
        // The status is enough to act on; the response body can quote the
        // number and the message, and neither belongs in a log.
        throw new Error(`Twilio refused the message: HTTP ${response.status}`)
      }
      return 'delivered'
    },
  }
}

/** The transport the environment selects, memoized after the first send. */
export function smsTransportFromEnv(env: SmsProcessEnv = process.env): SmsTransport {
  let transport: SmsTransport | undefined
  return {
    async send(message) {
      if (transport === undefined) {
        const sms = requireSmsEnv(env)
        transport =
          sms.TWILIO_ACCOUNT_SID !== undefined &&
          sms.TWILIO_AUTH_TOKEN !== undefined &&
          sms.TWILIO_FROM_NUMBER !== undefined
            ? twilioSmsTransport({
                accountSid: sms.TWILIO_ACCOUNT_SID,
                authToken: sms.TWILIO_AUTH_TOKEN,
                from: sms.TWILIO_FROM_NUMBER,
              })
            : consoleSmsTransport
      }
      return transport.send(message)
    },
  }
}
