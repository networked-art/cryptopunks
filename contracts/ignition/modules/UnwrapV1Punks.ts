import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('UnwrapV1Punks', (m) => {
  const unwrapV1Punks = m.contract('UnwrapV1Punks')
  return { unwrapV1Punks }
})
