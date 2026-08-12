<template>
  <div class="shop-visibility-switch">
    <div class="shop-visibility-row">
      <span class="shop-visibility-label">{{ t('settings.shopVisibleLabel') }}</span>
      <el-switch
        :model-value="visible"
        :disabled="disabled"
        :aria-label="t('settings.shopVisibleLabel')"
        :active-text="t('settings.shopVisibleOn')"
        :inactive-text="t('settings.shopVisibleOff')"
        @update:model-value="onChange"
      />
    </div>
    <p v-if="!visible" class="shop-hidden-notice">{{ t('settings.shopHiddenNotice') }}</p>
    <p v-else class="shop-visibility-hint">{{ t('settings.shopVisibleHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  visible: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const { t } = useI18n()

function onChange(value: string | number | boolean) {
  emit('update:visible', Boolean(value))
}
</script>

<style scoped>
.shop-visibility-switch {
  width: 100%;
}
.shop-visibility-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.shop-visibility-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.shop-hidden-notice {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--zs, #A84F4F);
}
.shop-visibility-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink2);
}
</style>
