import type { ContractWritePlan } from '@networked-art/punks-sdk'
import { getPublicClient, writeContract } from '@wagmi/core'
import { useConfig } from '@wagmi/vue'
import type { Hash } from 'viem'

/**
 * Executes an SDK `ContractWritePlan` with the connected wallet. The SDK owns
 * address/ABI/function/value construction; wagmi owns the wallet transport.
 */
export function useWritePlan() {
  const config = useConfig()

  async function execute(plan: ContractWritePlan): Promise<Hash> {
    const { address, abi, functionName, args, value } = plan.request
    return writeContract(config, {
      address,
      abi,
      functionName,
      args: args as readonly unknown[],
      value,
    })
  }

  function executor(plan: ContractWritePlan) {
    return () => execute(plan)
  }

  return { execute, executor, publicClient: () => getPublicClient(config) }
}
