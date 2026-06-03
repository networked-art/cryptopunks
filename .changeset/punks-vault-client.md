---
'@networked-art/punks-sdk': minor
---

Add a `PunksVault` client so the EOA controlling a vault can drive
native-market actions on vaulted Punks without first reclaiming them.

- New `PUNKS_VAULT_FACTORY_ADDRESS` and `PUNKS_VAULT_FACTORY_START_BLOCK`
  constants for the `PunksVaultFactory` that deploys deterministic per-user
  vault clones.
- `createPunksVaultClient` / `PunksVaultClient` (and `PunksVaultFacade.at(address)`)
  prepare plans that target the vault and forward to the canonical
  `CryptoPunksMarket` (or any market passed per call): `prepareList` /
  `prepareUnlist`, `prepareTransferPunk`, `prepareAcceptBid`, and
  `prepareWithdrawFromMarket` / `prepareWithdrawFromMarketTo`.
- New `PunksVaultClientConfig` and `PunksVaultConfig` types.
