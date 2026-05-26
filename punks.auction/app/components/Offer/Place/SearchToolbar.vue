<template>
  <div class="place-search-toolbar">
    <label
      class="search-field"
      :class="{
        'is-disabled': disabled,
        'has-actions': hasActions,
      }"
    >
      <input
        v-model="model"
        type="text"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter.prevent="emit('submit')"
      />
      <span
        v-if="hasActions"
        class="search-actions"
      >
        <slot name="actions" />
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    disabled?: boolean
    placeholder: string
  }>(),
  { disabled: false },
)

const model = defineModel<string>({ required: true })
const emit = defineEmits<{
  submit: []
}>()
const slots = useSlots()
const hasActions = computed(() => !!slots.actions)
</script>

<style scoped>
.place-search-toolbar {
  display: block;
}

.search-field {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  min-width: 0;
  height: var(--form-item-height);
  min-height: var(--form-item-height);
  padding-inline: var(--size-3);
  border: 0;
  background: var(--tag-background);
  box-shadow: 0 0 0 var(--border-width) var(--border-color);
  box-sizing: border-box;
}

.search-field.has-actions {
  padding-inline-end: 0;
}

.search-field input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  box-shadow: none;
  padding: 0;
  font-size: var(--font-sm);
  text-transform: uppercase;
}

.search-field input::placeholder {
  color: var(--muted);
  opacity: 1;
}

.search-field.is-disabled {
  background: var(--bg);
  cursor: default;
}

.search-field.is-disabled input,
.search-field input:disabled {
  color: var(--text-dim);
  cursor: default;
  opacity: 1;
  -webkit-text-fill-color: var(--text-dim);
}

.search-field.is-disabled input::placeholder {
  color: var(--text-dim);
}

.search-field input:focus,
.search-field input:focus-visible {
  outline: none;
  box-shadow: none;
}

.search-actions {
  display: inline-flex;
  align-self: stretch;
  align-items: stretch;
  flex: 0 0 auto;
  margin-inline-start: var(--size-2);
}
</style>
