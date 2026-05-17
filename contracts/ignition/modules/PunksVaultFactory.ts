import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

// The factory's constructor deploys the `PunksVault` implementation itself,
// so there's nothing to deploy separately — we read `IMPLEMENTATION` off the
// factory and surface it via `contractAt` so the address lands in the
// deployment artifact alongside the factory.
export default buildModule('PunksVaultFactory', (m) => {
  const punksVaultFactory = m.contract('PunksVaultFactory', [])
  const implementationAddress = m.staticCall(
    punksVaultFactory,
    'IMPLEMENTATION',
  )
  const punksVault = m.contractAt('PunksVault', implementationAddress)
  return { punksVaultFactory, punksVault }
})
