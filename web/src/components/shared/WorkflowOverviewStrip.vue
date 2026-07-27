<template>
  <div class="overview-strip" :class="{ vertical }">
    <div v-for="(s, i) in stages" :key="s.id" class="strip-node" :class="{ payment: s.takesPayment, final: s.isFinal }">
      <span class="strip-dot"></span>
      <span class="strip-name">{{ s.name }}</span>
      <span v-if="s.takesPayment" class="strip-bp">{{ (s.basisPoints / 100).toFixed(1).replace(/\.0$/, '') }}%</span>
      <span v-if="s.isFinal" class="strip-lock">🔒</span>
      <span v-if="i < stages.length - 1" class="strip-arrow">→</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  stages: { type: Array, default: () => [] },
  vertical: { type: Boolean, default: false }
})
</script>

<style scoped>
.overview-strip {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 8px 0; font-size: 12px; color: var(--text-secondary);
}
.overview-strip.vertical { flex-direction: column; align-items: flex-start; }
.strip-node { display: inline-flex; align-items: center; gap: 3px; }
.strip-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--text-muted); flex-shrink: 0;
}
.strip-node.payment .strip-dot { background: var(--color-primary); }
.strip-node.final .strip-dot { background: var(--color-gold); }
.strip-name { white-space: nowrap; }
.strip-node.payment .strip-name { color: var(--text-primary); font-weight: 600; }
.strip-bp { color: var(--color-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.strip-lock { font-size: 10px; }
.strip-arrow { color: var(--text-muted); margin: 0 2px; }
.vertical .strip-arrow { display: none; }
</style>
