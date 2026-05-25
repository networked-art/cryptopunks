import {
  PUNK_GLITCH_OUTLINE_SPRITE_URL,
  PUNK_GLITCH_STRIPES_SPRITE_URL,
  PUNK_SPRITE_URL,
} from '~/utils/punkSprites'

const baseLoaded = ref(false)
const stripesLoaded = ref(false)
const outlineLoaded = ref(false)
let inflight: Promise<void> | null = null

function loadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Failed to load ${src}`))
    image.src = src
  })
}

async function loadSpriteLayers() {
  if (inflight) return inflight

  inflight = (async () => {
    try {
      await loadImage(PUNK_SPRITE_URL)
      baseLoaded.value = true

      await loadImage(PUNK_GLITCH_STRIPES_SPRITE_URL)
      stripesLoaded.value = true

      await loadImage(PUNK_GLITCH_OUTLINE_SPRITE_URL)
      outlineLoaded.value = true
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export function usePunkSpriteLayers() {
  if (import.meta.client && !outlineLoaded.value && !inflight) {
    void loadSpriteLayers().catch(() => {
      /// The CSS base layer still renders if optional glitch layers fail.
    })
  }

  return {
    baseLoaded: readonly(baseLoaded),
    stripesLoaded: readonly(stripesLoaded),
    outlineLoaded: readonly(outlineLoaded),
  }
}
