<template>
  <el-config-provider :locale="elLocale">
    <router-view />
  </el-config-provider>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const { locale } = useI18n()
const elLocale = computed(() => locale.value === 'zh-CN' ? zhCn : en)
</script>

<style>
/* ===== 全局基础样式 ===== */
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg-page: #f5f5f5;
  --bg-card: #ffffff;
  --bg-hover: rgba(0, 0, 0, 0.06);
  --text-primary: #333333;
  --text-secondary: #999999;
  --text-muted: #cccccc;
  --border-color: #eeeeee;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-card-hover: 0 2px 8px rgba(0, 0, 0, 0.12);
}

html.dark {
  --bg-page: #141414;
  --bg-card: #1d1e1f;
  --bg-hover: rgba(255, 255, 255, 0.08);
  --text-primary: #e5eaf3;
  --text-secondary: #a3a6ad;
  --text-muted: #6c6e72;
  --border-color: #414243;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-card-hover: 0 2px 8px rgba(0, 0, 0, 0.4);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  transition: background 0.3s, color 0.3s;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .el-dialog { width: 90% !important; }
}
</style>
