<template>
  <el-alert type="warning" :closable="false" show-icon class="disclaimer">
    <template #title>{{ $t('disclaimer.title') }}</template>
    {{ $t('disclaimer.text') }}
  </el-alert>
</template>

<style scoped>
.disclaimer { margin-top: 24px; }
</style>
