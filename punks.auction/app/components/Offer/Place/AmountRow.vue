<template>
  <section class="amount-row">
    <span class="label">Amount</span>

    <label class="amount-control">
      <input
        v-model="model"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        placeholder="0.5"
      />
      <span class="amount-unit">ETH</span>
    </label>
  </section>
</template>

<script setup lang="ts">
const model = defineModel<string>({ required: true })
</script>

<style scoped>
.amount-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--size-4);
  padding-block: var(--size-4);
  border-bottom: var(--border);
}

.amount-control {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: var(--size-3);
  width: calc(var(--form-item-height) * 3.5);
  height: var(--form-item-height);
  padding-inline: var(--size-3);
  border: 0;
  background: var(--tag-background);
  box-shadow: 0 0 0 var(--border-width) var(--border-color);
  box-sizing: border-box;
}

.amount-control input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  box-shadow: none;
  padding: 0;
  font-size: var(--font-sm);
}

.amount-control input:focus,
.amount-control input:focus-visible {
  outline: none;
  box-shadow: none;
}

.amount-unit {
  color: var(--muted);
  font-size: var(--font-sm);
  text-transform: uppercase;
}

@media (max-width: 640px) {
  .amount-row {
    grid-template-columns: 1fr;
    gap: var(--size-2);
  }

  .amount-control {
    justify-self: stretch;
    width: 100%;
  }
}
</style>
