# Punk Data Contracts

The SDK has three data surfaces with different jobs.

## Choosing The Right Surface

Use `punks.dataset` for local application work: rendering previews, search,
facets, trait catalogs, palette reads, and summaries. It uses the canonical
dataset bundled with the package and does not require RPC.

Use `punks.data.contract` or `punks.data.onchain` when you need exact reads
from this repo's `PunksData.sol` deployment or loader/admin writes during a
deployment.

Use `punks.data.legacy` when you need the original Larva Labs
`CryptopunksData` SVG or CSV strings.

## Local Dataset

```ts
const ids = punks.search({
  type: 'Zombie',
  attributes: { required: ['Hoodie'] },
})

const punk = punks.get(8348, { includeTraits: true })
const palette = punks.dataset.palette({ includeSupplies: true })
const indexedPixels = punks.dataset.indexedPixels(8348)
```

## PunksData.sol

`punks.data.contract` and `punks.data.onchain` are aliases for the same
`PunksDataClient`.

```ts
const hash = await punks.data.contract.datasetHash()
const sealed = await punks.data.contract.isSealed()
const trait = await punks.data.contract.traitName(62)
const pixels = await punks.data.contract.indexedPixelsOf(8348)
const matches = await punks.data.contract.hasTraits(8348, required, forbidden, anyOf)
```

Loader writes are exposed for deployment tooling:

```ts
await punks.data.contract.loadBlobChunk('Palette', 0, paletteBytes)
await punks.data.contract.seal({
  traitCatalogHash,
  punkMaskHash,
  paletteHash,
  indexedPixelsHash,
  compressedPixelsHash,
})
```

Use the matching `prepareLoad*` and `prepareSeal` methods when another layer
will simulate, batch, or submit the transaction.

## Legacy CryptopunksData

```ts
const svg = await punks.data.legacy.punkImageSvg(8348)
const csv = await punks.data.legacy.punkAttributes(8348)
```

The legacy contract is useful for compatibility with older integrations. For
new filtering, rendering, and trait work, prefer the local dataset or
`PunksData.sol`.
