/// A tiny timestamped logger. The bot runs as a one-shot process on a loop, so
/// structured logging isn't worth the dependency — just stamp each line so the
/// run-loop output is readable.

function stamp(): string {
  return new Date().toISOString()
}

export const log = {
  info: (message: string) => console.info(`[${stamp()}] ${message}`),
  warn: (message: string) => console.warn(`[${stamp()}] ${message}`),
  error: (message: string) => console.error(`[${stamp()}] ${message}`),
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
