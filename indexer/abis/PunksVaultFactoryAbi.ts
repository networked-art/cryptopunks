import { parseAbi } from 'viem'

// PunksVaultFactory — deploys deterministic per-user PunksVault clones.
// `VaultDeployed(owner, vault)` fires once per user the first time the
// factory clones their vault.
export const PunksVaultFactoryAbi = parseAbi([
  'event VaultDeployed(address indexed owner, address indexed vault)',
])
