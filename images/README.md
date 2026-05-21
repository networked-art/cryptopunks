# @networked-art/punks-images

CryptoPunks sprite sheet and per-token image extraction.

`punks.png` is the source 2400×2400 sprite sheet — a 100×100 grid of 24×24
punks. `scripts/generate.mjs` slices it into per-token PNGs (`pnpm generate`,
output to `dist/`).

## IPFS

The generated `dist/` directory is pinned to IPFS:

```
ipfs://QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt
```

Append a path to address any file in it. Over an HTTP gateway:

```
https://ipfs.io/ipfs/QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt/lg/1234.png
```

Layout under the CID:

```
punks.png            full 2400×2400 sprite sheet
lg/<id>.png          1200×1200 punk (24×24 upscaled 50× nearest-neighbor)
sm/<id>.png          24×24 punk (native resolution)
backgrounds/lg/<name>.png    1200×1200 solid background
backgrounds/sm/<name>.png    24×24 solid background
```

## Loading a punk by token id

`<id>` is the CryptoPunks token id, `0`–`9999`, **not** zero-padded. Pick the
`lg` (1200×1200) or `sm` (24×24) variant. Punk PNGs are transparent — composite
them over a background.

```
ipfs://QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt/lg/0.png      # punk #0,    large
ipfs://QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt/sm/0.png      # punk #0,    small
ipfs://QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt/lg/3100.png   # punk #3100, large
ipfs://QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt/sm/9999.png   # punk #9999, small
```

```js
const CID = 'QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt'

// ipfs:// URI — resolve with an IPFS client or gateway
const punkUri = (id, variant = 'lg') => `ipfs://${CID}/${variant}/${id}.png`

// HTTP gateway URL
const punkUrl = (id, variant = 'lg') =>
  `https://ipfs.io/ipfs/${CID}/${variant}/${id}.png`

punkUri(1234)         // ipfs://Qm…/lg/1234.png
punkUrl(1234, 'sm')   // https://ipfs.io/ipfs/Qm…/sm/1234.png
```

## Backgrounds

Solid-color squares matching the marketplace palette. Colors are from
`PunksRenderer`; `wrapped-v1` is the `PunksV1Wrapper` background. Each is
emitted as both `sm` (24×24) and `lg` (1200×1200).

| `<name>`       | Hex        | Use                          |
| -------------- | ---------- | ---------------------------- |
| `default`      | `#638596`  | Unlisted punk                |
| `for-sale`     | `#8c5851`  | Listed for sale              |
| `bid`          | `#8970b1`  | Has an active bid            |
| `wrapped`      | `#66a670`  | Wrapped punk                 |
| `wrapped-c721` | `#75a475`  | C721-wrapped punk            |
| `wrapped-v1`   | `#a79aff`  | `PunksV1Wrapper` punk        |

```
ipfs://QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt/backgrounds/lg/for-sale.png
ipfs://QmW56Rn3q72zjLiWLFq5E8hr6HxzPtjX8VS9o4wDgTVkwt/backgrounds/sm/bid.png
```

```js
const bgUri = (name, variant = 'lg') =>
  `ipfs://${CID}/backgrounds/${variant}/${name}.png`

bgUri('for-sale')          // ipfs://Qm…/backgrounds/lg/for-sale.png
bgUri('wrapped-v1', 'sm')  // ipfs://Qm…/backgrounds/sm/wrapped-v1.png
```
