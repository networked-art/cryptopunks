import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import logger from '@adonisjs/core/services/logger'
import { drainQueuedDeliveries } from '#services/notification_sender'

export default class NotificationDrainJob extends Job<{}> {
  static options: JobOptions = {
    name: 'notification_drain',
    queue: 'notifications',
    retry: { maxRetries: 2 },
  }

  async execute() {
    const result = await drainQueuedDeliveries()
    if (result.sent > 0 || result.failed > 0) {
      logger.info(result, 'notification drain')
    }
  }
}
