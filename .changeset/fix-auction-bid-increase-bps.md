---
"@networked-art/punks-sdk": patch
---

Fix `PUNKS_AUCTION_BID_INCREASE_BPS` to `100n` (1%) to match the deployed
`PunksAuction` contract; it had incorrectly been `1_000n` (10%).
