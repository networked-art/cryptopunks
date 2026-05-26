import type { ContractWritePlan, PlanKind } from '@networked-art/punks-sdk'

const PLAN_TITLES: Record<PlanKind, string> = {
  // Canonical CryptoPunks market
  'list-punk': 'List Punk',
  'remove-listing': 'Remove Listing',
  'buy-punk': 'Buy Punk',
  'transfer-punk': 'Transfer Punk',
  'withdraw-canonical-balance': 'Withdraw Balance',
  'bid-on-punk': 'Bid on Punk',
  'accept-punk-bid': 'Accept Bid',
  'withdraw-punk-bid': 'Withdraw Bid',

  // Auction vault
  'deposit-vault': 'Deposit Punk',
  'deploy-vault': 'Deploy Vault',
  'setup-vault': 'Set Up Vault',
  'reclaim-vault': 'Reclaim Punk',

  // Auction lots & offers
  'create-lot': 'Create Lot',
  'update-lot': 'Update Lot',
  'cancel-lot': 'Cancel Lot',
  'clear-stale-lot': 'Clear Stale Lot',
  'clear-stale-lots': 'Clear Stale Lots',
  'open-auction': 'Open Auction',
  'bid-on-auction': 'Place Bid',
  'place-offer': 'Place Offer',
  'cancel-offer': 'Cancel Offer',
  'adjust-offer': 'Adjust Offer',
  'accept-offer': 'Accept Offer',
  'accept-offer-from-lot': 'Accept Offer',
  'start-auction-from-offer': 'Start Auction',
  'create-lot-and-accept-offer': 'List & Accept Offer',
  'create-lot-and-start-auction-from-offer': 'List & Start Auction',
  'settle-auction': 'Settle Auction',
  'withdraw-auction-balance': 'Withdraw Balance',

  // Stash
  'deploy-stash': 'Deploy Stash',
  'upgrade-stash': 'Upgrade Stash',
  'fund-stash': 'Fund Stash',
  'place-stash-order': 'Place Order',
  'process-stash-order': 'Process Order',
  'process-stash-punk-bid': 'Accept Bid',
  'cancel-stash-punk-bid': 'Cancel Bid',
  'cancel-all-stash-punk-bids': 'Cancel All Bids',
  'wrap-punk-from-stash': 'Wrap Punk',
  'withdraw-stash-funds': 'Withdraw Funds',
  'withdraw-stash-erc721': 'Withdraw Tokens',
  'withdraw-stash-erc1155': 'Withdraw Tokens',
  'reclaim-punks-from-stash': 'Reclaim from Stash',
  'handle-erc721-receipt': 'Receive Token',
  'handle-erc1155-receipt': 'Receive Token',
  'handle-erc1155-batch-receipt': 'Receive Tokens',

  // C721 wrapper
  'transfer-to-stash': 'Deposit to Stash',
  'wrap-c721': 'Wrap Punk',
  'wrap-c721-batch': 'Wrap Punks',
  'unwrap-c721': 'Unwrap Punk',
  'unwrap-c721-batch': 'Unwrap Punks',
  'migrate-legacy-wraps': 'Migrate Wraps',
  'rescue-c721': 'Rescue Punk',
  'approve-c721': 'Approve Punk',
  'set-c721-approval': 'Set Approval',
  'transfer-c721': 'Transfer Punk',
  'safe-transfer-c721': 'Transfer Punk',

  // Legacy wrapper
  'register-wrapper-proxy': 'Register Proxy',
  'transfer-to-legacy-proxy': 'Transfer to Proxy',
  'mint-legacy-wrap': 'Wrap Punk',
  'burn-legacy-wrap': 'Unwrap Punk',
  'approve-legacy-wrap': 'Approve Wrapped Punk',
  'set-legacy-wrap-approval': 'Set Approval',
  'transfer-legacy-wrap': 'Transfer Wrapped Punk',
  'safe-transfer-legacy-wrap': 'Transfer Wrapped Punk',

  // V1 wrapper
  'wrap-v1': 'Wrap V1 Punk',
  'unwrap-v1': 'Unwrap V1 Punk',
  'unwrap-v1-batch': 'Unwrap V1 Punks',
  'set-v1-wrapper-approval': 'Set V1 Approval',
  'approve-v1-wrap': 'Approve V1 Punk',
  'transfer-v1-wrap': 'Transfer V1 Punk',

  // V1 market
  'buy-punk-v1': 'Buy V1 Punk',
  'place-v1-collection-bid': 'Place V1 Bid',
  'cancel-v1-bid': 'Cancel V1 Bid',
  'adjust-v1-bid': 'Adjust V1 Bid',
  'accept-v1-bid': 'Accept V1 Bid',
  'withdraw-v1-balance': 'Withdraw V1 Balance',
}

export function transactionTitleForPlan(
  plan: Pick<ContractWritePlan, 'kind'>,
): string {
  return PLAN_TITLES[plan.kind]
}
