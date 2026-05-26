<template>
  <div class="place-search-toolbar">
    <label class="search-field">
      <input
        v-model="model"
        type="text"
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
      />
      <slot name="actions" />
    </label>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  placeholder: string
}>()

const model = defineModel<string>({ required: true })
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
  min-height: var(--form-item-height);
  padding-inline: var(--size-3);
  border: var(--border);
  background: var(--bg);
}

.search-field input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
  font-size: var(--font-sm);
  text-transform: uppercase;
}

.search-field input:focus,
.search-field input:focus-visible {
  outline: none;
  box-shadow: none;
}

</style>
