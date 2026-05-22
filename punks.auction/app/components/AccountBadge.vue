<template>
  <EvmAccount
    :address="address"
    resolve-ens
  >
    <template #default="{ display }">
      <img
        v-if="avatarUri"
        class="avvatar"
        :src="avatarUri"
        :alt="`Avatar for ${address}`"
        width="16"
        height="16"
      />
      <span class="label">{{ display }}</span>
    </template>
  </EvmAccount>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import { avvatarDataUri } from 'avvatars'

const props = defineProps<{
  address: Address
}>()

const avatarUri = computed(() =>
  avvatarDataUri({
    seed: props.address.toLowerCase(),
    size: 16,
    foreground: '#ff5fa8',
    background: '#ffffff',
  }),
)
</script>

<style scoped>
.avvatar {
  width: 16px;
  height: 16px;
  display: inline-block;
  vertical-align: middle;
  margin-right: 6px;
  box-shadow: 0 0 0 1px var(--border-color) inset;
}

.label {
  max-width: 18ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
</style>
