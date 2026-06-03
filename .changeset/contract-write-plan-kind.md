---
'@networked-art/punks-sdk': minor
---

Every `ContractWritePlan` now carries a `kind` discriminator.

- New required `kind: PlanKind` field on `ContractWritePlan`, a string-literal
  union naming every prepared transaction across the canonical market, the
  auction, the vault, the stash, the C721 / legacy / V1 wrappers, and the V1
  market — so a UI can branch on the action without parsing `description`.
- `PlanKind` is exported alongside the existing action types. Plans built
  through the SDK gain the field automatically.
