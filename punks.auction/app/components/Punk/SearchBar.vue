<template>
  <header class="search-bar">
    <FormInputGroup class="search-group">
      <div
        class="search-field"
        :class="{ 'with-action': hasAction, 'has-text': model }"
        :style="fieldStyle"
      >
        <input
          ref="searchInput"
          v-model="model"
          type="search"
          class="search-input"
          :placeholder="placeholder"
          @keydown.enter="emit('enter')"
          @keydown.esc.prevent="searchInput?.blur()"
        />
        <span
          ref="underlineMeasure"
          class="search-underline-measure"
          aria-hidden="true"
          >{{ underlineText }}</span
        >
        <kbd
          class="search-shortcut"
          aria-hidden="true"
          title="Press / to focus search"
          >/</kbd
        >
        <span class="search-actions">
          <slot name="before-count" />
          <span class="muted result-count">
            <template v-if="counts.filtered === counts.total">
              {{ counts.total.toLocaleString() }}
            </template>
            <template v-else>
              {{ counts.filtered.toLocaleString()
              }}<span class="result-total">
                / {{ counts.total.toLocaleString() }}</span
              >
            </template>
          </span>
          <slot name="control" />
          <button
            v-if="model"
            type="button"
            class="unstyled clear-search"
            aria-label="Clear search"
            @click="clearSearch"
          >
            <Icon name="lucide:x" />
          </button>
        </span>
      </div>
      <ClientOnly>
        <slot name="action" />
      </ClientOnly>
    </FormInputGroup>
  </header>
</template>

<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'

type SearchCounts = {
  total: number
  filtered: number
}

const props = withDefaults(
  defineProps<{
    placeholder: string
    counts: SearchCounts
    actionsWidth?: string
  }>(),
  {
    actionsWidth: '176px',
  },
)
const emit = defineEmits<{
  enter: []
  clear: []
}>()
const model = defineModel<string>({ required: true })
const slots = useSlots()

const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
const underlineMeasure = useTemplateRef<HTMLElement>('underlineMeasure')
const underlineText = ref(model.value)
const underlineWidthPx = ref(0)
const underlineWidth = computed(() => `${underlineWidthPx.value}px`)
const hasAction = computed(() => !!slots.action)
const fieldStyle = computed(() => ({
  '--search-underline-width': underlineWidth.value,
  '--search-actions-width': props.actionsWidth,
}))

/// `/` is a global shortcut for "focus the search". Skip when the user is
/// already typing into an editable element so the slash lands as a character.
onKeyStroke('/', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (
    target?.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
    return
  e.preventDefault()
  searchInput.value?.focus()
  searchInput.value?.select()
})

function measureUnderline() {
  underlineWidthPx.value =
    underlineMeasure.value?.getBoundingClientRect().width ?? 0
}

function syncUnderline() {
  underlineText.value = model.value
  nextTick(measureUnderline)
}

function clearSearch() {
  model.value = ''
  emit('clear')
  nextTick(() => searchInput.value?.focus())
}

watch(model, () => nextTick(syncUnderline))
onMounted(() => nextTick(syncUnderline))
</script>

<style scoped>
.search-bar {
  position: sticky;
  top: calc(56px + var(--border-width));
  z-index: var(--z-index-ui);
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2);
  align-items: center;
  width: 100%;
  max-width: 720px;
  box-sizing: border-box;
  margin: 0 auto;
  margin-top: var(--size-2);
  padding: var(--size-4);
  font-size: var(--font-sm);
  text-transform: uppercase;
}

.search-group {
  --search-control-height: calc(var(--form-item-height) + var(--size-4));

  flex: 1 1 240px;
  min-width: 0;
  box-shadow: var(--shadow-2, 0 10px 24px rgb(10 10 18 / 12%));
  transition: box-shadow 180ms ease;
}

.search-group:focus-within {
  box-shadow: var(--shadow-3, 0 18px 42px rgb(10 10 18 / 28%));
}

.search-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  z-index: 1;
}

.search-field::after {
  content: '';
  position: absolute;
  inset-inline-start: var(--ui-padding-inline);
  top: calc(50% + 1em);
  z-index: 3;
  width: 0;
  height: 2px;
  background: var(--accent);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--speed),
    width 80ms linear;
}

.search-underline-measure {
  position: absolute;
  display: inline-block;
  inset-inline-start: var(--ui-padding-inline);
  top: calc(50% + 1em);
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
  white-space: pre;
  font-family: var(--ui-font-family);
  font-size: var(--font-sm);
  font-weight: var(--ui-font-weight);
  letter-spacing: var(--ui-letter-spacing);
  line-height: var(--ui-line-height);
  text-transform: uppercase;
}

.search-field:hover,
.search-field:focus-within {
  z-index: 2;
}

.search-field.has-text:focus-within::after {
  width: min(
    var(--search-underline-width, 0ch),
    calc(100% - var(--ui-padding-inline) - var(--search-actions-width))
  );
  opacity: 1;
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  min-height: var(--search-control-height);
  padding-inline-start: calc(var(--ui-padding-inline) + 22px);
  padding-inline-end: var(--search-actions-width);
  border-radius: 0 !important;
  font-size: var(--font-sm);
  text-transform: uppercase;
  box-shadow: none;
}

.search-field:focus-within .search-input,
.search-field.has-text .search-input {
  padding-inline-start: var(--ui-padding-inline);
}

.search-input:hover,
.search-input:active,
.search-input:focus,
.search-input:focus-visible,
.search-input.active {
  outline: none;
  box-shadow: none;
}

.search-field:focus-within .search-input {
  background: white;
}

.search-field.with-action .search-input {
  border-start-end-radius: 0 !important;
  border-end-end-radius: 0 !important;
}

.search-group :deep(.search-bar-action) {
  border-start-start-radius: 0 !important;
  border-end-start-radius: 0 !important;
  border-radius: 0 !important;
  block-size: var(--search-control-height);
  min-block-size: var(--search-control-height);
  box-sizing: border-box;
  font-size: var(--font-sm);
  box-shadow: none;
  white-space: nowrap;
}

.search-group :deep(.search-bar-action:is(:hover, :active, :focus, .active)) {
  outline: none;
  box-shadow: none;
}

.search-input::-webkit-search-cancel-button {
  display: none;
  -webkit-appearance: none;
  appearance: none;
}

.search-actions {
  position: absolute;
  top: 50%;
  inset-inline-end: var(--size-3);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--size-0);
  transform: translateY(-50%);
}

.result-count {
  font-size: var(--font-sm);
  line-height: var(--line-height);
  white-space: nowrap;
  pointer-events: none;
  padding-inline: var(--size-1);
}

.search-shortcut {
  position: absolute;
  top: 50%;
  inset-inline-start: var(--ui-padding-inline);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: 18px;
  height: 18px;
  padding-inline: var(--size-1);
  border: var(--border-width) solid var(--border);
  border-radius: 3px;
  color: var(--text-muted);
  background: var(--surface-muted, transparent);
  font-family: var(--ui-font-family);
  font-size: 11px;
  line-height: 1;
  text-transform: none;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity var(--speed);
}

.search-field.has-text .search-shortcut,
.search-field:focus-within .search-shortcut {
  display: none;
}

.clear-search {
  width: 24px;
  height: 24px;
  min-inline-size: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.clear-search:hover,
.clear-search:focus-visible {
  color: var(--text);
}

.clear-search :deep(.icon) {
  width: 16px;
  height: 16px;
}

@media (max-width: 640px) {
  .search-bar {
    padding-inline: 0;
  }

  .result-total {
    display: none;
  }
}
</style>
