import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

import PunksDataModule from './PunksData.js'

// CryptoPunks V1 market on Ethereum mainnet. Override per-network via Ignition parameters.
const PUNKS_V1_MARKET = '0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D'

export default buildModule('PunksMarket', (m) => {
  const { punksData } = m.useModule(PunksDataModule)
  const punksV1Market = m.getParameter('punksV1Market', PUNKS_V1_MARKET)
  const punksMarket = m.contract('PunksMarket', [
    punksV1Market,
    punksData,
  ])
  return { punksData, punksMarket }
})
