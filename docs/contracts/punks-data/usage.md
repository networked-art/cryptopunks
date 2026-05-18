# PunksData Usage And Integration

This page collects common read patterns, expected custom errors, and
integration notes for consumers that use the split `PunksData` interfaces.

## Resolve Trait Ids By Name

The contract intentionally does not store a name-to-id mapping. Build one
offchain by enumerating the sealed catalog:

```ts
const traitCount = await data.read.traitCount()
const byName = new Map<string, number>()

for (let id = 0; id < traitCount; id++) {
  const name = await data.read.traitName([id])
  byName.set(name, id)
}
```

Then convert selected filters into masks:

```ts
const hoodie = byName.get('Hoodie')
if (hoodie === undefined) throw new Error('Missing Hoodie trait')
const requiredMask = 1n << BigInt(hoodie)
```

The TypeScript SDK wraps this pattern with cached catalog reads and name-based
lookup helpers. See [TypeScript SDK](/sdk) for the
offchain read/search surface.

## Match An Offer Or Filter

The `Punks` library packages trait masks, color masks, and visual-metric
ranges into one validated `Filter` type. Consumer contracts store the filter
once and call `matches` per Punk during settlement:

```solidity
import {Punks} from "@networked-art/punks-contracts/contracts/lib/Punks.sol";
import {IPunksDataMatcher}
    from "@networked-art/punks-contracts/contracts/interfaces/IPunksDataMatcher.sol";

contract MyConsumer {
    using Punks for Punks.Filter;

    IPunksDataMatcher public immutable PUNKS_DATA;

    constructor(address punksData) {
        PUNKS_DATA = IPunksDataMatcher(punksData);
    }

    function place(Punks.Filter calldata f) external {
        f.validate();           // Mirrors PunksData's canonical mask checks.
        // ...persist f wherever it belongs.
    }

    function accepts(uint16 punkId, Punks.Filter memory f) external view returns (bool) {
        return f.matches(PUNKS_DATA, punkId);
    }
}
```

`Punks.Filter` packs all four dimensions into one struct:

```solidity
struct Filter {
    uint256 requiredTraitMask;
    uint256 forbiddenTraitMask;
    uint256 anyOfTraitMask;
    uint256 requiredColorMask;
    uint256 forbiddenColorMask;
    uint256 anyOfColorMask;
    uint16  minPixelCount;
    uint16  maxPixelCount;
    uint8   minColorCount;
    uint8   maxColorCount;
}
```

Set a range's `max` to `0` to disable it; setting `max == 0` also requires
`min == 0`. `matches` short-circuits in cost order (traits → colors → pixel
range → color count range) so partial filters pay only for what they query.

`IPunksDataMatcher` bundles `IPunksDataCriteria` and `IPunksDataVisual` —
the exact subset `Punks.matches` calls into. Use it instead of the full
`IPunksData` interface when a consumer only evaluates filters.

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

| Error                | Typical cause                                             |
| -------------------- | --------------------------------------------------------- |
| `InvalidPunkId`      | Punk id is greater than `9999`                            |
| `InvalidTraitId`     | Trait id is greater than `110`                            |
| `InvalidColorId`     | Palette id is greater than `221`                          |
| `InvalidWordIndex`   | Bitmap word index is greater than `39`                    |
| `InvalidCoordinate`  | Pixel coordinate is outside `0..23`                       |
| `InvalidPixelCount`  | Pixel-count bitmap query is outside `148..332`            |
| `InvalidColorCount`  | Color-count bitmap query is outside `2..14`               |
| `InvalidMask`        | Trait or color mask contains invalid or conflicting bits  |
| `MalformedPixelBlob` | Sealed compressed pixel bytes are internally inconsistent |

## Integration Notes

Use the split interfaces when a consumer only needs part of the ABI:

- `IPunksDataCriteria` for trait predicates and catalog data.
- `IPunksDataVisual` for color and visual metric predicates.
- `IPunksDataIndexed` for decoded pixels and palette bytes.
- `IPunksDataMatcher` (= criteria + visual) for `Punks.matches` consumers.

`PunksRenderer` is the first deployed consumer of this data contract. It reads
`indexedPixelsOf`, palette bytes, trait names, scalar metrics, and masks to
produce RGBA, SVG, PNG, and metadata outputs.

The research notes behind this design are in
`contracts/docs/cryptopunks-data-research/`, especially the decisions sheet.
