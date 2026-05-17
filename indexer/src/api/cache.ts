// Minimal in-process TTL cache with single-flight to avoid stampedes.
// Compute is invoked at most once per key while an in-flight promise exists;
// concurrent callers await the same promise.

type Entry<T> = {
  value: T
  expiresAt: number
}

const entries = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export async function memoize<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const hit = entries.get(key) as Entry<T> | undefined
  if (hit && hit.expiresAt > now) return hit.value

  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const promise = (async () => {
    try {
      const value = await compute()
      entries.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, promise)
  return promise
}

export function invalidate(key: string): void {
  entries.delete(key)
}
