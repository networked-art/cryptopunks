import { getAddress, isAddress } from 'viem'

export const CRYPTOPUNKS_V1_ADDRESS =
  '0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D' as const
export const CRYPTOPUNKS_V1_START_BLOCK = 3_842_489

export const V1_WRAPPER_ADDRESS =
  '0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D' as const
export const V1_WRAPPER_START_BLOCK = 14_022_431

export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const

export const PUNKS_MARKET_ADDRESS = readAddressEnv(
  'PUNKS_MARKET_ADDRESS',
  ZERO_ADDRESS,
)

export const PUNKS_MARKET_START_BLOCK = readIntEnv(
  'PUNKS_MARKET_START_BLOCK',
  0,
)

function readAddressEnv(name: string, fallback: `0x${string}`): `0x${string}` {
  const value = process.env[name]
  if (!value) return fallback
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid address`)
  }
  return getAddress(value)
}

function readIntEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}
