<template>
  <section class="place-action-card">
    <header class="place-card-head">
      <h2>{{ title }}</h2>
    </header>

    <div class="place-card-body">
      <slot />
    </div>

    <footer
      v-if="showFooter"
      class="place-card-footer"
    >
      <span class="footer-secondary">
        <slot name="secondary" />
      </span>
      <span class="footer-primary">
        <slot name="primary-prefix" />
        <slot name="primary">
          <Button
            class="primary"
            :disabled="primaryDisabled"
            @click="emit('primary')"
          >
            {{ primaryLabel }}
          </Button>
        </slot>
      </span>
    </footer>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    primaryLabel?: string
    primaryDisabled?: boolean
    showFooter?: boolean
  }>(),
  {
    primaryLabel: 'Continue',
    primaryDisabled: false,
    showFooter: true,
  },
)

const emit = defineEmits<{
  primary: []
}>()
</script>

<style scoped>
.place-action-card {
  --place-card-height: min(
    calc(var(--form-item-height) * 24),
    calc(100vh - (var(--size-8) * 6))
  );
  --place-card-min-height: calc(var(--form-item-height) * 19);

  display: flex;
  flex-direction: column;
  height: var(--place-card-height);
  min-height: var(--place-card-min-height);
  border: var(--border);
  background: var(--bg-elevated);
}

.place-card-head {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  flex: 0 0 auto;
  padding: var(--size-3);
  border-bottom: var(--border);
}

.place-card-head h2 {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: var(--font-weight-normal);
}

.place-card-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--size-3);
  overflow: hidden;
}

.place-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2);
  flex: 0 0 auto;
  min-height: calc(var(--form-item-height) + var(--size-4));
  padding: var(--size-3);
  border-top: var(--border);
}

.footer-secondary,
.footer-primary {
  display: inline-flex;
  align-items: center;
  gap: var(--size-3);
}

.footer-primary {
  flex: 1 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-inline-start: auto;
  min-width: 0;
}

.place-card-footer :deep(button:not(.unstyled)),
.place-card-footer :deep(.button:not(.unstyled)) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  height: var(--form-item-height);
  min-height: var(--form-item-height);
  padding-block: 0;
}

@media (max-width: 720px) {
  .place-action-card {
    --place-card-height: min(
      calc(var(--form-item-height) * 24),
      calc(100vh - (var(--size-8) * 4))
    );
    --place-card-min-height: calc(var(--form-item-height) * 17);
  }
}
</style>
