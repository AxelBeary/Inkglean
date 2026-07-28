<template>
  <div class="dashboard">
    <ArtistLayout>
      <!-- 问候区：整块可点击换一句（R7） -->
      <div class="greeting-area" role="button" tabindex="0" :title="$t('dashboard.anotherOne')" @click="fetchGreeting" @keydown.enter="fetchGreeting" @keydown.space.prevent="fetchGreeting">
        <div class="greeting-main">
          <span class="greeting-icon">{{ slotIcon }}</span>
          <Transition name="greeting-fade" mode="out-in">
            <h2 class="greeting-text font-display" :key="greeting.text">{{ greeting.text }}</h2>
          </Transition>
        </div>
        <div class="greeting-date">{{ dateLine }}</div>
      </div>

      <!-- R8: 默认面板快捷入口 -->
      <div class="default-panel-card" @click="$router.push(panelRoute)">
        <span class="panel-icon">{{ panelIcon }}</span>
        <span class="panel-text">{{ $t('dashboard.defaultPanel') }}：{{ $t(panelLabelKey) }}</span>
        <span class="panel-arrow">→</span>
      </div>

      <!-- 统计卡片 -->
      <div class="stat-grid">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.pendingCount ?? '-' }}</div>
          <div class="stat-label">{{ $t('dashboard.pendingNew') }}</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.activeCount ?? '-' }}</div>
          <div class="stat-label">{{ $t('dashboard.activeOrders') }}</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num text-gold">¥{{ stats?.monthRevenue ?? '-' }}</div>
          <div class="stat-label">{{ $t('dashboard.monthRevenue') }}</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.totalCompleted ?? '-' }}</div>
          <div class="stat-label">{{ $t('dashboard.totalCompleted') }}</div>
        </el-card>
      </div>

      <!-- 快捷操作 -->
      <h3 style="margin: 24px 0 12px">{{ $t('dashboard.quickActions') }}</h3>
      <div class="quick-actions">
        <el-button type="primary" @click="$router.push('/queue')">{{ $t('dashboard.queueBoard') }}</el-button>
        <el-button type="success" @click="$router.push('/manual-order')">{{ $t('dashboard.manualOrder') }}</el-button>
        <el-button @click="$router.push('/orders')">{{ $t('dashboard.allOrders') }}</el-button>
        <el-button @click="$router.push('/settings')">{{ $t('dashboard.settings') }}</el-button>
      </div>

      <!-- 当前状态 -->
      <el-card style="margin-top: 24px">
        <template #header>{{ $t('dashboard.currentStatus') }}</template>
        <el-radio-group v-model="currentStatus" @change="updateStatus" size="large">
          <el-radio-button value="open">{{ $t('dashboard.statusOpen') }}</el-radio-button>
          <el-radio-button value="full">{{ $t('dashboard.statusFull') }}</el-radio-button>
          <el-radio-button value="break">{{ $t('dashboard.statusBreak') }}</el-radio-button>
        </el-radio-group>
      </el-card>
    </ArtistLayout>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useArtistStore } from '../../stores/artist.js'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t, locale } = useI18n()
const store = useArtistStore()
const stats = ref(null)
const currentStatus = ref('open')
const lastKnownStatus = ref('open') // P1-6: 回滚用

// ─── R8: 默认面板 ───
const PANEL_MAP = {
  queue:  { route: '/queue',        icon: '📋', labelKey: 'dashboard.panelQueue' },
  orders: { route: '/orders',       icon: '📦', labelKey: 'dashboard.panelOrders' },
  manual: { route: '/manual-order', icon: '✍️', labelKey: 'dashboard.panelManual' },
  tiers:  { route: '/tiers',        icon: '💰', labelKey: 'dashboard.panelTiers' }
}
const defaultPanel = computed(() => store.profile?.dashboard_default_panel || 'queue')
const panelRoute = computed(() => (PANEL_MAP[defaultPanel.value] || PANEL_MAP.queue).route)
const panelIcon = computed(() => (PANEL_MAP[defaultPanel.value] || PANEL_MAP.queue).icon)
const panelLabelKey = computed(() => (PANEL_MAP[defaultPanel.value] || PANEL_MAP.queue).labelKey)

// ─── 问候语 ───
const greeting = ref({ text: '', slot: 'any' })
const greetingLoading = ref(false)

const SLOT_ICONS = { morning: '☀️', afternoon: '🌤️', evening: '🌆', night: '🌙', any: '🎨' }
const slotIcon = computed(() => SLOT_ICONS[greeting.value.slot] || '🎨')

const dateLine = computed(() => {
  const now = new Date()
  const opts = { month: 'long', day: 'numeric', weekday: 'long' }
  const dateStr = now.toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', opts)
  const slotNames = {
    morning: t('dashboard.slotMorning'), afternoon: t('dashboard.slotAfternoon'),
    evening: t('dashboard.slotEvening'), night: t('dashboard.slotNight'), any: ''
  }
  const slotName = slotNames[greeting.value.slot] || ''
  return slotName ? `${dateStr} · ${slotName}` : dateStr
})

async function fetchGreeting() {
  // R7 防连击：请求进行中忽略重复点击，避免动画堆积
  if (greetingLoading.value) return
  greetingLoading.value = true
  try {
    greeting.value = await artistApi.getGreeting()
  } catch { /* 静默失败，保留默认 */ }
  finally { greetingLoading.value = false }
}

async function updateStatus(val) {
  try {
    await artistApi.updateProfile({ status: val })
    lastKnownStatus.value = val // P1-6: 成功后更新已知状态
    ElMessage.success(t('dashboard.statusUpdated'))
  } catch (err) {
    currentStatus.value = lastKnownStatus.value // P1-6: 回滚到上次成功状态
    ElMessage.error(err.message)
  }
}

onMounted(async () => {
  await store.fetchProfile()
  currentStatus.value = store.profile?.status || 'open'
  lastKnownStatus.value = currentStatus.value // P1-6: 初始化已知状态
  fetchGreeting()
  try { stats.value = await artistApi.getStats() } catch { /* ignore */ }
})
</script>

<style scoped>
/* 问候区：整块可点击（R7） */
.greeting-area {
  padding: 20px 24px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--color-primary-soft), transparent 70%);
  margin-bottom: 20px;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent; /* 移动端点击无高亮块 */
  transition: filter 0.18s;
}
.greeting-area:hover { filter: brightness(1.04); }
.greeting-area:active { filter: brightness(0.97); }
.greeting-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.greeting-icon { font-size: 24px; }
.greeting-text {
  font-size: 28px;
  font-weight: 400;
  color: var(--text-primary);
  margin: 0;
}
.greeting-date {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 问候语切换动画 */
.greeting-fade-enter-active { transition: opacity 0.2s, transform 0.2s; }
.greeting-fade-leave-active { transition: opacity 0.15s; }
.greeting-fade-enter-from { opacity: 0; transform: translateY(6px); }
.greeting-fade-leave-to { opacity: 0; }

/* 统计 */
.stat-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.stat-card { text-align: center; background: var(--bg-card); transition: background 0.3s, transform 0.18s; }
.stat-card:hover { transform: translateY(-2px); }
.stat-num { font-size: 28px; font-weight: bold; color: var(--color-primary); font-variant-numeric: tabular-nums; }
.stat-label { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
.quick-actions { display: flex; flex-wrap: wrap; gap: 12px; }

/* R8: 默认面板快捷入口 */
.default-panel-card {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; margin-bottom: 20px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-card); cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
  user-select: none;
}
.default-panel-card:hover { border-color: var(--el-color-primary-light-5); transform: translateY(-1px); }
.default-panel-card:active { transform: translateY(0); }
.panel-icon { font-size: 20px; }
.panel-text { flex: 1; font-size: 14px; font-weight: 500; color: var(--text-primary); }
.panel-arrow { color: var(--text-muted); font-size: 16px; }
</style>
