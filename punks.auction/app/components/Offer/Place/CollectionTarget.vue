<template>
  <OfferPlaceTargetShell>
    <div class="collection-target">
      <span class="collection-title">Any Punk</span>
      <span class="collection-copy">
        Make an offer on any punk.
      </span>
    </div>
  </OfferPlaceTargetShell>
</template>

<style scoped>
.collection-target {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--size-2);
  min-height: 100%;
  padding: var(--size-5);
  color: var(--text);
  text-align: center;
}

.collection-title {
  font-size: var(--font-sm);
  text-transform: uppercase;
}

.collection-copy {
  color: var(--text-muted);
  font-size: var(--font-sm);
  text-align: center;
}
</style>
