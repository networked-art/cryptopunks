import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

import PunksDataModule from './PunksData.js'

// Canonical mainnet addresses. Override per-network via Ignition parameters.
const PUNKS_MARKET = '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb'
const LEGACY_WRAPPER = '0xb7f7f6c52f2e2fdb1963eab30438024864c313f6'
const NEW_WRAPPER = '0x000000000000003607fce1ac9e043a86675c5c2f'

export default buildModule('PunksRenderer', (m) => {
  const { punksData } = m.useModule(PunksDataModule)
  const punksMarket = m.getParameter('punksMarket', PUNKS_MARKET)
  const legacyWrapper = m.getParameter('legacyWrapper', LEGACY_WRAPPER)
  const newWrapper = m.getParameter('newWrapper', NEW_WRAPPER)
  const punksRenderer = m.contract('PunksRenderer', [
    punksData,
    punksMarket,
    legacyWrapper,
    newWrapper,
  ])
  return { punksData, punksRenderer }
})
