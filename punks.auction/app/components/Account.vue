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
      />
      <span class="label">{{ display }}</span>
    </template>
  </EvmAccount>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import { accountAvvatarDataUri } from '~/utils/avvatar'

const props = withDefaults(defineProps<{
  address: Address
  imageSize?: number
}>(), {
  imageSize: 24,
})

const avatarUri = computed(() =>
  accountAvvatarDataUri(props.address, props.imageSize),
)
</script>

<style scoped>
.avvatar {
  height: 1lh;
  aspect-ratio: 1;
  display: inline-block;
  vertical-align: middle;
  margin-right: var(--size-2);
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
