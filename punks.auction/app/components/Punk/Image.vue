<template>
  <div
    class="punk-image"
    :style="rootStyle"
    :title="`Punk #${punkId}`"
    role="img"
    :aria-label="`CryptoPunk ${punkId}`"
  >
    <span
      class="punk-base"
      :class="{ 'is-highlighted': highlightedImageUrl !== null }"
      :style="spriteStyle"
      aria-hidden="true"
    />
    <span
      v-if="highlightedImageUrl"
      class="punk-highlight"
      :style="highlightStyle"
      aria-hidden="true"
    />
    <span
      v-if="showId"
      class="punk-image-id"
      >{{ punkId }}</span
    >
  </div>
</template>

<script lang="ts">
const PUNK_CANVAS_SIZE = 24
const PUNK_SPRITE_COLS = 100
const DIMMED_PIXEL_OPACITY = 0.25
const DIMMED_BACKGROUND_OPACITY = 0.18

let spriteImagePromise: Promise<HTMLImageElement> | null = null
const highlightImageCache = new Map<string, string>()

type RgbaParts = {
  r: number
  g: number
  b: number
  a: number
  hex: string
}

function loadPunkSprite(): Promise<HTMLImageElement> {
  if (spriteImagePromise) return spriteImagePromise
  spriteImagePromise = new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load punk sprite'))
    img.src = '/punks.png'
  })
  return spriteImagePromise
}

async function highlightedPunkDataUrl(
  punkId: number,
  color: string,
): Promise<string | null> {
  const rgba = parseRgbaHex(color)
  if (!rgba) return null

  const cacheKey = `${punkId}:${rgba.hex}`
  const cached = highlightImageCache.get(cacheKey)
  if (cached) return cached

  const sprite = await loadPunkSprite()
  const canvas = document.createElement('canvas')
  canvas.width = PUNK_CANVAS_SIZE
  canvas.height = PUNK_CANVAS_SIZE

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const col = punkId % PUNK_SPRITE_COLS
  const row = Math.floor(punkId / PUNK_SPRITE_COLS)
  const sourceWidth = sprite.naturalWidth / PUNK_SPRITE_COLS
  const sourceHeight = sprite.naturalHeight / PUNK_SPRITE_COLS

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, PUNK_CANVAS_SIZE, PUNK_CANVAS_SIZE)
  ctx.drawImage(
    sprite,
    col * sourceWidth,
    row * sourceHeight,
    sourceWidth,
    sourceHeight,
    0,
    0,
    PUNK_CANVAS_SIZE,
    PUNK_CANVAS_SIZE,
  )

  const source = ctx.getImageData(0, 0, PUNK_CANVAS_SIZE, PUNK_CANVAS_SIZE)
  const highlighted = ctx.createImageData(PUNK_CANVAS_SIZE, PUNK_CANVAS_SIZE)

  for (let i = 0; i < source.data.length; i += 4) {
    const r = source.data[i] ?? 0
    const g = source.data[i + 1] ?? 0
    const b = source.data[i + 2] ?? 0
    const a = source.data[i + 3] ?? 0
    const isSelected =
      r === rgba.r && g === rgba.g && b === rgba.b && a === rgba.a

    highlighted.data[i] = r
    highlighted.data[i + 1] = g
    highlighted.data[i + 2] = b
    highlighted.data[i + 3] = isSelected
      ? a
      : Math.round(a * DIMMED_PIXEL_OPACITY)
  }

  ctx.putImageData(highlighted, 0, 0)

  const dataUrl = canvas.toDataURL('image/png')
  highlightImageCache.set(cacheKey, dataUrl)
  return dataUrl
}

function parseRgbaHex(value: string): RgbaParts | null {
  let hex = value.trim()
  hex = hex.startsWith('#') ? hex.slice(1) : hex.replace(/^0x/i, '')
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return null
  if (hex.length === 6) hex = `${hex}ff`
  hex = hex.toLowerCase()

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: parseInt(hex.slice(6, 8), 16),
    hex,
  }
}

function cssColorWithAlpha(value: string, opacity: number): string {
  const rgba = parseRgbaHex(value)
  if (!rgba) return value
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${(
    (rgba.a / 255) *
    opacity
  ).toFixed(3)})`
}
</script>

<script setup lang="ts">
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

const props = withDefaults(
  defineProps<{
    punkId: number
    size?: number | string
    background?: string
    standard?: TokenStandardValue
    showId?: boolean
    highlightedColor?: string | null
  }>(),
  {
    size: 96,
    standard: TokenStandard.CryptoPunks,
    showId: false,
    highlightedColor: null,
  },
)

const { backgroundForPunk } = usePunkBackgrounds()
const SPRITE_COLS = 100
const SPRITE_SPAN = SPRITE_COLS - 1

const resolvedBackground = computed(
  () => props.background ?? backgroundForPunk(props.punkId, props.standard),
)

const rootStyle = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}px` : props.size,
  height: typeof props.size === 'number' ? `${props.size}px` : props.size,
  background: props.highlightedColor
    ? cssColorWithAlpha(resolvedBackground.value, DIMMED_BACKGROUND_OPACITY)
    : resolvedBackground.value,
}))

const highlightedImageUrl = ref<string | null>(null)
const highlightStyle = computed(() =>
  highlightedImageUrl.value
    ? { backgroundImage: `url("${highlightedImageUrl.value}")` }
    : undefined,
)

let highlightRequest = 0
watch(
  () => [props.punkId, props.highlightedColor] as const,
  async ([punkId, highlightedColor]) => {
    const request = ++highlightRequest
    highlightedImageUrl.value = null
    if (!highlightedColor || !import.meta.client) return

    try {
      const dataUrl = await highlightedPunkDataUrl(punkId, highlightedColor)
      if (request === highlightRequest) {
        highlightedImageUrl.value = dataUrl
      }
    } catch {
      if (request === highlightRequest) {
        highlightedImageUrl.value = null
      }
    }
  },
)

const spriteStyle = computed(() => {
  const row = Math.floor(props.punkId / SPRITE_COLS)
  const col = props.punkId % SPRITE_COLS
  return {
    backgroundImage: "url('/punks.png')",
    backgroundSize: `${SPRITE_COLS * 100}% ${SPRITE_COLS * 100}%`,
    backgroundPosition: `${(col / SPRITE_SPAN) * 100}% ${(row / SPRITE_SPAN) * 100}%`,
  }
})
</script>

<style scoped>
.punk-image {
  position: relative;
  display: inline-block;
  overflow: hidden;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.punk-base {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  user-select: none;
  background-repeat: no-repeat;
  z-index: 1;
}

.punk-base.is-highlighted {
  opacity: 0;
}

.punk-highlight {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  user-select: none;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  pointer-events: none;
  z-index: 2;
}

.punk-image-id {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
  font-size: var(--font-xs);
  color: var(--text);
  background: rgba(0, 0, 0, 0.55);
  text-align: center;
  line-height: 14px;
  pointer-events: none;
}
</style>
