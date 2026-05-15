import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

import PunksDataModule from './PunksData.js'

// Canonical mainnet CryptoPunks market. Override per-network via Ignition parameters.
const PUNKS_MARKET = '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb'

export default buildModule('PunksCollectionBids', (m) => {
  const { punksData } = m.useModule(PunksDataModule)
  const punksMarket = m.getParameter('punksMarket', PUNKS_MARKET)
  const punksCollectionBids = m.contract('PunksCollectionBids', [
    punksMarket,
    punksData,
  ])
  return { punksData, punksCollectionBids }
})
