<template>
  <Dialog
    v-model:open="open"
    :title="title ?? defaultTitle"
    class="punk-picker-dialog"
    compat
    @closed="onClosed"
  >
    <p
      v-if="lead"
      class="lead muted"
    >
      {{ lead }}
    </p>

    <PunkSelect
      v-model="selection"
      :ids="ids"
      :multi="multi"
      :max="max"
      :empty-message="emptyMessage"
    />

    <div class="status muted">
      <template v-if="multi">
        {{ selection.length }} selected{{ max ? ` / ${max}` : '' }}
      </template>
      <template v-else>
        {{
          selection.length === 1
            ? `Punk #${selection[0]} selected`
            : 'Pick one Punk'
        }}
      </template>
    </div>

    <template #footer>
      <Button
        class="secondary"
        @click="cancel"
      >
        Cancel
      </Button>
      <Button
        class="primary"
        :disabled="!canConfirm"
        @click="confirmSelection"
      >
        {{ confirmLabel ?? defaultConfirmLabel }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    ids: number[]
    multi?: boolean
    max?: number
    initial?: number[]
    title?: string
    confirmLabel?: string
    lead?: string
    emptyMessage?: string
  }>(),
  { multi: false },
)

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [ids: number[]] }>()

const selection = ref<number[]>([])

watch(open, (next) => {
  if (next) selection.value = [...(props.initial ?? [])]
})

const defaultTitle = computed(() =>
  props.multi ? 'Select Punks' : 'Select a Punk',
)
const defaultConfirmLabel = computed(() => (props.multi ? 'Use Punks' : 'Use Punk'))

const canConfirm = computed(() => {
  if (selection.value.length === 0) return false
  if (props.multi && props.max && selection.value.length > props.max) return false
  if (!props.multi && selection.value.length !== 1) return false
  return true
})

function cancel() {
  open.value = false
}

function confirmSelection() {
  if (!canConfirm.value) return
  emit('confirm', [...selection.value])
  open.value = false
}

function onClosed() {
  selection.value = []
}
</script>

<style scoped>
.punk-picker-dialog :deep(section) {
  gap: var(--size-2);
}

.lead {
  margin: 0;
  font-size: var(--font-sm);
}

.status {
  font-size: var(--font-xs);
  text-align: end;
}
</style>
