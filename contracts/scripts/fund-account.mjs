#!/usr/bin/env node

import { formatEther, getAddress, isAddress, parseEther } from 'viem'

const RPC_URL = process.env.LOCALHOST_RPC_URL ?? 'http://127.0.0.1:8545'
const DEFAULT_ETH = '200'

function usage() {
  return [
    'Usage: pnpm fund:account -- <account> [--eth <amount>]',
    '',
    'Examples:',
    '  pnpm fund:account -- 0xabc0000000000000000000000000000000000123',
    '  pnpm fund:account -- 0xabc0000000000000000000000000000000000123 --eth 25',
    '  FUND_ACCOUNT=0xabc0000000000000000000000000000000000123 FUND_ACCOUNT_ETH=25 pnpm fund:account',
    '',
    `RPC: ${redactRpcUrl(RPC_URL)} (override with LOCALHOST_RPC_URL)`,
  ].join('\n')
}

function parseArgs(args) {
  let accountArg
  let ethArg

  const readValue = (label, value) => {
    if (value === undefined || value === '') {
      throw new Error(`Missing value for --${label}.`)
    }
    return value
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '--') continue
    if (arg === '--help') {
      console.log(usage())
      process.exit(0)
    }

    if (arg === '--eth') {
      ethArg = readValue('eth', args[++i])
      continue
    }
    if (arg.startsWith('--eth=')) {
      ethArg = readValue('eth', arg.slice('--eth='.length))
      continue
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument "${arg}".\n\n${usage()}`)
    }

    if (accountArg !== undefined) {
      throw new Error(`Unexpected extra account "${arg}".\n\n${usage()}`)
    }
    accountArg = arg
  }

  const account = accountArg ?? process.env.FUND_ACCOUNT
  if (account === undefined || account === '') {
    throw new Error(`Missing account.\n\n${usage()}`)
  }

  return {
    account: normalizeAddress(account),
    amountWei: parseEthAmount(
      ethArg ?? process.env.FUND_ACCOUNT_ETH ?? DEFAULT_ETH,
    ),
  }
}

function normalizeAddress(raw) {
  if (!isAddress(raw)) {
    throw new Error(`Invalid account address "${raw}".`)
  }
  return getAddress(raw)
}

function parseEthAmount(raw) {
  if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(raw)) {
    throw new Error(`ETH amount must be a positive decimal, received "${raw}".`)
  }

  const amount = parseEther(raw)
  if (amount <= 0n) {
    throw new Error('ETH amount must be greater than zero.')
  }
  return amount
}

function toQuantity(value) {
  return `0x${value.toString(16)}`
}

function fromQuantity(value) {
  return BigInt(value)
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

function redactRpcUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.username !== '') parsed.username = '...'
    if (parsed.password !== '') parsed.password = '...'
    return parsed.toString()
  } catch {
    return '<custom rpc>'
  }
}

async function main() {
  const { account, amountWei } = parseArgs(process.argv.slice(2))

  const chainId = fromQuantity(await rpc('eth_chainId'))
  if (
    chainId !== 31337n &&
    process.env.FUND_ACCOUNT_ALLOW_NON_LOCALHOST !== '1'
  ) {
    throw new Error(
      `Refusing to fund chain ${chainId}. This helper is intended for localhost. ` +
        'Set FUND_ACCOUNT_ALLOW_NON_LOCALHOST=1 to override.',
    )
  }

  const before = fromQuantity(await rpc('eth_getBalance', [account, 'latest']))
  await rpc('hardhat_setBalance', [account, toQuantity(amountWei)])
  // `hardhat_setBalance` doesn't advance the chain head, so wallets and
  // wagmi's `useBalance` (keyed by block number) won't refetch. Mine an
  // empty block to tick listeners and surface the new balance.
  await rpc('hardhat_mine', ['0x1'])
  const after = fromQuantity(await rpc('eth_getBalance', [account, 'latest']))

  console.log(`Set ${account} balance on chain ${chainId}.`)
  console.log(`${formatEther(before)} ETH -> ${formatEther(after)} ETH`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
