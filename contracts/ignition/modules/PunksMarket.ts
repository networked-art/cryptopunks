import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('PunksMarket', (m) => {
  const punksMarket = m.contract('PunksMarket')
  return { punksMarket }
})
