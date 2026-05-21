import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

// The auction deploys its own `PunksAuctionEscrow` in the constructor, so
// there's nothing to deploy separately — we read `ESCROW` off the auction
// and surface it via `contractAt` so the address lands in the deployment
// artifact alongside the auction. Both Punk markets, the PunksData contract,
// and the vault factory are hardcoded as immutables, so there are no
// constructor arguments.
export default buildModule('PunksAuction', (m) => {
  const punksAuction = m.contract('PunksAuction')
  const escrowAddress = m.staticCall(punksAuction, 'ESCROW')
  const punksAuctionEscrow = m.contractAt('PunksAuctionEscrow', escrowAddress)
  return { punksAuction, punksAuctionEscrow }
})
