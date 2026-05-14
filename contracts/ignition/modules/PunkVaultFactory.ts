import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

// The factory's constructor deploys the `PunkVault` implementation itself,
// so there's nothing to deploy separately — we read `IMPLEMENTATION` off the
// factory and surface it via `contractAt` so the address lands in the
// deployment artifact alongside the factory.
export default buildModule('PunkVaultFactory', (m) => {
  const punkVaultFactory = m.contract('PunkVaultFactory', [])
  const implementationAddress = m.staticCall(punkVaultFactory, 'IMPLEMENTATION')
  const punkVault = m.contractAt('PunkVault', implementationAddress)
  return { punkVaultFactory, punkVault }
})
