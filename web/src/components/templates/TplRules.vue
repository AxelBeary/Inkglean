<template>
  <section class="tpl-rules" v-if="rules">
    <p class="tpl-section-label tpl-rules-label">{{ $t('artistHome.rules') }}</p>
    <SanitizedRichText :html="sanitizedRules" class="tpl-rules-body tpl-body-text" />
  </section>
</template>

<script setup lang="ts">
import SanitizedRichText from '../shared/SanitizedRichText.vue'

defineProps({
  rules: { type: String, default: '' },
  sanitizedRules: { type: String, default: '' }
})
</script>

<style scoped>
.tpl-rules {
  max-width: 720px;
  margin: 0 auto;
}
.tpl-rules-label {
  margin-bottom: 20px;
}
.tpl-rules-body {
  font-size: 14px;
  color: var(--pal-text);
}
.tpl-rules-body :deep(h1),
.tpl-rules-body :deep(h2),
.tpl-rules-body :deep(h3) {
  color: var(--pal-text);
  font-family: var(--font-display);
}
.tpl-rules-body :deep(a) {
  color: var(--color-primary);
}
</style>
