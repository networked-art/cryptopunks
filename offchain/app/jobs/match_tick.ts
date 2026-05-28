import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import logger from '@adonisjs/core/services/logger'
import { runMatcherTick } from '#services/match_engine'

export default class MatchTickJob extends Job<{}> {
  static options: JobOptions = {
    name: 'match_tick',
    queue: 'matcher',
    retry: { maxRetries: 2 },
  }

  async execute() {
    const result = await runMatcherTick({})
    if (result.scannedEvents > 0 || result.matches > 0) {
      logger.info(result, 'matcher tick')
    }
  }
}
