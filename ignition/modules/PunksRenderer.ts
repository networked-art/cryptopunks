import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

import PunksDataModule from './PunksData.js'

// Canonical mainnet addresses. Override per-network via Ignition parameters.
const PUNKS_MARKET = '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb'
const WRAPPER = '0xb7f7f6c52f2e2fdb1963eab30438024864c313f6'
const C721_WRAPPER = '0x000000000000003607fce1ac9e043a86675c5c2f'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const REVERSE_NAME = 'renderer.punksdata.eth'

export default buildModule('PunksRenderer', (m) => {
  const { punksData } = m.useModule(PunksDataModule)
  const punksMarket = m.getParameter('punksMarket', PUNKS_MARKET)
  const wrapper = m.getParameter('wrapper', WRAPPER)
  const c721Wrapper = m.getParameter('c721Wrapper', C721_WRAPPER)
  const reverseRegistrar = m.getParameter('reverseRegistrar', ZERO_ADDRESS)
  const reverseName = m.getParameter('reverseName', REVERSE_NAME)
  const punksRenderer = m.contract('PunksRenderer', [
    punksData,
    punksMarket,
    wrapper,
    c721Wrapper,
    reverseRegistrar,
    reverseName,
  ])
  return { punksData, punksRenderer }
})
