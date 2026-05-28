import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type User from '#models/user'

export type InquiryStatusChangedPayload = {
  recipient: User
  inquiryId: number
  status: 'open' | 'contacted' | 'fulfilled' | 'cancelled'
  searchId: number
}

export default class InquiryStatusChangedMail extends BaseMail {
  subject: string

  constructor(private payload: InquiryStatusChangedPayload) {
    super()
    this.subject = `Inquiry #${payload.inquiryId}: ${payload.status}`
  }

  prepare() {
    if (!this.payload.recipient.email) return
    this.message
      .to(this.payload.recipient.email)
      .subject(this.subject)
      .htmlView('emails/inquiries/status_changed_html', {
        ...this.payload,
        publicUrl: env.get('OFFCHAIN_PUBLIC_URL'),
      })
      .textView('emails/inquiries/status_changed_text', {
        ...this.payload,
        publicUrl: env.get('OFFCHAIN_PUBLIC_URL'),
      })
  }
}
