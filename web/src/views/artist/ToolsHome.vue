<script setup lang="ts">
// 工具箱首页（纸墨提案 §5.5：一格一类、各归其位；路由 /tools）
// 数据源 = constants/toolbox.js 单一事实源（与 ArtistLayout 抽屉分类组共用）
import { useI18n } from 'vue-i18n'
import { TOOLS_MENU_ITEMS, TOOL_BOX_CATEGORIES } from '../../constants/toolbox'

const { t } = useI18n()
function toolsOf(catKey: string) {
  return TOOLS_MENU_ITEMS.filter((item) => item.cat === catKey)
}
</script>

<template>
  <div class="tools-home">
    <h2 class="font-display tools-title">{{ t('menu.toolbox') }}</h2>
    <p class="tools-hint">{{ t('menu.toolboxHint') }}</p>

    <!-- 四格分类：钱袋子 / 交付 / 客户 / 效率 -->
    <div class="tools-grid">
      <section v-for="cat in TOOL_BOX_CATEGORIES" :key="cat.key" class="tool-cat-card">
        <header class="tool-cat-head">
          <el-icon class="tool-cat-icon"><component :is="cat.icon" /></el-icon>
          <span class="tool-cat-name">{{ t(cat.labelKey) }}</span>
        </header>
        <nav class="tool-cat-list">
          <router-link v-for="item in toolsOf(cat.key)" :key="item.index" :to="item.index" class="tool-link">
            <el-icon class="tool-link-icon"><component :is="item.icon" /></el-icon>
            <span class="tool-link-label">{{ t(item.labelKey) }}</span>
          </router-link>
        </nav>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 纸墨 token；hover 不位移（克制动效纪律） */
.tools-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.tools-hint { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); margin: 8px 0 20px; }
.tools-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
@media (max-width: 768px) { .tools-grid { grid-template-columns: 1fr; } }
.tool-cat-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-l); padding: 16px; }
.tool-cat-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.tool-cat-icon { font-size: calc(var(--font-scale, 1) * 18px); color: var(--hq); }
.tool-cat-name { font-weight: 600; font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink); }
.tool-cat-list { display: flex; flex-direction: column; gap: 4px; }
.tool-link {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--r-m);
  color: var(--ink2); text-decoration: none;
  font-size: calc(var(--font-scale, 1) * 13px);
  transition: background-color var(--dur-fast), color var(--dur-fast);
}
.tool-link:hover { background: var(--paper2); color: var(--ink); }
.tool-link-icon { font-size: calc(var(--font-scale, 1) * 16px); color: var(--ink3); flex: none; transition: color var(--dur-fast); }
.tool-link:hover .tool-link-icon { color: var(--hq); }
</style>
