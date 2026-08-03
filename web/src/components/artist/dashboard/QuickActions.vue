<script>
// #3: 快捷按钮候选池常量（命名导出，供 Settings.vue 配置区共用）
// v0.34 任务3：emoji 图标位改用 @element-plus/icons-vue SVG（用户拍板删 emoji，SVG 无所谓）
import { markRaw } from 'vue'
import { TrendCharts, Tickets, EditPen, Box, ChatDotRound, Money, Picture, Setting, View } from '@element-plus/icons-vue'

/** localStorage 键（v0.25 起 DB 优先，localStorage 作为回退缓存） */
export const QUICK_ACTIONS_KEY = 'huiyue_quick_actions'

/** 候选池（~10 个，命名与侧边栏 menu.* 完全一致） */
export const QUICK_ACTION_POOL = [
  { key: 'dashboard', icon: markRaw(TrendCharts), labelKey: 'menu.dashboard', route: '/dashboard' },
  { key: 'queue', icon: markRaw(Tickets), labelKey: 'menu.queue', route: '/queue' },
  { key: 'manual', icon: markRaw(EditPen), labelKey: 'menu.manualOrder', route: '/orders?action=manual' },
  { key: 'orders', icon: markRaw(Box), labelKey: 'menu.orders', route: '/orders' },
  { key: 'guestbook', icon: markRaw(ChatDotRound), labelKey: 'menu.guestbook', route: '/guestbook' },
  { key: 'tiers', icon: markRaw(Money), labelKey: 'menu.tiers', route: '/tiers' },
  { key: 'artworks', icon: markRaw(Picture), labelKey: 'menu.artworks', route: '/artworks' },
  { key: 'settings', icon: markRaw(Setting), labelKey: 'menu.settings', route: '/settings' },
  { key: 'preview', icon: markRaw(View), labelKey: 'menu.preview', route: null }
]

/** 默认 6 个（与改版前一致） */
export const QUICK_ACTIONS_DEFAULT = ['queue', 'manual', 'orders', 'artworks', 'tiers', 'settings']

/** 解析 quickActions 值（DB 返回 JSON 字符串或数组，统一为合法 key 数组） */
export function parseQuickActions(raw) {
  try {
    const keys = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(keys) || keys.length === 0) return null
    const valid = QUICK_ACTION_POOL.filter(a => keys.includes(a.key)).map(a => a.key)
    return valid.length ? valid : null
  } catch { return null }
}

/** 读取 localStorage 配置（无效/缺失 → 默认副本） */
export function readQuickActionsConfig() {
  return parseQuickActions(localStorage.getItem(QUICK_ACTIONS_KEY)) || [...QUICK_ACTIONS_DEFAULT]
}
</script>

<template>
  <!-- #3: 快捷操作区（可自定义：候选池 + localStorage 配置，3 列网格自适应行数） -->
  <div class="quick-grid">
    <div
      v-for="action in activeActions" :key="action.key"
      class="quick-card" role="button" tabindex="0"
      @click="go(action)"
      @keydown.enter="go(action)"
      @keydown.space.prevent="go(action)"
    >
      <el-icon class="quick-icon"><component :is="action.icon" /></el-icon>
      <span class="quick-name">{{ $t(action.labelKey) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useArtistStore } from '../../../stores/artist.js'

const router = useRouter()
const store = useArtistStore()

// v0.25: DB 优先（profile.quick_actions），localStorage 回退，最终兜底默认值
const activeActions = computed(() => {
  const dbKeys = parseQuickActions(store.profile?.quick_actions)
  const keys = dbKeys || readQuickActionsConfig()
  return keys
    .map(k => QUICK_ACTION_POOL.find(a => a.key === k))
    .filter(Boolean)
})

function go(action) {
  // 主页预览：动态拼接 subdomain（新窗口，与 Settings 预览行为一致）
  if (action.key === 'preview') {
    if (store.subdomain) window.open(`/artist/${store.subdomain}`, '_blank', 'noopener')
    return
  }
  router.push(action.route)
}
</script>

<style scoped>
.quick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.quick-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 8px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-card); cursor: pointer; user-select: none;
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}
.quick-card:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.quick-card:active { transform: translateY(0); }
.quick-icon { font-size: 22px; color: var(--el-color-primary); }
.quick-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
@media (max-width: 768px) {
  .quick-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 400px) {
  .quick-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
