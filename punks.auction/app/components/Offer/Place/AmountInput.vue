<template>
  <label class="amount-input">
    <input
      v-model="model"
      aria-label="Offer amount in ETH"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      spellcheck="false"
      :placeholder="placeholder"
      @keyup.enter="emit('submit')"
    />
    <span
      class="currency"
      aria-hidden="true"
    >
      ETH
    </span>
  </label>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    placeholder?: string
  }>(),
  { placeholder: '0.5' },
)

const model = defineModel<string>({ required: true })
const emit = defineEmits<{
  submit: []
}>()
</script>

<style scoped>
.amount-input {
  position: relative;
  display: flex;
  align-items: center;
  align-self: stretch;
  flex: 1 1 calc(var(--form-item-height) * 3.5);
  min-inline-size: 0;
  block-size: var(--form-item-height);
  padding: var(--ui-padding-block) var(--ui-padding-inline);
  border-radius: var(--button-border-radius);
  background: var(--input-background);
  box-shadow: var(--border-shadow);
  color: var(--ui-color);
  cursor: text;
  font-family: var(--ui-font-family);
  font-size: var(--ui-font-size);
  font-weight: var(--ui-font-weight);
  letter-spacing: var(--ui-letter-spacing);
  line-height: var(--ui-line-height);
  text-transform: var(--input-text-transform);
  transition: all var(--speed);
  z-index: 1;
}

.amount-input:hover,
.amount-input:focus-within {
  background: var(--input-background-highlight);
  box-shadow: var(--border-shadow-highlight);
  z-index: 2;
}

.amount-input input {
  flex: 1 1 auto;
  min-inline-size: 0;
  block-size: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  text-transform: inherit;
}

.amount-input input:focus,
.amount-input input:focus-visible {
  outline: none;
  background: transparent;
  box-shadow: none;
}

.amount-input input::placeholder {
  color: var(--ui-placeholder-color);
  opacity: 1;
}

.currency {
  flex: 0 0 auto;
  margin-inline-start: var(--size-2);
  color: var(--text-muted);
  font: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  text-transform: uppercase;
}
</style>
