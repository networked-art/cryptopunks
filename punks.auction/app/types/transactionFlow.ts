import type { Hash, TransactionReceipt } from 'viem'

export interface TransactionFlowText {
  title?: Record<string, string>
  lead?: Record<string, string>
  action?: Record<string, string>
}

export interface MultiTransactionFlowStepContext {
  stepIndex: number
  hashes: Hash[]
  receipts: TransactionReceipt[]
  results: unknown[]
}

export interface MultiTransactionFlowStep {
  id: string
  title?: string
  lead?: string
  action?: string
  chain?: string | number
  request: (context: MultiTransactionFlowStepContext) => Promise<Hash>
  skip?: (
    context: MultiTransactionFlowStepContext,
  ) => boolean | Promise<boolean>
  result?: (
    receipt: TransactionReceipt,
    context: MultiTransactionFlowStepContext,
  ) => unknown | Promise<unknown>
}

export interface MultiTransactionFlowText {
  title?: Record<string, string>
  lead?: Record<string, string>
  action?: Record<string, string>
}
