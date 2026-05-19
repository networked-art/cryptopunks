function explorerBase(): string {
  return useBlockExplorer().replace(/\/$/, '')
}

export function txUrl(hash: string): string {
  return `${explorerBase()}/tx/${hash}`
}

export function addressUrl(address: string): string {
  return `${explorerBase()}/address/${address}`
}
