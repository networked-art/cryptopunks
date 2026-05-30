<template>
  <AutocompleteRoot
    v-model="model"
    v-model:open="open"
    as="header"
    class="search-bar"
    :ignore-filter="true"
    :open-on-focus="true"
    :reset-search-term-on-blur="false"
  >
    <FormInputGroup class="search-group">
      <AutocompleteAnchor as-child>
        <div
          class="search-field"
          :class="{ 'with-action': hasAction, 'has-text': model }"
          :style="fieldStyle"
        >
          <AutocompleteInput as-child>
            <input
              ref="searchInput"
              type="search"
              class="search-input"
              :placeholder="placeholder"
              @keydown.enter="onEnterKey"
              @keydown.esc.prevent="onEscape"
            />
          </AutocompleteInput>
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
      </AutocompleteAnchor>
      <ClientOnly>
        <slot name="action" />
      </ClientOnly>
    </FormInputGroup>

    <ClientOnly>
      <AutocompletePortal>
        <AutocompleteContent
          class="search-suggestions"
          position="popper"
          :side-offset="6"
          :hide-when-empty="true"
        >
          <AutocompleteViewport class="search-suggestions-viewport">
            <AutocompleteGroup
              v-for="group in groups"
              :key="group.key"
              class="search-suggestions-group"
            >
              <AutocompleteLabel class="search-suggestions-label">
                {{ group.label }}
              </AutocompleteLabel>
              <AutocompleteItem
                v-for="item in group.items"
                :key="`${item.kind}:${item.query}`"
                :value="item.query"
                :text-value="item.label"
                class="search-suggestion"
              >
                <span class="search-suggestion-label">{{ item.label }}</span>
                <span class="search-suggestion-meta">
                  <span class="search-suggestion-kind">{{ item.kindLabel }}</span>
                  <span
                    v-if="item.count != null"
                    class="search-suggestion-count"
                    >{{ item.count.toLocaleString() }}</span
                  >
                </span>
              </AutocompleteItem>
            </AutocompleteGroup>
          </AutocompleteViewport>
        </AutocompleteContent>
      </AutocompletePortal>
    </ClientOnly>
  </AutocompleteRoot>
</template>

<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import {
  AutocompleteAnchor,
  AutocompleteContent,
  AutocompleteGroup,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompletePortal,
  AutocompleteRoot,
  AutocompleteViewport,
} from 'reka-ui'
import type { PunkSuggestion } from '~/composables/usePunkSearch'

type SearchCounts = {
  total: number
  filtered: number
}

const props = withDefaults(
  defineProps<{
    placeholder: string
    counts: SearchCounts
    suggestions?: PunkSuggestion[]
    actionsWidth?: string
  }>(),
  {
    suggestions: () => [],
    actionsWidth: '176px',
  },
)
const emit = defineEmits<{
  enter: []
  clear: []
}>()
const model = defineModel<string>({ required: true })
const slots = useSlots()

const open = ref(false)
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

/// Suggestions are grouped for display. The SDK's grammar qualifiers (skin
/// tone, count) and the app's market qualifiers all read as "Filters"; traits
/// and collections get their own groups. Filters surface first — they only
/// match a deliberate word — with the (always longer) trait list last.
const KIND_LABELS: Record<PunkSuggestion['kind'], string> = {
  market: 'Filter',
  count: 'Filter',
  'skin-tone': 'Skin tone',
  collection: 'Collection',
  trait: 'Trait',
}
const GROUPS: { key: string; label: string; kinds: PunkSuggestion['kind'][]; limit: number }[] = [
  { key: 'filters', label: 'Filters', kinds: ['market', 'count', 'skin-tone'], limit: 4 },
  { key: 'collections', label: 'Collections', kinds: ['collection'], limit: 4 },
  { key: 'traits', label: 'Traits', kinds: ['trait'], limit: 6 },
]
const groups = computed(() =>
  GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: props.suggestions
      .filter((suggestion) => group.kinds.includes(suggestion.kind))
      .slice(0, group.limit)
      .map((suggestion) => ({
        ...suggestion,
        kindLabel: KIND_LABELS[suggestion.kind],
      })),
  })).filter((group) => group.items.length > 0),
)
const hasSuggestions = computed(() => groups.value.length > 0)

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

/// Enter selects the highlighted suggestion when the dropdown is showing one
/// (reka handles that, on the same keypress); otherwise it falls through to
/// the parent's navigate-to-result behaviour.
function onEnterKey() {
  if (open.value && hasSuggestions.value) return
  emit('enter')
}

/// Escape first dismisses the open dropdown, then (when already closed) blurs
/// the field — the same two-stage escape a native combobox gives.
function onEscape() {
  if (open.value) {
    open.value = false
    return
  }
  searchInput.value?.blur()
}

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
  .result-total {
    display: none;
  }
}
</style>

<style>
/* `<header class="search-bar">` is rendered by reka's AutocompleteRoot, so it
   doesn't receive this SFC's scoped-style attribute — these root rules must be
   global. (Inner elements are authored here directly and stay scoped.) */
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

@media (max-width: 640px) {
  .search-bar {
    padding-inline: var(--size-4);
  }
}

/* The suggestions panel is teleported to <body>, so it can't be `scoped`. */
.search-suggestions {
  z-index: var(--z-index-dropdown, 100);
  inline-size: var(--reka-popper-anchor-width);
  max-block-size: min(var(--reka-popper-available-height), 60vh);
  overflow-y: auto;
  background: white;
  border: var(--border-width) solid var(--border);
  box-shadow: var(--shadow-3, 0 18px 42px rgb(10 10 18 / 28%));
  font-family: var(--ui-font-family);
  font-size: var(--font-sm);
  text-transform: uppercase;

  opacity: 1;
  scale: 1;
  transition:
    opacity var(--speed) ease,
    scale var(--speed) ease;
  transform-origin: top center;
}

.search-suggestions[data-state='closed'] {
  opacity: 0;
  scale: 0.97;
}

@starting-style {
  .search-suggestions[data-state='open'] {
    opacity: 0;
    scale: 0.97;
  }
}

.search-suggestions-viewport {
  padding-block: var(--size-1);
}

.search-suggestions-group + .search-suggestions-group {
  border-block-start: var(--border-width) solid var(--border);
}

.search-suggestions-label {
  display: block;
  padding: var(--size-1) var(--size-3);
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: var(--ui-letter-spacing);
  user-select: none;
}

.search-suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
  padding: var(--size-2) var(--size-3);
  cursor: pointer;
  outline: none;
  user-select: none;
}

.search-suggestion[data-highlighted] {
  background: var(--accent);
  color: white;
}

.search-suggestion-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-suggestion-meta {
  display: inline-flex;
  align-items: baseline;
  gap: var(--size-2);
  color: var(--text-muted);
  white-space: nowrap;
}

.search-suggestion[data-highlighted] .search-suggestion-meta {
  color: white;
}

.search-suggestion-kind {
  font-size: 10px;
  opacity: 0.75;
}

.search-suggestion-count {
  font-variant-numeric: tabular-nums;
}
</style>
