<template>
  <Button
    class="trigger"
    @click="open = true"
  >
    Bid
  </Button>

  <ClientOnly>
    <Dialog
      v-model:open="open"
      title="Place collection bid"
    >
      <CollectionBidForm
        :query="query"
        @placed="onPlaced"
      />
    </Dialog>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { PunkQuery } from '@networked-art/punks-sdk'

defineProps<{ query?: PunkQuery }>()
const emit = defineEmits<{ placed: [] }>()

const open = ref(false)

function onPlaced() {
  open.value = false
  emit('placed')
}
</script>

<style scoped>
.trigger {
  white-space: nowrap;
}
</style>
