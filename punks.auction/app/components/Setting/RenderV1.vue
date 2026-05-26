<template>
  <section class="setting-section">
    <h2 class="section-title eyebrow">Context</h2>
    <FormCheckbox
      v-model="renderV1"
      class="setting-row"
    >
      <span class="setting-text">
        <strong>Render V1 Punks</strong>
        <span class="muted small">
          Show items from the original June 9th 2017 market alongside the
          canonical CryptoPunks. Off by default.
        </span>
      </span>
    </FormCheckbox>
  </section>
</template>

<script setup lang="ts">
const renderV1 = useV1Rendering()
</script>

<style scoped>
.setting-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.setting-row.form-checkbox {
  --setting-checkbox-active-color: var(--accent);
  --setting-checkbox-border-color: var(--text-muted);
  --setting-checkbox-check-color: var(--button-primary-color);
  --primary: var(--setting-checkbox-active-color);
  --muted: var(--setting-checkbox-border-color);
  --background: var(--setting-checkbox-check-color);

  display: flex;
  align-items: flex-start;
  gap: var(--size-3);
  color: var(--text);
  cursor: pointer;
}

.setting-row :deep(.form-checkbox-button) {
  margin-top: var(--size-1);
}

.setting-text {
  display: flex;
  flex-direction: column;
  gap: var(--size-0);
  font-size: var(--font-base);
  line-height: var(--line-height-snug);
}

.setting-text .small {
  font-size: var(--font-sm);
}
</style>
