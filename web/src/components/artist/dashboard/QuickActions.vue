<script>
// #3: 快捷按钮候选池常量（命名导出，供 Settings.vue 配置区共用）
/** localStorage 键（MVP：后续三号补 DB 字段后切换存储） */
export const QUICK_ACTIONS_KEY = 'huiyue_quick_actions'

/** 候选池（~10 个，命名与侧边栏 menu.* 完全一致） */
export const QUICK_ACTION_POOL = [
  { key: 'dashboard', icon: '📊', labelKey: 'menu.dashboard', route: '/dashboard' },
  { key: 'queue', icon: '📋', labelKey: 'menu.queue', route: '/queue' },
  { key: 'manual', icon: '✍️', labelKey: 'menu.manualOrder', route: '/orders?action=manual' },
  { key: 'orders', icon: '📦', labelKey: 'menu.orders', route: '/orders' },
  { key: 'guestbook', icon: '💬', labelKey: 'menu.guestbook', route: '/guestbook' },
  { key: 'tiers', icon: '💰', labelKey: 'menu.tiers', route: '/tiers' },
  { key: 'artworks', icon: '🖼️', labelKey: 'menu.artworks', route: '/artworks' },
  { key: 'settings', icon: '⚙️', labelKey: 'menu.settings', route: '/settings' },
  { key: 'preview', icon: '👁️', labelKey: 'menu.preview', route: null }
]

/** 默认 6 个（与改版前一致） */
export const QUICK_ACTIONS_DEFAULT = ['queue', 'manual', 'orders', 'artworks', 'tiers', 'settings']

/** 读取 localStorage 配置（无效/缺失 → 默认副本） */
export function readQuickActionsConfig() {
  try {
    const raw = localStorage.getItem(QUICK_ACTIONS_KEY)
    if (!raw) return [...QUICK_ACTIONS_DEFAULT]
    const keys = JSON.parse(raw)
    if (!Array.isArray(keys) || keys.length === 0) return [...QUICK_ACTIONS_DEFAULT]
    // 过滤非法 key，保持候选池顺序
    const valid = QUICK_ACTION_POOL.filter(a => keys.includes(a.key)).map(a => a.key)
    return valid.length ? valid : [...QUICK_ACTIONS_DEFAULT]
  } catch { return [...QUICK_ACTIONS_DEFAULT] }
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
      <span class="quick-icon">{{ action.icon }}</span>
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

const activeActions = computed(() =>
  readQuickActionsConfig()
    .map(k => QUICK_ACTION_POOL.find(a => a.key === k))
    .filter(Boolean)
)

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
.quick-icon { font-size: 22px; }
.quick-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
@media (max-width: 768px) {
  .quick-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 400px) {
  .quick-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
