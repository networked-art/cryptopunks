import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const PUNKS_VAULT_FACTORY = '0xf3381B259B2FE142c0A87bffF463695d935D6F66'

export default buildModule('PunkVaultBatchHelper', (m) => {
  const factory = m.getParameter('punksVaultFactory', PUNKS_VAULT_FACTORY)
  const punkVaultBatchHelper = m.contract('PunkVaultBatchHelper', [factory])
  return { punkVaultBatchHelper }
})
