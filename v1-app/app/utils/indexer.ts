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
  const url = getIndexerUrl()
  if (!url) throw new IndexerNotConfigured()

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Indexer ${res.status}`)

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  if (!json.data) throw new Error('Indexer returned no data')
  return json.data
}
