<template>
  <el-card shadow="hover" class="activity-card">
    <template #header>
      <span class="activity-title">{{ $t('dashboard.activityTitle') }}</span>
    </template>

    <!-- 错误态 -->
    <div v-if="state === 'error'" class="module-error">
      <span>{{ $t('dashboard.activityError') }}</span>
      <el-button size="small" @click="load">{{ $t('dashboard.retry') }}</el-button>
    </div>

    <!-- 加载态：骨架条 -->
    <div v-else-if="state === 'loading'" class="activity-skeleton">
      <div v-for="i in 3" :key="i" class="activity-skeleton-row"></div>
    </div>

    <!-- 空状态 -->
    <p v-else-if="!items.length" class="activity-empty">{{ $t('dashboard.activityEmpty') }}</p>

    <!-- 活动流（最多 10 条，C54；不自动刷新，C55） -->
    <div v-else class="activity-list">
      <div
        v-for="item in items" :key="item.id"
        class="activity-item"
        @click="$router.push(`/orders/${item.orderId}`)"
      >
        <span class="activity-dot"></span>
        <div class="activity-body">
          <span class="activity-desc">{{ item.description }}</span>
          <span class="activity-meta">#{{ item.orderNo }} · {{ relativeTime(item.createdAt) }}</span>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../../api/index.js'

const { t, locale } = useI18n()
const state = ref('loading') // loading | ok | error
const items = ref([])

/** 相对时间（前端计算，验收 4.6） */
function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return t('dashboard.timeJustNow')
  if (mins < 60) return t('dashboard.timeMinutesAgo', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('dashboard.timeHoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('dashboard.timeDaysAgo', { n: days })
  // 超过 30 天显示日期
  return new Date(isoStr).toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
}

/** 归一化后端返回（已对齐三号 dashboard.service.js：content 字段） */
function normalize(raw) {
  const list = raw?.items || raw?.activities || raw || []
  items.value = (Array.isArray(list) ? list : []).slice(0, 10).map(a => ({
    id: a.id,
    orderId: a.orderId ?? a.order_id ?? null,
    orderNo: a.orderNo ?? a.order_no ?? '',
    description: a.content ?? a.description ?? a.text ?? a.event ?? '',
    createdAt: a.createdAt ?? a.created_at ?? null
  }))
}

async function load() {
  state.value = 'loading'
  try {
    const res = await artistApi.getDashboardActivity()
    normalize(res)
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

onMounted(() => load())
</script>

<style scoped>
.activity-card { background: var(--bg-card); }
.activity-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }

.activity-list { display: flex; flex-direction: column; }
.activity-item {
  display: flex; gap: 10px; padding: 8px 4px;
  border-radius: 6px; cursor: pointer;
  transition: background 0.15s;
}
.activity-item:hover { background: var(--bg-hover); }
.activity-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-primary); flex-shrink: 0;
  margin-top: 6px;
}
.activity-body { min-width: 0; }
.activity-desc {
  display: block; font-size: 13px; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.activity-meta { font-size: 11px; color: var(--text-muted); }

.activity-empty { color: var(--text-secondary); font-size: 13px; margin: 0; }

/* 骨架条 */
.activity-skeleton { display: flex; flex-direction: column; gap: 10px; }
.activity-skeleton-row {
  height: 32px; border-radius: 6px;
  background: var(--bg-secondary, #f0f0f0);
  animation: activity-pulse 1.2s ease-in-out infinite;
}
@keyframes activity-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* 错误态 */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: 13px; color: var(--text-secondary);
}
</style>
