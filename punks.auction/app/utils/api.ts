export class ApiNotConfigured extends Error {
  constructor() {
    super('No API configured')
    this.name = 'ApiNotConfigured'
  }
}

// Base URL of the networked.art API — the optional off-chain service behind
// features like brokerage requests and notifications. Configured via
// `networkedApiUrl` in runtimeConfig.public; empty when the app runs without
// it. Gate those features on `isApiConfigured()`.
export function getApiUrl(): string {
  const config = useRuntimeConfig()
  const url = (config.public.networkedApiUrl as string) || ''
  return url.replace(/\/$/, '')
}

// Whether the networked.art API is configured. Features that depend on it
// should hide themselves when this is false.
export function isApiConfigured(): boolean {
  return getApiUrl().length > 0
}

// POST JSON to a path on the API (e.g. `/brokerage/requests`). `path` should
// start with a leading slash. Throws on a non-2xx response.
export async function postApi<T>(path: string, body: unknown): Promise<T> {
  const base = getApiUrl()
  if (!base) throw new ApiNotConfigured()

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)

  return (await res.json()) as T
}
