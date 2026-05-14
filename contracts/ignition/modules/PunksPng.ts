import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

import PunksDataModule from './PunksData.js'

export default buildModule('PunksPng', (m) => {
  const { punksData } = m.useModule(PunksDataModule)
  const punksPng = m.contract('PunksPng', [punksData])
  return { punksData, punksPng }
})
