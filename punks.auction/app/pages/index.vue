<template>
  <div class="landing">
    <HeroPunks />
    <h1 class="headline">
      An Auction House
      <span class="headline-em">for CryptoPunks</span>
    </h1>
    <p class="subline">24-hour auctions. Zero fees. Real price discovery.</p>
    <div class="cta-buttons">
      <Button
        class="primary large"
        to="/punks"
      >
        <span>Browse Punks</span>
      </Button>
      <Button
        class="large"
        to="/about"
      >
        Learn More
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'

const PAGE_TITLE = 'Punks Auction — An Auction House for CryptoPunks'
const router = useRouter()

useSeoMeta({
  title: PAGE_TITLE,
  ogTitle: PAGE_TITLE,
  twitterTitle: PAGE_TITLE,
})
// defineOgImage('Default', {
//   title: 'An Auction House for CryptoPunks',
//   description: '24h auctions, multi-Punk lots, native-ETH purchase offers.',
// })

onKeyStroke('/', async (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
  if (isEditableTarget(event.target)) return

  event.preventDefault()
  await router.push('/punks')
  await focusPunkSearchInput()
})

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return (
    el?.isContentEditable ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  )
}

async function focusPunkSearchInput() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await nextTick()
    const input = document.querySelector<HTMLInputElement>(
      '.search-input[type="search"]',
    )
    if (input) {
      input.focus()
      input.select()
      return
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}
</script>

<style scoped>
.landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--size-8);
  padding: var(--size-9) var(--size-4);
  min-height: calc(100svh - 113px);
  text-align: center;
}

.headline {
  margin: var(--size-4) 0 0;
  max-width: 600px;
  font-size: var(--font-display);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tighter);
  line-height: var(--line-height-tight);
}

.headline-em {
  color: var(--accent);
}

.subline {
  margin: 0;
  max-width: 560px;
  color: var(--text-muted);
  font-size: var(--font-display-sm);
  line-height: var(--line-height-relaxed);
}

.cta-buttons {
  display: flex;
  gap: var(--size-3);
  margin-top: var(--size-2);
}

</style>
