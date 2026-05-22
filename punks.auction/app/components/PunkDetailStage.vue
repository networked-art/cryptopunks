<template>
  <aside class="stage">
    <div class="stage-inner">
      <figure class="frame">
        <div class="art-box">
          <PunkImage
            :punk-id="punkId"
            :standard="standard"
            size="100%"
          />
        </div>
      </figure>
      <ClientOnly>
        <Button
          class="download small"
          :disabled="downloading"
          title="Download PNG"
          aria-label="Download PNG"
          @click="downloadImage"
        >
          <Icon :name="downloading ? 'lucide:loader' : 'lucide:download'" />
        </Button>
      </ClientOnly>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { downloadPunkPng } from '~/utils/punkSnapshot'
import type { TokenStandardValue } from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const offline = usePunksOffline()
const { backgroundForPunk } = usePunkBackgrounds()
const downloading = ref(false)

async function downloadImage() {
  if (downloading.value) return
  downloading.value = true
  try {
    await downloadPunkPng(offline, props.punkId, {
      size: 2048,
      background: backgroundForPunk(props.punkId, props.standard),
    })
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped>
.stage {
  background: var(--gray-z-2);
  border-right: var(--border);
}

.stage-inner {
  position: sticky;
  top: var(--app-header-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: calc(100dvh - var(--app-header-height));
  padding: var(--size-6);
}

.frame {
  position: relative;
  margin: 0;
  padding: clamp(var(--size-3), 2.4vw, var(--size-6));
  background: #fff;
  border: var(--border);
  box-shadow:
    0 1px 2px rgba(10, 10, 18, 0.05),
    0 24px 48px -28px rgba(10, 10, 18, 0.4);
}

.art-box {
  display: block;
  width: min(420px, 42vw, 52vh);
  aspect-ratio: 1;
  font-size: 0;
}

.art-box :deep(.punk-image) {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 0;
}

.download {
  position: absolute;
  right: var(--size-5);
  bottom: var(--size-5);
  opacity: 0.25;
  transition: opacity var(--speed, 0.15s) ease;
}

.stage-inner:hover .download,
.download:focus-visible,
.download:hover {
  opacity: 1;
}

@media (max-width: 860px) {
  .stage {
    border-right: 0;
    border-bottom: var(--border);
  }

  .stage-inner {
    position: relative;
    height: auto;
    padding: var(--size-7) var(--size-5);
  }

  .art-box {
    width: min(380px, 72vw);
  }
}
</style>
