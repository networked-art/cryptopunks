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
    <Transition name="punk-highlight">
      <span
        v-if="highlightedImageUrl"
        :key="highlightedImageUrl"
        class="punk-highlight"
        :style="highlightStyle"
        aria-hidden="true"
      />
    </Transition>
    <span
      v-if="showId"
      class="punk-image-id"
      >{{ punkId }}</span
    >
  </div>
</template>

<script lang="ts">
import { PUNK_SPRITE_URL } from '~/utils/punkSprites'

const PUNK_SOURCE_SIZE = 24
const PUNK_HIGHLIGHT_SCALE = 4
const PUNK_HIGHLIGHT_SIZE = PUNK_SOURCE_SIZE * PUNK_HIGHLIGHT_SCALE
const PUNK_SPRITE_COLS = 100
const DIMMED_PIXEL_OPACITY = 0.25
const DIMMED_BACKGROUND_OPACITY = 0.18
const INACTIVE_PIXEL_SCALE = 0.5

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
    img.src = PUNK_SPRITE_URL
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
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = PUNK_SOURCE_SIZE
  sourceCanvas.height = PUNK_SOURCE_SIZE

  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceCtx) return null

  const col = punkId % PUNK_SPRITE_COLS
  const row = Math.floor(punkId / PUNK_SPRITE_COLS)
  const sourceWidth = sprite.naturalWidth / PUNK_SPRITE_COLS
  const sourceHeight = sprite.naturalHeight / PUNK_SPRITE_COLS

  sourceCtx.imageSmoothingEnabled = false
  sourceCtx.clearRect(0, 0, PUNK_SOURCE_SIZE, PUNK_SOURCE_SIZE)
  sourceCtx.drawImage(
    sprite,
    col * sourceWidth,
    row * sourceHeight,
    sourceWidth,
    sourceHeight,
    0,
    0,
    PUNK_SOURCE_SIZE,
    PUNK_SOURCE_SIZE,
  )

  const source = sourceCtx.getImageData(
    0,
    0,
    PUNK_SOURCE_SIZE,
    PUNK_SOURCE_SIZE,
  )
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = PUNK_HIGHLIGHT_SIZE
  outputCanvas.height = PUNK_HIGHLIGHT_SIZE

  const outputCtx = outputCanvas.getContext('2d')
  if (!outputCtx) return null

  outputCtx.imageSmoothingEnabled = false
  outputCtx.clearRect(0, 0, PUNK_HIGHLIGHT_SIZE, PUNK_HIGHLIGHT_SIZE)

  for (let y = 0; y < PUNK_SOURCE_SIZE; y++) {
    for (let x = 0; x < PUNK_SOURCE_SIZE; x++) {
      const offset = (y * PUNK_SOURCE_SIZE + x) * 4
      const r = source.data[offset] ?? 0
      const g = source.data[offset + 1] ?? 0
      const b = source.data[offset + 2] ?? 0
      const a = source.data[offset + 3] ?? 0
      const isSelected =
        r === rgba.r && g === rgba.g && b === rgba.b && a === rgba.a
      const pixelSize = isSelected
        ? PUNK_HIGHLIGHT_SCALE
        : Math.max(1, Math.round(PUNK_HIGHLIGHT_SCALE * INACTIVE_PIXEL_SCALE))
      const pixelInset = Math.floor((PUNK_HIGHLIGHT_SCALE - pixelSize) / 2)

      outputCtx.fillStyle = isSelected
        ? `rgba(${r}, ${g}, ${b}, ${a / 255})`
        : `rgba(${r}, ${g}, ${b}, ${(a / 255) * DIMMED_PIXEL_OPACITY})`
      outputCtx.fillRect(
        x * PUNK_HIGHLIGHT_SCALE + pixelInset,
        y * PUNK_HIGHLIGHT_SCALE + pixelInset,
        pixelSize,
        pixelSize,
      )
    }
  }

  const dataUrl = outputCanvas.toDataURL('image/png')
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
  backgroundColor: props.highlightedColor
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
    backgroundImage: `url('${PUNK_SPRITE_URL}')`,
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
  transition: background-color 0.18s ease;
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
  transition: opacity 0.18s ease;
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

.punk-highlight-enter-active,
.punk-highlight-leave-active {
  transition: opacity 0.18s ease;
}

.punk-highlight-enter-from,
.punk-highlight-leave-to {
  opacity: 0;
}

.punk-highlight-enter-to,
.punk-highlight-leave-from {
  opacity: 1;
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
