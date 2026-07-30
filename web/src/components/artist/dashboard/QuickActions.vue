<template>
  <!-- 快捷操作区：6 卡片固定 2×3 网格（C50/C52 不可自定义） -->
  <div class="quick-grid">
    <div
      v-for="action in actions" :key="action.route"
      class="quick-card" role="button" tabindex="0"
      @click="$router.push(action.route)"
      @keydown.enter="$router.push(action.route)"
      @keydown.space.prevent="$router.push(action.route)"
    >
      <span class="quick-icon">{{ action.icon }}</span>
      <span class="quick-name">{{ $t(action.labelKey) }}</span>
    </div>
  </div>
</template>

<script setup>
/** 固定操作项（验收 §3.3；图库管理实际路由为 /artworks——验收标准中 /gallery 不存在） */
const actions = [
  { icon: '📋', labelKey: 'dashboard.queueBoard', route: '/queue' },
  { icon: '✍️', labelKey: 'dashboard.manualOrder', route: '/orders?action=manual' },
  { icon: '📦', labelKey: 'dashboard.allOrders', route: '/orders' },
  { icon: '🖼️', labelKey: 'dashboard.artworks', route: '/artworks' },
  { icon: '💰', labelKey: 'dashboard.tiers', route: '/tiers' },
  { icon: '⚙️', labelKey: 'dashboard.settings', route: '/settings' }
]
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
