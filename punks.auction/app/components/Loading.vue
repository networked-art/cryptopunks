<template>
  <div :class="['loader', { stacked }]">
    <Spinner
      v-if="spinner"
      class="loading-spinner"
      :label="spinnerLabel"
      :decorative="Boolean(txt)"
    />
    <span
      v-if="txt"
      class="text"
      >{{ txt }}</span
    >
  </div>
</template>

<script setup lang="ts">
import Spinner from './Spinner.vue'

const props = withDefaults(
  defineProps<{
    txt?: string
    spinner?: boolean
    stacked?: boolean
  }>(),
  {
    txt: 'Loading...',
    spinner: false,
    stacked: false,
  },
)

const spinnerLabel = computed(() => props.txt || 'Loading')
</script>

<style scoped>
.loader {
  position: relative;
  z-index: var(--z-index-ui);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacer-sm);
}

.loading-spinner {
  flex: 0 0 auto;
}

.text {
  font-family: var(--ui-font-family);
  font-size: var(--ui-font-size);
  font-weight: var(--ui-font-weight);
  text-transform: var(--ui-text-transform);
  letter-spacing: var(--ui-letter-spacing);
  line-height: var(--ui-line-height);
  color: var(--muted);
}

.loader:not(.stacked) .text {
  width: min-content;
}

.loader.stacked {
  flex-direction: column;
  gap: var(--spacer);
}

.loader:not(.inline) {
  text-align: center;
  margin: var(--size-8) 0;

  & > .spinner {
    margin-bottom: var(--size-6);
  }
}

.loader.inline {
  display: inline-flex;
  gap: var(--size-1);
  margin-left: var(--size-1);
}
</style>
