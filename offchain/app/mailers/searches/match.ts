import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type User from '#models/user'

export type SearchMatchPayload = {
  recipient: User
  searchName: string
  punkId: number
  source: string
  kind: string
  listingWei: string | null
  weiAmount: string | null
  txHash: string
}

export default class SearchMatchMail extends BaseMail {
  subject: string

  constructor(private payload: SearchMatchPayload) {
    super()
    this.subject = `Match: punk #${payload.punkId} (${payload.searchName})`
  }

  prepare() {
    if (!this.payload.recipient.email) return
    this.message
      .to(this.payload.recipient.email)
      .subject(this.subject)
      .htmlView('emails/searches/match_html', {
        ...this.payload,
        publicUrl: env.get('OFFCHAIN_PUBLIC_URL'),
      })
      .textView('emails/searches/match_text', {
        ...this.payload,
        publicUrl: env.get('OFFCHAIN_PUBLIC_URL'),
      })
  }
}
