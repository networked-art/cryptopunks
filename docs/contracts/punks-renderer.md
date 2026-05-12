# PunksRenderer

`PunksRenderer` is the first contract in this repo that renders directly from
the new `PunksData` primitive. It reads indexed pixels, palette bytes, trait
names, visual metrics, and market status to produce RGBA bytes, SVG, PNG-8, and
ERC721-style metadata.

The contract lives at `contracts/contracts/PunksRenderer.sol` and implements
`contracts/contracts/interfaces/IPunksRenderer.sol`.

## Purpose

The renderer is stateless apart from immutable dependency addresses. It does
not store art bytes. Every output is derived at call time from:

- `PunksData.indexedPixelsOf(punkId)`.
- `PunksData.paletteRgbBytes()`, `paletteAlphaBytes()`, or
  `paletteRgbaBytes()`.
- `PunksData` trait names, trait masks, attribute counts, color counts, and
  pixel counts.
- Optional CryptoPunks market and wrapper addresses for marketplace-aware
  backgrounds.

This contract currently combines the per-format renderer roles that the
research notes described as separate PNG, SVG, and metadata encoders. The
dependency direction is the same: renderer logic reads a sealed `PunksData`
deployment through public views.

## Constructor

```solidity
constructor(
    address punksData,
    address punksMarket,
    address wrapper,
    address c721Wrapper,
    address reverseRegistrar,
    string memory reverseName
)
```

Parameters:

| Parameter | Meaning |
| --- | --- |
| `punksData` | Data contract used for all pixels, palette, traits, and metrics |
| `punksMarket` | Optional CryptoPunks market used by `backgroundOf` |
| `wrapper` | Optional wrapped CryptoPunks owner address |
| `c721Wrapper` | Optional C721 wrapper owner address |
| `reverseRegistrar` | Optional ENS reverse registrar |
| `reverseName` | Optional reverse name to set during construction |

Passing the zero address for `punksMarket` disables market lookups and makes
`backgroundOf` return the default background. Passing the zero address for
`reverseRegistrar`, or an empty `reverseName`, skips ENS reverse-name setup.

The mainnet Ignition module defaults are:

| Dependency | Address |
| --- | --- |
| CryptoPunks market | `0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb` |
| Wrapped CryptoPunks | `0xb7f7f6c52f2e2fdb1963eab30438024864c313f6` |
| C721 wrapper | `0x000000000000003607fce1ac9e043a86675c5c2f` |
| ENS reverse registrar | `0xa58e81fe9b61b5c3fe2afd33cf304c454abfc7cb` |
| Reverse name | `renderer.punksdata.eth` |

## Read API

```solidity
function dataContract() external view returns (address);
function punkAttributes(uint16 punkId) external view returns (string memory);
function metadataJson(uint16 punkId) external view returns (string memory);
function tokenURI(uint256 tokenId) external view returns (string memory);

function punkImage(uint16 punkId) external view returns (bytes memory);
function punkSvg(uint16 punkId) external view returns (string memory);
function punkPng(uint16 punkId) external view returns (bytes memory);
function punkPng(uint16 punkId, bytes4 backgroundRgba) external view returns (bytes memory);

function backgroundOf(uint16 punkId) external view returns (bytes4 rgba);
function punkMarketplaceSvg(uint16 punkId) external view returns (string memory);
function punkMarketplacePng(uint16 punkId) external view returns (bytes memory);
```

Most Punk id validation is delegated to `PunksData`. `tokenURI` accepts a
`uint256` token id and reverts with `InvalidTokenId` when `tokenId >= 10000`.

## Attributes And Metadata

`punkAttributes(punkId)` returns a display CSV. It starts with the exact head
variant, then appends accessories in canonical trait-id order.

`metadataJson(punkId)` returns raw JSON with:

- `name`: `CryptoPunk <id>`.
- `description`: attribute-count summary.
- `image`: base64-encoded SVG data URI from `punkSvg`.
- `attributes`: OpenSea-style attribute objects.
- `colors`: visible palette colors used by the Punk as `#rrggbbaa` strings.

The metadata attributes include:

- `Type`.
- `Head Variant`.
- numeric `Attribute Count`.
- numeric `Color Count`.
- numeric `Pixel Count`.
- one `Accessory` entry for each accessory trait.

`tokenURI(tokenId)` wraps `metadataJson` as:

```text
data:application/json;base64,<base64-json>
```

This is ERC721-compatible, but the renderer does not claim ownership of any
Punk token contract.

## RGBA Output

`punkImage(punkId)` expands the 576-byte indexed pixel stream into raw RGBA:

```text
24 * 24 * 4 = 2304 bytes
```

It reads `indexedPixelsOf(punkId)` and `paletteRgbaBytes()` from `PunksData`,
then copies the 4-byte palette entry for each pixel.

## SVG Output

`punkSvg(punkId)` returns a 24x24 SVG with crisp edges over the default
CryptoPunks background:

```text
#638596
```

Transparent pixels are skipped. Visible pixels are compressed into horizontal
`rect` runs per row. Fully opaque palette colors are emitted as `#rrggbb`;
semi-transparent colors use `fill-opacity='.5'`.

`punkMarketplaceSvg(punkId)` uses the same SVG encoder but selects its
background through `backgroundOf`.

## PNG Output

`punkPng(punkId)` returns a PNG-8 image with:

- 24x24 IHDR.
- `PLTE` from `PunksData.paletteRgbBytes()`.
- `tRNS` from `PunksData.paletteAlphaBytes()`.
- One zlib stored-block IDAT payload containing 24 unfiltered indexed
  scanlines.
- Standard PNG CRC32 and zlib Adler-32 checksums.

The transparent PNG keeps palette id `0` transparent.

`punkPng(punkId, backgroundRgba)` returns a flattened PNG-8 image. It requires
`backgroundRgba` alpha to be `0xff`, otherwise it reverts with
`InvalidBackground`. The encoder builds a compact local palette with the
background at index `0`, remaps visible Punk colors in raster order, and omits
the `tRNS` chunk.

`punkMarketplacePng(punkId)` is the flattened PNG variant using
`backgroundOf(punkId)`.

The full 10,000-Punk mosaic PNG is not implemented in this contract. The data
contract exposes the primitives needed for that separate encoder milestone, but
`PunksRenderer` focuses on per-Punk outputs.

## Marketplace Backgrounds

`backgroundOf(punkId)` reads the optional CryptoPunks market and wrapper
addresses. Resolution order is:

1. Offered for sale.
2. Has an active bid.
3. Owned by the C721 wrapper.
4. Owned by the wrapped CryptoPunks contract.
5. Default.

Colors are RGBA bytes:

| State | Color |
| --- | --- |
| Default | `0x638596ff` |
| For sale | `0x8c5851ff` |
| Has bid | `0x8970b1ff` |
| Wrapped | `0x66a670ff` |
| C721 wrapped | `0x75a475ff` |

All marketplace backgrounds are opaque, so they are valid inputs to the
flattened PNG encoder.

## Deployment

The Ignition module at `contracts/ignition/modules/PunksRenderer.ts` deploys
`PunksData` first and then deploys `PunksRenderer` against that address.

Mainnet deployment addresses recorded in the repo:

| Contract | Address |
| --- | --- |
| `PunksData` | `0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C` |
| `PunksRenderer` | `0x0955B58e38fA8794723AC7B5Ac99d2Df67D55741` |

Use the deployment artifacts under
`contracts/ignition/deployments/chain-<chainId>/` for the current address on a
given network.

## Integration Notes

Use `dataContract()` to verify the renderer is wired to the intended
`PunksData` deployment. For canonical reads, also verify the data contract is
sealed and its `datasetHash()` matches the expected dataset commitment.

For clients that only need image bytes:

- Use `punkSvg` for compact vector display with the default background.
- Use `punkMarketplaceSvg` when a market-aware background is desired.
- Use `punkPng` for transparent PNG-8 bytes.
- Use `punkPng(punkId, rgba)` for a custom opaque background.
- Use `punkImage` when raw RGBA bytes are easier to consume offchain.

For metadata consumers, `metadataJson` returns parseable JSON directly and
`tokenURI` returns an ERC721-style base64 JSON data URI.

For TypeScript usage, see [Rendering And Metadata](/sdk/rendering).
