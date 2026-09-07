import { afterEach, describe, expect, it, vi } from 'vitest'
import { consoleSmsTransport, smsTransportFromEnv, twilioSmsTransport } from './sms.ts'

describe('the console transport', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prints the body and only the last four digits of the number', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await consoleSmsTransport.send({ to: '9515550000', body: 'Hi Ada, your link: https://x/intake/abc' })

    const line = String(info.mock.calls[0]?.[0])
    expect(line).toContain('https://x/intake/abc')
    expect(line).toContain('***-0000')
    expect(line).not.toContain('9515550000')
  })
})

describe('the Twilio transport', () => {
  it('posts the message to the account with basic auth, in E.164', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }))
    const transport = twilioSmsTransport({
      accountSid: 'ACxxx',
      authToken: 'secret',
      from: '+19515559999',
      fetch: fetchMock as unknown as typeof fetch,
    })

    await transport.send({ to: '9515550000', body: 'hello' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('ACxxx:secret').toString('base64')}`,
    )
    expect(String(init.body)).toBe('To=%2B19515550000&From=%2B19515559999&Body=hello')
  })

  it('fails by status only — never by echoing the response body', async () => {
    const transport = twilioSmsTransport({
      accountSid: 'ACxxx',
      authToken: 'secret',
      from: '+19515559999',
      fetch: (async () => new Response('{"message":"bad number +19515550000"}', { status: 400 })) as typeof fetch,
    })

    await expect(transport.send({ to: '9515550000', body: 'hello' })).rejects.toThrow('HTTP 400')
    await expect(transport.send({ to: '9515550000', body: 'hello' })).rejects.not.toThrow('9515550000')
  })
})

describe('choosing from the environment', () => {
  afterEach(() => vi.restoreAllMocks())

  it('falls back to the console when no Twilio variable is set', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await smsTransportFromEnv({}).send({ to: '9515550000', body: 'x' })

    expect(info).toHaveBeenCalled()
  })

  it('refuses a partial Twilio configuration by name instead of silently using the console', async () => {
    const transport = smsTransportFromEnv({ TWILIO_ACCOUNT_SID: 'ACxxx' })

    await expect(transport.send({ to: '9515550000', body: 'x' })).rejects.toThrow('TWILIO_AUTH_TOKEN')
  })
})
