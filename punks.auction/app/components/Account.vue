<template>
  <EvmAccount
    :address="address"
    resolve-ens
  >
    <template #default="{ display }">
      <span class="account">
        <img
          v-if="avatarUri"
          class="avvatar"
          :src="avatarUri"
          :alt="`Avatar for ${address}`"
        />
        <span class="handle">{{ display }}</span>
      </span>
    </template>
  </EvmAccount>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import { accountAvvatarDataUri } from '~/utils/avvatar'

const props = withDefaults(
  defineProps<{
    address: Address
    imageSize?: number
  }>(),
  {
    imageSize: 24,
  },
)

const avatarUri = computed(() =>
  accountAvvatarDataUri(props.address, props.imageSize),
)
</script>

<style scoped>
.account {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2);
  max-width: 100%;
  min-width: 0;
  vertical-align: middle;
}

.avvatar {
  height: 1lh;
  aspect-ratio: 1;
  display: block;
  flex: 0 0 auto;
  box-shadow: 0 0 0 1px var(--border-color) inset;
}

.handle {
  display: inline-block;
  max-width: 18ch;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
