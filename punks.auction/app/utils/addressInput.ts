import { getPublicClient, type Config } from '@wagmi/core'
import { isAddress, type Address } from 'viem'
import { normalize } from 'viem/ens'

interface ResolveAddressInputOptions {
  invalidMessage?: string
  unavailableMessage?: string
  unresolvedMessage?: (value: string) => string
}

export function addressInputError(
  message: string,
): Error & { shortMessage: string } {
  const error = new Error(message) as Error & { shortMessage: string }
  error.shortMessage = message
  return error
}

export async function resolveAddressInput(
  config: Config,
  value: string,
  options: ResolveAddressInputOptions = {},
): Promise<Address> {
  const input = value.trim()
  if (isAddress(input)) return input as Address
  if (!input || !input.includes('.')) {
    throw addressInputError(
      options.invalidMessage ?? 'Enter a valid address or ENS name.',
    )
  }

  const publicClient = getPublicClient(config, { chainId: 1 })
  if (!publicClient) {
    throw addressInputError(
      options.unavailableMessage ?? 'ENS resolution is unavailable.',
    )
  }

  let name: string
  try {
    name = normalize(input)
  } catch {
    throw addressInputError(
      options.invalidMessage ?? 'Enter a valid address or ENS name.',
    )
  }

  const resolved = await publicClient.getEnsAddress({ name })
  if (!resolved || !isAddress(resolved)) {
    throw addressInputError(
      options.unresolvedMessage?.(input) ?? `Could not resolve ${input}.`,
    )
  }

  return resolved as Address
}
