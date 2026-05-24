<template>
  <article class="lot-detail">
    <aside class="stage">
      <div class="stage-inner">
        <figure class="frame">
          <LotPreview :items="items" />
        </figure>
      </div>
    </aside>

    <section class="panel">
      <div class="panel-inner">
        <div class="panel-stack">
          <slot />
        </div>
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import type { LotItem } from '~/utils/auction'

defineProps<{
  items: LotItem[]
}>()
</script>

<style scoped>
.lot-detail {
  --app-header-height: 57px;

  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  width: 100%;
}

.stage {
  background: var(--gray-z-2);
  border-right: var(--border);
}

.stage-inner {
  position: sticky;
  top: var(--app-header-height);
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(100dvh - var(--app-header-height));
  padding: var(--size-5) var(--size-6) var(--size-8);
}

.frame {
  width: min(520px, 42vw, 62vh);
  margin: 0;
}

.frame :deep(.lot-preview) {
  border: var(--border);
}

.panel {
  display: flex;
  align-items: center;
  min-width: 0;
}

.panel-inner {
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  padding: var(--size-7) var(--size-6) var(--size-9);
}

.panel-stack {
  display: flex;
  flex-direction: column;
  gap: var(--size-7);
}

@media (max-width: 860px) {
  .lot-detail {
    grid-template-columns: 1fr;
  }

  .stage {
    border-right: 0;
    border-bottom: var(--border);
  }

  .stage-inner {
    position: relative;
    top: auto;
    height: auto;
    padding: var(--size-7) var(--size-5);
  }

  .frame {
    width: min(420px, 78vw);
  }

  .panel-inner {
    padding: var(--size-6) var(--size-5) var(--size-8);
  }
}
</style>
