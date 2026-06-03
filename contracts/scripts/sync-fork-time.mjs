#!/usr/bin/env node

const RPC_URL = process.env.LOCALHOST_RPC_URL ?? 'http://127.0.0.1:8545'

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

async function setAutomine(enabled) {
  await rpc('evm_setAutomine', [enabled])
}

async function main() {
  const chainId = fromQuantity(await rpc('eth_chainId'))
  if (
    chainId !== 31337n &&
    process.env.SYNC_FORK_TIME_ALLOW_NON_LOCALHOST !== '1'
  ) {
    throw new Error(
      `Refusing to sync chain ${chainId}. This helper is intended for localhost. ` +
        'Set SYNC_FORK_TIME_ALLOW_NON_LOCALHOST=1 to override.',
    )
  }

  const before = await rpc('eth_getBlockByNumber', ['latest', false])
  const beforeTimestamp = fromQuantity(before.timestamp)
  const targetTimestamp = BigInt(Math.floor(Date.now() / 1000))

  let shouldRestoreAutomine = false
  try {
    if (targetTimestamp > beforeTimestamp) {
      await setAutomine(false)
      shouldRestoreAutomine = true
      await rpc('evm_setNextBlockTimestamp', [toQuantity(targetTimestamp)])
      await rpc('evm_mine')
    }

    await setAutomine(true)
    shouldRestoreAutomine = false
  } finally {
    if (shouldRestoreAutomine) {
      await setAutomine(true).catch(() => {})
    }
  }

  const after = await rpc('eth_getBlockByNumber', ['latest', false])
  const afterTimestamp = fromQuantity(after.timestamp)

  if (targetTimestamp > beforeTimestamp) {
    console.log(
      `Synced localhost chain time on chain ${chainId}: ` +
        `block ${fromQuantity(before.number)} @ ${formatTimestamp(
          beforeTimestamp,
        )} -> block ${fromQuantity(after.number)} @ ${formatTimestamp(
          afterTimestamp,
        )}.`,
    )
  } else {
    console.log(
      `Localhost chain time already at ${formatTimestamp(
        beforeTimestamp,
      )} on chain ${chainId}.`,
    )
  }
  console.log('Automine enabled.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
