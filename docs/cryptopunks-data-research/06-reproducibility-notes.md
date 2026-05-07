# Reproducibility Notes

Research date: 2026-05-07

Source data contract:

```text
0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2
```

RPC used for probes:

```text
https://ethereum-rpc.publicnode.com
```

## Live Samples

```sh
cast call --rpc-url https://ethereum-rpc.publicnode.com \
  0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2 \
  'punkAttributes(uint16)(string)' 0
```

Observed:

```text
"Female 2, Earring, Blonde Bob, Green Eye Shadow"
```

```sh
cast call --rpc-url https://ethereum-rpc.publicnode.com \
  0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2 \
  'punkAttributes(uint16)(string)' 8348
```

Observed:

```text
"Male 2, Buck Teeth, Mole, Big Beard, Earring, Top Hat, Cigarette, Classic Shades"
```

## Gas Probes

```sh
cast base-fee --rpc-url https://ethereum-rpc.publicnode.com
cast gas-price --rpc-url https://ethereum-rpc.publicnode.com
```

Observed:

```text
base fee: 292943721 wei
gas price: 292945171 wei
```

Representative estimates:

```sh
cast estimate --rpc-url https://ethereum-rpc.publicnode.com \
  0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2 \
  'punkAttributes(uint16)' 0

cast estimate --rpc-url https://ethereum-rpc.publicnode.com \
  0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2 \
  'punkImageSvg(uint16)' 0
```

Observed:

```text
punkAttributes(0): 40971
punkAttributes(8348): 55163
punkImage(0): 1182571
punkImage(8348): 1563692
punkImageSvg(0): 13700590
punkImageSvg(8348): exceeded a 16777216 gas RPC allowance during estimate
```

## Dataset Hash

The trait catalog hash is SHA-256 over UTF-8 lines:

```text
punkId:comma-separated-attributes\n
```

For example:

```text
0:Female 2, Earring, Blonde Bob, Green Eye Shadow\n
1:Male 1, Smile, Mohawk\n
```

Observed digest:

```text
3974413596261bb86ff67bd59c563e1a52af90491730c3bb3bb33512ba8c4259
```

## Recommended Generator Checks

A production generator should do more than produce the blobs:

- read all 10,000 source strings,
- parse the first entry as head variant,
- derive normalized type,
- derive attribute count,
- assign deterministic trait IDs from a checked-in catalog,
- produce per-Punk masks,
- produce per-trait bitmaps,
- assert `traitSupply(traitId) == popcount(bitmap(traitId))`,
  - assert every source string round-trips from decoded V2 traits,
  - write dataset and blob hashes into deployment artifacts.

## Image Metrics Hashes

The expanded visual pass read all 10,000 `punkImage(uint16)` byte arrays.

Hash over concatenated 2,304-byte `punkImage` outputs for Punk IDs 0 through
9999:

```text
db0e780ac7553b5dd6a3bb02ed2bf8106c16659e15a36797294e01e8817286bf
```

Hash over visual metric lines formatted as
`punkId:visiblePixels:visibleColorCount:sortedVisibleColors\n`:

```text
03a45587db7de6c2b56af7c05c37fdc4f0c8bede398c9360e880ccf55b058a41
```

A production generator should also assert:

- 10,000 image responses,
- each response is exactly 2,304 bytes,
- each response has 576 RGBA pixels,
- the global palette has 222 colors including transparent,
- expanding indexed pixels through the generated palette exactly recreates each
  source image,
- all color masks and color histograms agree with the expanded image.
