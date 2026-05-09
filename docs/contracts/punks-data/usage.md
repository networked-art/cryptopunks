# PunksData Usage And Integration

This page collects common read patterns, expected custom errors, and
integration notes for consumers that use the split `PunksData` interfaces.

## Resolve Trait Ids By Name

The contract intentionally does not store a name-to-id mapping. Build one
offchain by enumerating the sealed catalog:

```ts
const traitCount = await data.read.traitCount()
const byKindAndName = new Map<string, number>()

for (let id = 0; id < traitCount; id++) {
  const [kind, name] = await Promise.all([
    data.read.traitKind([id]),
    data.read.traitName([id]),
  ])
  byKindAndName.set(`${kind}:${name}`, id)
}
```

Then convert selected filters into masks:

```ts
const hoodie = byKindAndName.get(`${TraitKind.Accessory}:Hoodie`)
if (hoodie === undefined) throw new Error('Missing Hoodie trait')
const requiredMask = 1n << BigInt(hoodie)
```

The TypeScript SDK wraps this pattern with cached catalog reads and kind-aware
lookup helpers. See [TypeScript SDK](/contracts/punks-data/sdk) for the
offchain read/search surface.

## Match An Offer Or Filter

For contracts, store compact masks and call `hasTraits` during settlement:

```solidity
struct Criteria {
    uint256 requiredMask;
    uint256 forbiddenMask;
    uint256 anyOfMask;
}

function accepts(uint16 punkId, Criteria memory c) external view returns (bool) {
    return PUNKS_DATA.hasTraits(
        punkId,
        c.requiredMask,
        c.forbiddenMask,
        c.anyOfMask
    );
}
```

This avoids dynamic arrays of trait filters and keeps settlement gas bounded.

## Scan Bitmaps Offchain

For frontends and indexers, bitmap rows are more efficient than calling a
predicate for every Punk:

```ts
const ids: number[] = []

for (let wordIndex = 0; wordIndex < 40; wordIndex++) {
  const word = await data.read.traitBitmapWord([hoodieTraitId, wordIndex])
  for (let bit = 0; bit < 256; bit++) {
    const punkId = wordIndex * 256 + bit
    if (punkId >= 10_000) break
    if (((word >> BigInt(bit)) & 1n) === 1n) ids.push(punkId)
  }
}
```

The same pattern works for `colorBitmapWord`, `pixelCountBitmapWord`, and
`colorCountBitmapWord`.

## Render From Indexed Pixels

Renderers should read the indexed pixels and palette bytes once, then expand
locally:

```solidity
bytes memory pixels = data.indexedPixelsOf(punkId);
bytes memory palette = data.paletteRgbaBytes();

uint8 colorId = uint8(pixels[i]);
uint256 paletteOffset = uint256(colorId) * 4;
bytes1 r = palette[paletteOffset];
bytes1 g = palette[paletteOffset + 1];
bytes1 b = palette[paletteOffset + 2];
bytes1 a = palette[paletteOffset + 3];
```

`PunksRenderer` uses this exact primitive to derive RGBA, SVG, PNG-8, and
metadata outputs without storing duplicated art bytes.

## Reverts

The ABI uses custom errors instead of revert strings:

| Error | Typical cause |
| --- | --- |
| `InvalidPunkId` | Punk id is greater than `9999` |
| `InvalidTraitId` | Trait id is greater than `110` |
| `InvalidColorId` | Palette id is greater than `221` |
| `InvalidWordIndex` | Bitmap word index is greater than `39` |
| `InvalidCoordinate` | Pixel coordinate is outside `0..23` |
| `InvalidPixelCount` | Pixel-count bitmap query is outside `148..332` |
| `InvalidColorCount` | Color-count bitmap query is outside `2..14` |
| `InvalidMask` | Trait or color mask contains invalid or conflicting bits |
| `MalformedPixelBlob` | Sealed compressed pixel bytes are internally inconsistent |

## Integration Notes

Use the split interfaces when a consumer only needs part of the ABI:

- `IPunksDataCriteria` for trait predicates and catalog data.
- `IPunksDataVisual` for color and visual metric predicates.
- `IPunksDataIndexed` for decoded pixels and palette bytes.

`PunksRenderer` is the first deployed consumer of this data contract. It reads
`indexedPixelsOf`, palette bytes, trait names, scalar metrics, and masks to
produce RGBA, SVG, PNG, and metadata outputs.

The research notes behind this design are in
`contracts/docs/cryptopunks-data-research/`, especially the decisions sheet.
