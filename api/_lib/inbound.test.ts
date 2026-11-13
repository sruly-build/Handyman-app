import { describe, expect, it } from 'vitest'
import { parseGoogleVoice, parseInbound, ruleVerdict } from './inbound.js'

const gvText = `Hi, the kitchen sink at 12 Oak St apt B is clogged again
Thanks, Tina

To respond to this text message, reply to this email or visit Google Voice.
YOUR ACCOUNT <https://voice.google.com> HELP CENTER <https://support.google.com/voice#topic=1707989>`

describe('inbound texts', () => {
  it('reads a Postmark email from Google Voice', () => {
    const mail = parseInbound({
      From: '"(732) 555-0101" <17325550101.17325559999.Ab3dEf@txt.voice.google.com>',
      Subject: 'New text message from (732) 555-0101',
      TextBody: gvText,
      Attachments: [{ Name: 'photo.jpg', ContentType: 'image/jpeg', Content: 'AAAA' }],
    })
    const { phone, message } = parseGoogleVoice(mail)
    expect(phone).toBe('7325550101')
    expect(message).toBe('Hi, the kitchen sink at 12 Oak St apt B is clogged again\nThanks, Tina')
    expect(mail.attachments).toHaveLength(1)
  })
  it('reads a CloudMailin email and the phone from the subject', () => {
    const mail = parseInbound({
      envelope: { from: 'voice-noreply@google.com' },
      headers: { subject: 'New text message from +1 (848) 555-0177', from: 'Google Voice <voice-noreply@google.com>' },
      plain: 'No heat in the basement apartment!!\n\nTo respond to this text message, reply to this email',
      attachments: [],
    })
    expect(parseGoogleVoice(mail)).toEqual({ phone: '8485550177', message: 'No heat in the basement apartment!!' })
  })
  it('without AI: skips short replies, keeps the rest, spots emergencies', () => {
    expect(ruleVerdict('Thanks!').is_request).toBe(false)
    expect(ruleVerdict('running late').is_request).toBe(false)
    expect(ruleVerdict('The bathroom door handle fell off').is_request).toBe(true)
    expect(ruleVerdict('Water is leaking from the ceiling a lot').urgency).toBe('emergency')
    expect(ruleVerdict('אין חימום').language).toBe('he')
  })
})
