import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

import PunksDataModule from './PunksData.js'

export default buildModule('PunksRenderer', (m) => {
  const { punksData } = m.useModule(PunksDataModule)
  const punksRenderer = m.contract('PunksRenderer', [punksData])
  return { punksData, punksRenderer }
})
