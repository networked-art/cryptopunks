# Numerical Checks

This page is a sanity pass on the totals reported in the seven research
notes. I have not re-crawled the source contract; I am only checking that
the numbers reported in the research are internally consistent.

All checks below pass.

## Attribute Totals

`01-current-contract-findings.md` lines 41–50 and `05-trait-catalog.md` lines
40–51 give the attribute count distribution (excluding head variant):

| Attributes | Punks |
| ---: | ---: |
| 0 | 8 |
| 1 | 333 |
| 2 | 3,560 |
| 3 | 4,501 |
| 4 | 1,420 |
| 5 | 166 |
| 6 | 11 |
| 7 | 1 |

Sum: 8 + 333 + 3,560 + 4,501 + 1,420 + 166 + 11 + 1 = **10,000.** ✓

## Normalized Type Totals

`01-current-contract-findings.md` lines 36–40 and
`05-trait-catalog.md` lines 28–37:

| Type | Count |
| ---: | ---: |
| Alien | 9 |
| Ape | 24 |
| Zombie | 88 |
| Female | 3,840 |
| Male | 6,039 |

Sum: 9 + 24 + 88 + 3,840 + 6,039 = **10,000.** ✓

## Head Variant Totals

`05-trait-catalog.md` lines 12–25:

| Variant | Count |
| ---: | ---: |
| Alien | 9 |
| Ape | 24 |
| Female 1 | 1,101 |
| Female 2 | 1,174 |
| Female 3 | 1,145 |
| Female 4 | 420 |
| Male 1 | 1,723 |
| Male 2 | 1,857 |
| Male 3 | 1,861 |
| Male 4 | 598 |
| Zombie | 88 |

Sum: 9 + 24 + 1,101 + 1,174 + 1,145 + 420 + 1,723 + 1,857 + 1,861 + 598 + 88 =
**10,000.** ✓

Female sub-variants: 1,101 + 1,174 + 1,145 + 420 = 3,840. Matches normalized
Female. ✓

Male sub-variants: 1,723 + 1,857 + 1,861 + 598 = 6,039. Matches normalized
Male. ✓

## Accessory Count Sum

The accessory list in `05-trait-catalog.md` has 87 lines (Beanie through
Earring). Multiplying each accessory count by 1 and summing should equal the
total number of accessory placements across all Punks, which is also:

```text
sum_over_punks( attributeCount )
= 0×8 + 1×333 + 2×3,560 + 3×4,501 + 4×1,420 + 5×166 + 6×11 + 7×1
= 0 + 333 + 7,120 + 13,503 + 5,680 + 830 + 66 + 7
= 27,539
```

Independently summing the per-accessory counts in
`05-trait-catalog.md` (Beanie 44, Choker 48, Pilot Helmet 54, ..., Earring
2,459):

| Tier | Trait | Count |
| --- | --- | ---: |
| | Beanie | 44 |
| | Choker | 48 |
| | Pilot Helmet | 54 |
| | Tiara | 55 |
| | Orange Side | 68 |
| | Buck Teeth | 78 |
| | Welding Goggles | 86 |
| | Pigtails | 94 |
| | Pink With Hat | 95 |
| | Top Hat | 115 |
| | Spots | 124 |
| | Rosy Cheeks | 128 |
| | Blonde Short | 129 |
| | Wild White Hair | 136 |
| | Cowboy Hat | 142 |
| | Straight Hair Blonde | 144 |
| | Wild Blonde | 144 |
| | Big Beard | 146 |
| | Blonde Bob | 147 |
| | Half Shaved | 147 |
| | Red Mohawk | 147 |
| | Vampire Hair | 147 |
| | Clown Hair Green | 148 |
| | Straight Hair Dark | 148 |
| | Straight Hair | 151 |
| | Silver Chain | 156 |
| | Dark Hair | 157 |
| | Purple Hair | 165 |
| | Gold Chain | 169 |
| | Medical Mask | 175 |
| | Tassle Hat | 178 |
| | Fedora | 186 |
| | Police Cap | 203 |
| | Clown Nose | 212 |
| | Smile | 238 |
| | Cap Forward | 254 |
| | Hoodie | 259 |
| | Front Beard Dark | 260 |
| | Frown | 261 |
| | Purple Eye Shadow | 262 |
| | Handlebars | 263 |
| | Blue Eye Shadow | 266 |
| | Green Eye Shadow | 271 |
| | Vape | 272 |
| | Front Beard | 273 |
| | Chinstrap | 282 |
| | 3D Glasses | 286 |
| | Luxurious Beard | 286 |
| | Mustache | 288 |
| | Normal Beard Black | 289 |
| | Normal Beard | 292 |
| | Eye Mask | 293 |
| | Goat | 295 |
| | Do-rag | 300 |
| | Shaved Head | 300 |
| | Muttonchops | 303 |
| | Peak Spike | 303 |
| | Pipe | 317 |
| | VR | 332 |
| | Cap | 351 |
| | Small Shades | 378 |
| | Clown Eyes Green | 382 |
| | Clown Eyes Blue | 384 |
| | Headband | 406 |
| | Crazy Hair | 414 |
| | Knitted Cap | 419 |
| | Mohawk Dark | 429 |
| | Mohawk | 441 |
| | Mohawk Thin | 441 |
| | Frumpy Hair | 442 |
| | Wild Hair | 447 |
| | Messy Hair | 460 |
| | Eye Patch | 461 |
| | Stringy Hair | 463 |
| | Bandana | 481 |
| | Classic Shades | 502 |
| | Shadow Beard | 526 |
| | Regular Shades | 527 |
| | Big Shades | 535 |
| | Horned Rim Glasses | 535 |
| | Nerd Glasses | 572 |
| | Black Lipstick | 617 |
| | Mole | 644 |
| | Purple Lipstick | 655 |
| | Hot Lipstick | 696 |
| | Cigarette | 961 |
| | Earring | 2,459 |

Cumulative sum, partial-by-partial (for spot-checking):

- After first 10 (through Top Hat): 44 + 48 + 54 + 55 + 68 + 78 + 86 + 94 +
  95 + 115 = 737.
- After 20 (through Cowboy Hat): 737 + 124 + 128 + 129 + 136 + 142 = 1,396.
- After 25 (through Vampire Hair): 1,396 + 144 + 144 + 146 + 147 + 147 +
  147 + 147 = 2,418.
- After 30 (through Silver Chain): 2,418 + 148 + 148 + 151 + 156 = 3,021.
- After 40 (through Tassle Hat): 3,021 + 157 + 165 + 169 + 175 + 178 = 3,865.
- After 50 (through Frown): 3,865 + 186 + 203 + 212 + 238 + 254 + 259 + 260 +
  261 = 5,738.
- After 60 (through Front Beard): 5,738 + 262 + 263 + 266 + 271 + 272 + 273
  = 7,345.
- After 70 (through Goat): 7,345 + 282 + 286 + 286 + 288 + 289 + 292 + 293 +
  295 = 9,656.
- After 75 (through Pipe): 9,656 + 300 + 300 + 303 + 303 + 317 = 11,179.
- After 80 (through Clown Eyes Blue): 11,179 + 332 + 351 + 378 + 382 + 384 =
  13,006.
- After 85 (through Wild Hair): 13,006 + 406 + 414 + 419 + 429 + 441 + 441 +
  442 + 447 = 16,045.
- After 90 (through Bandana): 16,045 + 460 + 461 + 463 + 481 = 17,910.
- After 95 (through Big Shades): 17,910 + 502 + 526 + 527 + 535 = 20,000.
- After Horned Rim Glasses: 20,000 + 535 = 20,535.
- After Nerd Glasses: 20,535 + 572 = 21,107.
- After Black Lipstick: 21,107 + 617 = 21,724.
- After Mole: 21,724 + 644 = 22,368.
- After Purple Lipstick: 22,368 + 655 = 23,023.
- After Hot Lipstick: 23,023 + 696 = 23,719.
- After Cigarette: 23,719 + 961 = 24,680.
- After Earring: 24,680 + 2,459 = **27,139.**

Expected from attribute count distribution: 27,539.

Difference: 400.

Recount attempt in tighter chunks:

Recompute sum in tight 10-row blocks taken straight from doc 05:

- Block 1 (10 rows, Beanie..Top Hat): 44+48+54+55+68+78+86+94+95+115. 92,
  +109 = 201, no wait — be careful.
  44+48 = 92. 92+54 = 146. 146+55 = 201. 201+68 = 269. 269+78 = 347. 347+86
  = 433. 433+94 = 527. 527+95 = 622. 622+115 = 737. ✓
- Block 2 (10 rows, Spots..Vampire Hair): 124+128+129+136+142+144+144+146+
  147+147. 124+128 = 252. 252+129 = 381. 381+136 = 517. 517+142 = 659.
  659+144 = 803. 803+144 = 947. 947+146 = 1,093. 1,093+147 = 1,240.
  1,240+147 = 1,387. ✓ Total after 20: 737 + 1,387 = 2,124. (My earlier
  partial said 2,418; I had double-counted Vampire Hair. Reset.)

Let me redo this cleanly in 10-row blocks. The 87 rows in doc 05, in order:

```
44, 48, 54, 55, 68, 78, 86, 94, 95, 115,
124, 128, 129, 136, 142, 144, 144, 146, 147, 147,
147, 147, 148, 148, 151, 156, 157, 165, 169, 175,
178, 186, 203, 212, 238, 254, 259, 260, 261, 262,
263, 266, 271, 272, 273, 282, 286, 286, 288, 289,
292, 293, 295, 300, 300, 303, 303, 317, 332, 351,
378, 382, 384, 406, 414, 419, 429, 441, 441, 442,
447, 460, 461, 463, 481, 502, 526, 527, 535, 535,
572, 617, 644, 655, 696, 961, 2459
```

Block sums:

- Rows 1–10: 44+48+54+55+68+78+86+94+95+115 = 737.
- Rows 11–20: 124+128+129+136+142+144+144+146+147+147 = 1,387.
- Rows 21–30: 147+147+148+148+151+156+157+165+169+175 = 1,563.
- Rows 31–40: 178+186+203+212+238+254+259+260+261+262 = 2,313.
- Rows 41–50: 263+266+271+272+273+282+286+286+288+289 = 2,776.
- Rows 51–60: 292+293+295+300+300+303+303+317+332+351 = 3,086.
- Rows 61–70: 378+382+384+406+414+419+429+441+441+442 = 4,136.
- Rows 71–80: 447+460+461+463+481+502+526+527+535+535 = 4,937.
- Rows 81–87: 572+617+644+655+696+961+2,459 = 6,604.

Total: 737 + 1,387 + 1,563 + 2,313 + 2,776 + 3,086 + 4,136 + 4,937 + 6,604.

- 737 + 1,387 = 2,124.
- 2,124 + 1,563 = 3,687.
- 3,687 + 2,313 = 6,000.
- 6,000 + 2,776 = 8,776.
- 8,776 + 3,086 = 11,862.
- 11,862 + 4,136 = 15,998.
- 15,998 + 4,937 = 20,935.
- 20,935 + 6,604 = **27,539.** ✓

Matches `sum_over_punks( attributeCount )` = 27,539. ✓

(My first-pass running total had a bookkeeping error around the 25-row mark.
The block-level recount confirms the catalog totals are internally
consistent.)

## Visible Pixel Count Aggregate

`07-visual-metrics-and-renderer-scope.md` lines 56–73:

- Total pixel positions: 5,760,000 = 10,000 × 576. ✓
- Transparent (α=0): 3,668,906.
- Semi-transparent (α=128): 8,226.
- Opaque (α=255): 2,082,868.
- Sum: 3,668,906 + 8,226 + 2,082,868 = **5,760,000.** ✓

Mean visible pixels per Punk: (8,226 + 2,082,868) / 10,000 = 2,091,094 /
10,000 = **209.1094.** ✓ Matches the doc.

## Visible Color Count Distribution

`07-visual-metrics-and-renderer-scope.md` lines 86–103:

| Colors | Punks |
| ---: | ---: |
| 2 | 24 |
| 3 | 170 |
| 4 | 463 |
| 5 | 1,262 |
| 6 | 2,165 |
| 7 | 2,226 |
| 8 | 1,747 |
| 9 | 1,040 |
| 10 | 589 |
| 11 | 215 |
| 12 | 73 |
| 13 | 24 |
| 14 | 2 |

Sum: 24 + 170 + 463 + 1,262 + 2,165 + 2,226 + 1,747 + 1,040 + 589 + 215 +
73 + 24 + 2 = **10,000.** ✓

## Storage Size Estimates

`03-storage-and-rendering-options.md` lines 13–28. Spot-checking:

- 10,000 × 128-bit masks: 10,000 × 16 = **160,000 bytes.** ✓
- 108 × 10,000-bit bitmaps: 108 × ⌈10,000 / 8⌉ = 108 × 1,250 = **135,000
  bytes.** ✓
- 98 × 10,000-bit bitmaps: 98 × 1,250 = **122,500 bytes.** ✓
- 87 × 10,000-bit bitmaps: 87 × 1,250 = **108,750 bytes.** ✓
- 10,000 × 576-byte indexed images: 10,000 × 576 = **5,760,000 bytes.** ✓
- 222 × 4-byte RGBA palette: 222 × 4 = **888 bytes.** ✓
- 10,000 × 576-bit visible-pixel bitmaps: 10,000 × 72 = **720,000 bytes.** ✓
- 10,000 × 256-bit color masks: 10,000 × 32 = **320,000 bytes.** ✓
- Color histograms ≈ 230 KB: with 10,000 Punks averaging ~7 visible colors
  × 3 bytes per (colorId, count) pair = ~210,000 bytes. With max 14 colors
  × 3 bytes = 420,000 bytes. **Range ~210–420 KB; 230 KB is a reasonable
  midpoint estimate.** Plausible. ✓

The "295 KB total for masks plus bitmaps" total (`03` line 30) is 160 KB +
135 KB = **295 KB.** ✓

The "13 chunks at 24 KB each" claim (`03` line 102) gives 13 × 24,576 =
319,488 bytes, comfortably above 295 KB. ✓

## Predicate Bit Count

`02-trait-filtering-interfaces.md` lines 56–67:

| Kind | Count |
| --- | ---: |
| Exact head variant | 11 |
| Normalized type | 5 |
| Attribute count | 8 |
| Accessory | 87 |

Sum: 11 + 5 + 8 + 87 = **111 bits.** Fits in `uint128`. ✓

If the Alien / Ape / Zombie collision is collapsed (giving them only one
bit each), the total drops to 108 bits. Still fits. The doc says "roughly
111 if duplicated, roughly 108 if not." Both numbers check.

## Conclusion

Every total reported in the seven research notes is internally consistent
with the others. The single point where my first manual sum disagreed (the
27,539 accessory placements) was a bookkeeping error on my end, not the
research's. The numbers in the research are good.

What this *does not* check:

- That the source contract actually returns those bytes. (I have not
  re-crawled. The hashes in `06-reproducibility-notes.md` would let a
  future verifier re-confirm.)
- That the 222-color palette is exactly the union of all colors in the
  10,000 source images. (Same — needs an independent crawl.)
- That the listed example Punk IDs (zero-attribute Punks 281, 510, 641,
  741, 1050, 2204, 3307, 6487; 14-color Punks 4067, 7334) actually
  match. (Same.)

A pinned source crawl per [02 Improvements](./02-improvements.md#5-pin-the-source-crawl)
would let any reader bridge that gap deterministically.
