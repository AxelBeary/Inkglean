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
@import './styles/theme.css';
/* v0.38: 画师后台纸墨 token（scoped html[data-artist-theme]，客户端路由下不生效，见文件头注释） */
@import './styles/artist-tokens.css';

/* ===== 全局基础样式 ===== */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-body);
  background: var(--bg-page);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  transition: background 0.3s, color 0.3s;
}

/* 展示字体工具类 */
.font-display {
  font-family: var(--font-display);
}

/* 等宽数字（金额/统计） */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* 金箔金额 */
.text-gold {
  color: var(--color-gold);
  font-variant-numeric: tabular-nums;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .el-dialog { width: 90% !important; }
}
</style>
