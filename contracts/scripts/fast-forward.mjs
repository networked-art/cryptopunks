#!/usr/bin/env node

const RPC_URL = process.env.LOCALHOST_RPC_URL ?? 'http://127.0.0.1:8545'
const SECONDS_PER_MINUTE = 60n
const SECONDS_PER_HOUR = 60n * SECONDS_PER_MINUTE

function usage() {
  return [
    'Usage: pnpm fast-forward -- --hours <hours> --minutes <minutes>',
    '',
    'Examples:',
    '  pnpm fast-forward -- --hours 2',
    '  pnpm fast-forward -- --minutes 45',
    '  pnpm fast-forward -- --hours 1 --minutes 30',
    '',
    `RPC: ${RPC_URL} (override with LOCALHOST_RPC_URL)`,
  ].join('\n')
}

function readUnsignedInteger(raw, label) {
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `${label} must be a non-negative integer, received "${raw}".`,
    )
  }
  return BigInt(raw)
}

function parseArgs(args) {
  const parts = { hours: 0n, minutes: 0n }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '--') continue
    if (arg === '--help') {
      console.log(usage())
      process.exit(0)
    }

    const readValue = (label, value) => {
      if (value === undefined || value === '') {
        throw new Error(`Missing value for --${label}.`)
      }
      parts[label] = readUnsignedInteger(value, label)
    }

    if (arg === '--hours') {
      readValue('hours', args[++i])
      continue
    }
    if (arg.startsWith('--hours=')) {
      readValue('hours', arg.slice('--hours='.length))
      continue
    }
    if (arg === '--minutes') {
      readValue('minutes', args[++i])
      continue
    }
    if (arg.startsWith('--minutes=')) {
      readValue('minutes', arg.slice('--minutes='.length))
      continue
    }

    throw new Error(`Unknown argument "${arg}".\n\n${usage()}`)
  }

  return parts
}

function toQuantity(value) {
  return `0x${value.toString(16)}`
}

function fromQuantity(value) {
  return BigInt(value)
}

function formatTimestamp(value) {
  return `${value} (${new Date(Number(value) * 1000).toISOString()})`
}

async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${response.status}.`)
  }

  const body = await response.json()
  if (body.error) {
    throw new Error(
      `RPC ${method} failed: ${body.error.message ?? JSON.stringify(body.error)}`,
    )
  }
  return body.result
}

async function main() {
  const { hours, minutes } = parseArgs(process.argv.slice(2))
  const totalSeconds = hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE

  if (totalSeconds === 0n) {
    throw new Error(
      `Fast-forward duration must be greater than zero.\n\n${usage()}`,
    )
  }

  const chainId = fromQuantity(await rpc('eth_chainId'))
  if (
    chainId !== 31337n &&
    process.env.FAST_FORWARD_ALLOW_NON_LOCALHOST !== '1'
  ) {
    throw new Error(
      `Refusing to fast-forward chain ${chainId}. This helper is intended for localhost. ` +
        'Set FAST_FORWARD_ALLOW_NON_LOCALHOST=1 to override.',
    )
  }

  const before = await rpc('eth_getBlockByNumber', ['latest', false])

  await rpc('evm_increaseTime', [toQuantity(totalSeconds)])
  await rpc('evm_mine')

  const after = await rpc('eth_getBlockByNumber', ['latest', false])

  console.log(
    `Fast-forwarded ${hours}h ${minutes}m (${totalSeconds} seconds) on chain ${chainId}.`,
  )
  console.log(
    `Block ${fromQuantity(before.number)} @ ${formatTimestamp(
      fromQuantity(before.timestamp),
    )} -> ${fromQuantity(after.number)} @ ${formatTimestamp(
      fromQuantity(after.timestamp),
    )}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
