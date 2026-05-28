import { BaseMail } from '@adonisjs/mail'

export type AuthPinPayload = {
  email: string
  code: number
}

export default class AuthPinMail extends BaseMail {
  subject = 'Your punks.auction sign-in code'

  constructor(private payload: AuthPinPayload) {
    super()
  }

  prepare() {
    this.message
      .to(this.payload.email)
      .subject(this.subject)
      .htmlView('emails/auth_pin_html', this.payload)
      .textView('emails/auth_pin_text', this.payload)
  }
}
