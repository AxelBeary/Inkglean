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

      <!-- R52: 今日统计紧凑行（始终显示，无数据 ¥0；金额后端返分，前端 /100） -->
      <div class="today-stats-row">
        <span class="today-stats-item">{{ $t('dashboard.todayNewOrders') }} <strong class="text-gold">¥{{ formatCents(stats?.todayNewOrderCents) }}</strong></span>
        <span class="today-stats-sep">·</span>
        <span class="today-stats-item">{{ $t('dashboard.todayRevenue') }} <strong class="text-gold">¥{{ formatCents(stats?.todayRevenueCents) }}</strong></span>
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

      <!-- R51: 截稿日 + 今日待办（两个独立卡片，始终显示不做响应式隐藏） -->
      <div class="deadline-grid">
        <el-card shadow="hover" class="deadline-card">
          <template #header>{{ $t('dashboard.deadlineCard') }}</template>
          <div v-if="upcomingDeadlines.length" class="deadline-list">
            <div
              v-for="d in upcomingDeadlines" :key="d.id"
              class="deadline-item" :class="{ 'deadline-item--urgent': deadlineDays(d.deadline) <= 3 }"
              @click="$router.push(`/orders/${d.id}`)"
            >
              <div class="deadline-item-main">
                <span class="deadline-order-no">#{{ d.order_no }}</span>
                <span v-if="d.client_name" class="deadline-client">{{ d.client_name }}</span>
              </div>
              <div class="deadline-item-sub">
                <span>{{ formatDate(d.deadline) }}</span>
                <span class="deadline-days" :class="{ 'deadline-days--urgent': deadlineDays(d.deadline) <= 3 }">
                  {{ $t('dashboard.daysLeft', { n: deadlineDays(d.deadline) }) }}
                </span>
              </div>
            </div>
          </div>
          <p v-else class="deadline-empty">{{ $t('dashboard.noDeadlines') }}</p>
        </el-card>

        <el-card shadow="hover" class="deadline-card">
          <template #header>
            <div class="todo-header">
              <span>{{ $t('dashboard.todoCard') }}</span>
              <el-tag v-if="stats?.todayTodoCount" size="small" type="danger" effect="dark">{{ stats.todayTodoCount }}</el-tag>
            </div>
          </template>
          <div v-if="todoOrders.length" class="deadline-list">
            <div
              v-for="o in todoOrders" :key="o.id"
              class="deadline-item"
              @click="$router.push(`/orders/${o.id}`)"
            >
              <div class="deadline-item-main">
                <span class="deadline-order-no">#{{ o.order_no }}</span>
                <span v-if="o.client_name" class="deadline-client">{{ o.client_name }}</span>
              </div>
              <div class="deadline-item-sub">
                <el-tag :type="statusType(o.status)" size="small">{{ $t(`common.orderStatus.${o.status}`) }}</el-tag>
                <span v-if="isTodayDeadline(o.deadline)" class="deadline-days deadline-days--urgent">{{ $t('dashboard.dueToday') }}</span>
              </div>
            </div>
          </div>
          <p v-else class="deadline-empty">{{ $t('dashboard.noTodos') }}</p>
        </el-card>
      </div>

      <!-- 快捷操作 -->
      <h3 style="margin: 24px 0 12px">{{ $t('dashboard.quickActions') }}</h3>
      <div class="quick-actions">
        <el-button type="primary" @click="$router.push('/queue')">{{ $t('dashboard.queueBoard') }}</el-button>
        <el-button type="success" @click="$router.push('/orders?action=manual')">{{ $t('dashboard.manualOrder') }}</el-button>
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
import { ORDER_STATUS_TYPE } from '../../constants/order.js'
import { formatDateTime } from '../../utils/datetime.js'

const { t, locale } = useI18n()
const store = useArtistStore()
const stats = ref(null)
const currentStatus = ref('open')
const lastKnownStatus = ref('open') // P1-6: 回滚用

// ─── R51: 截稿日 + 今日待办 ───
const upcomingDeadlines = ref([])
const allOrders = ref([])

const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'

/** 金额分 → 元（后端返分，前端 /100；无数据 ¥0） */
function formatCents(cents) {
  return ((cents || 0) / 100).toFixed(2)
}

/** 截稿日剩余天数（0 = 今天，负数 = 已过期） */
function deadlineDays(deadline) {
  if (!deadline) return 99
  const d = new Date(deadline)
  const now = new Date()
  const dayDiff = (y, m, dd) => new Date(y, m, dd).getTime()
  return Math.round((dayDiff(d.getFullYear(), d.getMonth(), d.getDate()) - dayDiff(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
}

/** 是否今天截稿 */
function isTodayDeadline(deadline) {
  return deadlineDays(deadline) === 0
}

function formatDate(str) {
  return formatDateTime(str)
}

/** 今日待办列表：pending + revision + 今日截稿（C62 口径，与后端 todayTodoCount 一致） */
const todoOrders = computed(() =>
  allOrders.value.filter(o =>
    !['delivered', 'cancelled'].includes(o.status)
    && (['pending', 'revision'].includes(o.status) || isTodayDeadline(o.deadline))
  )
)

// ─── R8: 默认面板 ───
const PANEL_MAP = {
  queue:  { route: '/queue',        icon: '📋', labelKey: 'dashboard.panelQueue' },
  orders: { route: '/orders',       icon: '📦', labelKey: 'dashboard.panelOrders' },
  manual: { route: '/orders?action=manual', icon: '✍️', labelKey: 'dashboard.panelManual' },
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
  // R51: 截稿日列表 + 全部订单（今日待办前端过滤）
  try { upcomingDeadlines.value = await artistApi.getUpcomingDeadlines() } catch { /* ignore */ }
  try {
    const res = await artistApi.getOrders()
    allOrders.value = res.items || []
  } catch { /* ignore */ }
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

/* ─── R52: 今日统计紧凑行（始终显示） ─── */
.today-stats-row {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px; font-size: 14px; color: var(--text-secondary);
}
.today-stats-item strong { font-variant-numeric: tabular-nums; }
.today-stats-sep { color: var(--text-muted); }

/* ─── R51: 截稿日 + 今日待办卡片（始终显示，不做响应式隐藏） ─── */
.deadline-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
.deadline-card { background: var(--bg-card); }
.deadline-list { display: flex; flex-direction: column; gap: 4px; }
.deadline-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  transition: background 0.15s;
}
.deadline-item:hover { background: var(--bg-hover); }
.deadline-item--urgent { border-left: 3px solid var(--el-color-danger); }
.deadline-item-main { display: flex; align-items: center; gap: 8px; min-width: 0; }
.deadline-order-no { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.deadline-client { font-size: 13px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deadline-item-sub { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); flex-shrink: 0; }
.deadline-days { font-weight: 600; }
.deadline-days--urgent { color: var(--el-color-danger); }
.deadline-empty { color: var(--text-secondary); font-size: 13px; margin: 0; }
.todo-header { display: flex; align-items: center; justify-content: space-between; }
@media (max-width: 600px) {
  .deadline-grid { grid-template-columns: 1fr; }
}
</style>
