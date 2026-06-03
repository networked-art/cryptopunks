<template>
  <div class="private-buyer">
    <button
      type="button"
      class="private-buyer-toggle unstyled muted"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon :name="open ? 'lucide:chevron-down' : 'lucide:chevron-right'" />
      <span>Restrict to a single buyer</span>
    </button>

    <div
      v-if="open"
      class="private-buyer-body"
    >
      <label class="private-buyer-field">
        <span class="private-buyer-label muted">Buyer address</span>
        <EvmAddressInput
          v-model="buyer"
          :placeholder="placeholder"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <p class="private-buyer-help muted">
        They alone can open the auction or have their offer accepted. Once the
        auction is open, anyone can outbid them.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    placeholder?: string
  }>(),
  {
    placeholder: '0x... or name.eth',
  },
)

const buyer = defineModel<string>({ required: true })
const open = defineModel<boolean>('open', { default: false })

watch(open, (isOpen) => {
  if (!isOpen) buyer.value = ''
})
</script>

<style scoped>
.private-buyer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--size-2);
  min-width: 0;
}

.private-buyer-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  padding: 0;
  font-size: var(--font-xs);
  cursor: pointer;
}

.private-buyer-toggle:hover,
.private-buyer-toggle:focus-visible {
  color: var(--text);
  outline: none;
}

.private-buyer-body {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: var(--size-1);
}

.private-buyer-field {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: var(--size-1);
}

.private-buyer-label {
  font-size: var(--font-xs);
}

.private-buyer-help {
  margin: 0;
  font-size: var(--font-xs);
  line-height: var(--line-height-md, 1.4);
}

.private-buyer-field :deep(.evm-address-input) {
  width: 100%;
  min-width: 0;
}

.private-buyer-field :deep(.evm-address-input > small) {
  font-size: 10px;
  overflow-wrap: anywhere;
  word-break: break-all;
}
</style>
