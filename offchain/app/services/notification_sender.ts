import { DateTime } from 'luxon'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import NotificationDelivery from '#models/notification_delivery'
import User from '#models/user'
import SearchMatchMail from '#mailers/searches/match'
import InquiryStatusChangedMail from '#mailers/inquiries/status_changed'

const MAX_ATTEMPTS = 5
const DRAIN_BATCH = 25

/**
 * Drains queued deliveries: looks up the recipient, picks the right mailer,
 * sends, and flips status to 'sent' or 'failed' (with attempt count). Returns
 * the number of rows processed in this drain.
 */
export async function drainQueuedDeliveries(): Promise<{ sent: number; failed: number }> {
  const rows = await NotificationDelivery.query()
    .where('status', 'queued')
    .where('attemptCount', '<', MAX_ATTEMPTS)
    .orderBy('queuedAt', 'asc')
    .limit(DRAIN_BATCH)

  let sent = 0
  let failed = 0

  for (const row of rows) {
    try {
      const recipient = await User.find(row.userId)
      if (!recipient || !recipient.email || !recipient.settings.emailEnabled) {
        await db.transaction(async (trx) => {
          row.useTransaction(trx)
          row.status = 'sent'
          row.sentAt = DateTime.now()
          row.lastError = recipient ? 'channel disabled' : 'recipient missing'
          await row.save()
        })
        continue
      }

      await dispatchOne(row, recipient)

      row.status = 'sent'
      row.sentAt = DateTime.now()
      row.attemptCount += 1
      row.lastError = null
      await row.save()
      sent += 1
    } catch (err) {
      logger.error({ err, deliveryId: row.id }, 'failed to send notification delivery')
      row.attemptCount += 1
      row.lastError = (err as Error).message
      if (row.attemptCount >= MAX_ATTEMPTS) {
        row.status = 'failed'
        row.failedAt = DateTime.now()
      }
      await row.save()
      failed += 1
    }
  }

  return { sent, failed }
}

async function dispatchOne(row: NotificationDelivery, recipient: User) {
  switch (row.type) {
    case 'search_match': {
      const p = row.payload as {
        searchName: string
        punkId: number
        source: string
        kind: string
        listingWei: string | null
        weiAmount: string | null
        txHash: string
      }
      await mail.send(
        new SearchMatchMail({
          recipient,
          searchName: p.searchName,
          punkId: p.punkId,
          source: p.source,
          kind: p.kind,
          listingWei: p.listingWei,
          weiAmount: p.weiAmount,
          txHash: p.txHash,
        })
      )
      return
    }
    case 'inquiry_status_changed': {
      const p = row.payload as {
        inquiryId: number
        status: 'open' | 'contacted' | 'fulfilled' | 'cancelled'
        searchId: number
      }
      await mail.send(
        new InquiryStatusChangedMail({
          recipient,
          inquiryId: p.inquiryId,
          status: p.status,
          searchId: p.searchId,
        })
      )
      return
    }
    default:
      throw new Error(`Unknown delivery type: ${row.type}`)
  }
}
