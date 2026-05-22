<template>
  <footer class="provenance">
    <a
      :href="rendererHref"
      target="_blank"
      rel="noopener noreferrer"
    >
      Onchain Punksdata
      <Icon name="lucide:external-link" />
    </a>
  </footer>
</template>

<script setup lang="ts">
import { PUNKS_RENDERER_ENS } from '@networked-art/punks-sdk'
import { addressUrl } from '~/utils/explorer'

const props = defineProps<{
  punkId: number
}>()

const rendererHref = computed(
  () => `${addressUrl(PUNKS_RENDERER_ENS)}/read#punkSvg:${props.punkId}`,
)
</script>

<style scoped>
.provenance {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--size-3);
  padding-top: var(--size-4);
  border-top: var(--border);
  color: var(--text-dim);
  font-size: 12px;
}

.provenance a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  color: var(--text-muted);
}

.provenance a:hover {
  color: var(--accent);
}
</style>
