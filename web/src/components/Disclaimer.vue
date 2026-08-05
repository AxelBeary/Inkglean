<template>
  <el-alert type="warning" :closable="false" show-icon class="disclaimer">
    <template #title>{{ $t('disclaimer.title') }}</template>
    {{ $t('disclaimer.text') }}
  </el-alert>
</template>

<style scoped>
.disclaimer { margin-top: 24px; }
/* 打磨批 B：亮色下加深 EP warning 文字色——默认 #e6a23c 在浅橙底约 2.2:1，
   #855e0a ≈ 5.4:1 达 WCAG AA 4.5:1。仅 :not(.dark) 作用，暗色模式不受影响 */
html:not(.dark) .disclaimer { color: #855e0a; }
html:not(.dark) .disclaimer :deep(.el-alert__description) { color: #855e0a; }
</style>
