<template>
  <ul class="punk-review-grid">
    <li
      v-for="item in items"
      :key="`${item.standard}-${item.punkId}`"
      class="punk-review-card"
    >
      <PunkThumb
        class="punk-review-image"
        :punk-id="item.punkId"
        :standard="item.standard"
        :link="false"
        fluid
      />
      <span class="punk-review-label">
        Punk #{{ item.punkId }}
        <span
          v-if="item.standard === TokenStandard.CryptoPunksV1"
          class="punk-review-standard"
        >
          V1
        </span>
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

defineProps<{
  items: readonly {
    punkId: number
    standard: TokenStandardValue
  }[]
}>()
</script>

<style scoped>
.punk-review-grid {
  --review-card-size: calc(var(--form-item-height) * 2.5);

  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, var(--review-card-size)), var(--review-card-size))
  );
  justify-content: start;
  gap: var(--size-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.punk-review-card {
  display: grid;
  gap: var(--size-2);
  min-width: 0;
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg-elevated);
}

.punk-review-image {
  inline-size: 100%;
}

.punk-review-label {
  display: inline-flex;
  justify-content: center;
  gap: var(--size-1);
  min-width: 0;
  color: var(--text);
  font-size: var(--font-xs);
  line-height: var(--line-height-tight);
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.punk-review-standard {
  color: var(--text-muted);
}
</style>
