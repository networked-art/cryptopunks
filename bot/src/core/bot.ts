import { log, formatError } from './log'
import type { StateFile } from './state'
import type { Cursor, Publisher, Renderer, Source } from './types'

export interface BotConfig<C extends Cursor, Subject> {
  source: Source<C, Subject>
  renderer: Renderer<Subject>
  publisher: Publisher
  state: StateFile
  /// State-file key the source cursor is stored under. Defaults to `cursor`;
  /// override it to run more than one bot against a single state file.
  cursorKey?: string
}

/// Runs one tick of the pipeline: read the cursor, ask the source for what's
/// new, render and publish each subject, then persist the advanced cursor. It's
/// deliberately a one-shot — a shell loop (or cron) re-invokes the process, so
/// every run starts from clean state and a crash can't wedge an in-memory loop.
export async function runOnce<C extends Cursor, Subject>(
  config: BotConfig<C, Subject>,
): Promise<void> {
  const { source, renderer, publisher, state } = config
  const cursorKey = config.cursorKey ?? 'cursor'
  const stored = state.get<C>(cursorKey)

  // First run ever: anchor to the present and stop, so a fresh deploy reacts to
  // new activity instead of replaying the entire backlog.
  if (stored === undefined) {
    const start = await source.start()
    state.set(cursorKey, start)
    log.info(`${source.name}: initialized cursor, skipping backlog`)
    return
  }

  const { subjects, cursor } = await source.pull(stored)
  if (subjects.length > 0)
    log.info(`${source.name}: ${subjects.length} new subject(s)`)

  for (const subject of subjects) {
    try {
      const post = await renderer.render(subject)
      if (post) await publisher.publish(post)
    } catch (error) {
      // Isolate per-subject failures: a bad render or a flaky tweet shouldn't
      // drop the rest of the batch or block the cursor from advancing.
      log.error(
        `${source.name}: failed to publish subject: ${formatError(error)}`,
      )
    }
  }

  state.set(cursorKey, cursor)
}
