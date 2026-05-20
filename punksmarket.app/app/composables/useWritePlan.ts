import type { ContractWritePlan } from '@networked-art/punks-sdk'
import { writeContract, getPublicClient } from '@wagmi/core'
import { useConfig } from '@wagmi/vue'
import type { Hash } from 'viem'

/**
 * Executes a `ContractWritePlan` from the SDK against the connected wallet via
 * wagmi `writeContract`. The plan already carries address/abi/args/value, so we
 * just forward it. Returns the tx hash.
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
