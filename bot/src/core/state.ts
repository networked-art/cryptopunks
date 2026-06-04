import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/// A small JSON file used as the bot's only durable state. It holds whatever
/// keys callers put in it — currently just the source cursor — so a single file
/// survives restarts and deploys (it's the volume mounted into the container).
export class StateFile {
  private cache: Record<string, unknown> | null = null

  constructor(private readonly path: string) {}

  get<T>(key: string): T | undefined {
    return this.read()[key] as T | undefined
  }

  set<T>(key: string, value: T): void {
    const state = this.read()
    state[key] = value
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(state, null, 2))
  }

  private read(): Record<string, unknown> {
    if (this.cache) return this.cache
    try {
      this.cache = existsSync(this.path)
        ? (JSON.parse(readFileSync(this.path, 'utf8')) as Record<
            string,
            unknown
          >)
        : {}
    } catch {
      this.cache = {}
    }
    return this.cache
  }
}
