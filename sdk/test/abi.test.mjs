import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { punksAuctionAbi } from '../dist/index.js'

describe('ABI exports', () => {
  it('keeps the PunksAuction ABI in parity with the deployed artifact', () => {
    const artifact = JSON.parse(
      readFileSync(
        '../contracts/ignition/deployments/chain-1/artifacts/PunksAuction#PunksAuction.json',
        'utf8',
      ),
    )

    const expected = normalizeAbi(artifact.abi)
    const actual = normalizeAbi(punksAuctionAbi)
    const expectedByKey = new Map(
      expected.map((entry) => [abiKey(entry), entry]),
    )
    const actualByKey = new Map(actual.map((entry) => [abiKey(entry), entry]))

    assert.deepEqual(
      [...expectedByKey.keys()].filter((key) => !actualByKey.has(key)).sort(),
      [],
      'SDK ABI is missing deployed PunksAuction entries',
    )
    assert.deepEqual(
      [...actualByKey.keys()].filter((key) => !expectedByKey.has(key)).sort(),
      [],
      'SDK ABI contains PunksAuction entries absent from the deployed artifact',
    )

    const changed = [...expectedByKey.keys()]
      .filter((key) => {
        if (!actualByKey.has(key)) return false
        return (
          JSON.stringify(expectedByKey.get(key)) !==
          JSON.stringify(actualByKey.get(key))
        )
      })
      .sort()

    assert.deepEqual(
      changed,
      [],
      'SDK ABI entries differ from deployed artifact',
    )
  })
})

function normalizeAbi(abi) {
  return abi
    .filter((entry) => ['function', 'event', 'error'].includes(entry.type))
    .map(normalizeEntry)
    .sort((a, b) => abiKey(a).localeCompare(abiKey(b)))
}

function normalizeEntry(entry) {
  const normalized = {
    type: entry.type,
    name: entry.name,
    inputs: (entry.inputs ?? []).map(normalizeParam),
  }
  if (entry.type === 'function') {
    normalized.stateMutability = entry.stateMutability
    normalized.outputs = (entry.outputs ?? []).map(normalizeParam)
  }
  if (entry.type === 'event') normalized.anonymous = entry.anonymous === true
  return normalized
}

function normalizeParam(param) {
  const normalized = { type: param.type }
  if (param.indexed === true) normalized.indexed = true
  if (param.components)
    normalized.components = param.components.map(normalizeParam)
  return normalized
}

function abiKey(entry) {
  return `${entry.type}:${entry.name}(${entry.inputs.map(paramKey).join(',')})`
}

function paramKey(param) {
  const components = param.components
    ? `(${param.components.map(paramKey).join(',')})`
    : ''
  return `${param.indexed ? 'indexed ' : ''}${param.type}${components}`
}
