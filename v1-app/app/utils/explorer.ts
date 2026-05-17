function explorerBase(): string {
  const config = useAppConfig() as {
    evm?: { chains?: Record<string, { blockExplorer?: string }> }
  }
  const base = config.evm?.chains?.mainnet?.blockExplorer ?? 'https://evm.now'
  return base.replace(/\/$/, '')
}

export function txUrl(hash: string): string {
  return `${explorerBase()}/tx/${hash}`
}

export function addressUrl(address: string): string {
  return `${explorerBase()}/address/${address}`
}
