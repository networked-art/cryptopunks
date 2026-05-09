import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('PunksData', (m) => {
  const initialAdmin = m.getParameter('initialAdmin', m.getAccount(0))
  const punksData = m.contract('PunksData', [initialAdmin])
  return { punksData }
})
