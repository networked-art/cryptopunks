// JSON-RPC proxy. Keeps the upstream URL (and its API key) server-side so the
// browser only talks to this same-origin endpoint for reads. Wallet writes go
// straight to the connected wallet's own RPC via viem, never through here.

const ALLOWED_METHODS = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
  'net_version',
  'web3_clientVersion',
])

interface JsonRpcRequest {
  jsonrpc?: string
  id?: number | string | null
  method: string
  params?: unknown
}

function isAllowedCall(req: unknown): req is JsonRpcRequest {
  if (!req || typeof req !== 'object') return false
  const method = (req as { method?: unknown }).method
  return typeof method === 'string' && ALLOWED_METHODS.has(method)
}

export default defineEventHandler(async (event) => {
  const body = await readBody<unknown>(event)
  const calls = Array.isArray(body) ? body : [body]
  if (calls.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Empty RPC body' })
  }
  for (const call of calls) {
    if (!isAllowedCall(call)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Method not allowed',
      })
    }
  }

  const upstream = useRuntimeConfig(event).rpcUrl
  if (!upstream) {
    throw createError({
      statusCode: 500,
      statusMessage: 'RPC upstream not configured',
    })
  }

  return await $fetch(upstream, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
})
