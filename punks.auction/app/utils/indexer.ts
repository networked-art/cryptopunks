export class IndexerNotConfigured extends Error {
  constructor() {
    super('No indexer configured')
    this.name = 'IndexerNotConfigured'
  }
}

export function getIndexerUrl(): string {
  const config = useRuntimeConfig()
  const url = (config.public.indexerUrl as string) || ''
  return url.replace(/\/$/, '')
}

export async function queryIndexer<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return queryIndexerAt(getIndexerUrl(), query, variables)
}

export async function queryIndexerAt<T>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  if (!url) throw new IndexerNotConfigured()

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Indexer ${res.status}`)

  const json = (await res.json()) as {
    data?: T
    errors?: { message: string }[]
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  if (!json.data) throw new Error('Indexer returned no data')
  return json.data
}

// Hit a REST sub-route on the indexer (e.g. `/accounts/stats`). `path` should
// start with a leading slash; query params are merged in if provided.
export async function fetchIndexer<T>(
  path: string,
  params?: Record<string, string | undefined>,
): Promise<T> {
  return fetchIndexerAt(getIndexerUrl(), path, params)
}

export async function fetchIndexerAt<T>(
  base: string,
  path: string,
  params?: Record<string, string | undefined>,
): Promise<T> {
  if (!base) throw new IndexerNotConfigured()
  const url = new URL(`${base.replace(/\/$/, '')}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Indexer ${res.status}`)
  return (await res.json()) as T
}
