<template>
  <el-card shadow="hover" class="activity-card">
    <template #header>
      <CardHead :title="$t('dashboard.activityTitle')" />
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
      <button
        v-for="item in items" :key="item.id"
        type="button"
        class="activity-item"
        @click="$router.push(`/orders/${item.orderId}`)"
      >
        <span class="activity-dot"></span>
        <div class="activity-body">
          <span class="activity-desc">{{ item.description }}</span>
          <span class="activity-meta">
            <span class="activity-no">#{{ item.orderNo }}</span>
            <span class="activity-time">· {{ fmtRelativeTime(item.createdAt) }}</span>
          </span>
        </div>
      </button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../../api/index.js'
// v0.38 第二批: 统一卡片头部（REQ-026 §二）
import CardHead from '../visual/CardHead.vue'
import { normalizeActivity, relativeTime } from '../../../utils/dashboard-normalize.js'

/** normalizeActivity 返回条目类型（随工具函数推断，不重复手写） */
type FeedItem = ReturnType<typeof normalizeActivity>[number]

const { t, locale } = useI18n()
const state = ref('loading') // loading | ok | error
const items = ref<FeedItem[]>([])

/** 相对时间包装（传入 i18n 上下文） */
function fmtRelativeTime(isoStr: string | null) {
  return relativeTime(isoStr ?? '', t, locale.value)
}

async function load() {
  state.value = 'loading'
  try {
    const res = await artistApi.getDashboardActivity()
    items.value = normalizeActivity(res)
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

onMounted(() => load())
</script>

<style scoped>
/* v0.38 第二批: 纸墨 token（第一批白名单内补漏） */
.activity-card {
  background: var(--card);
  border: none;
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-2);
}
/* hover 只加深纸底阴影，不抬升（参照 GreetingNote/LedgerTodo 卡片） */
.activity-card.is-hover-shadow:hover { box-shadow: var(--sh-2); }

.activity-list { display: flex; flex-direction: column; }
.activity-item {
  display: flex; gap: 10px; padding: 10px 4px;
  border-bottom: 1px solid var(--line);
  border-radius: 4px; cursor: pointer;
  width: 100%; border-left: none; border-right: none; border-top: none;
  background: none; font: inherit; color: inherit; text-align: inherit;
  transition: background var(--dur-fast) var(--ease-out);
}
.activity-item:last-child { border-bottom: none; }
.activity-item:hover { background: var(--paper2); }
.activity-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--hq); flex-shrink: 0;
  margin-top: 6px;
}
.activity-body { min-width: 0; }
.activity-desc {
  display: block; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.activity-meta {
  display: flex; align-items: baseline; gap: 6px;
  font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4);
}
.activity-no { font-family: var(--f-d); font-variant-numeric: tabular-nums; }
.activity-time { white-space: nowrap; }

.activity-empty { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 13px); margin: 0; }

/* 骨架条 */
.activity-skeleton { display: flex; flex-direction: column; gap: 10px; }
.activity-skeleton-row {
  height: 32px; border-radius: var(--r-m);
  background: var(--paper2);
  animation: activity-pulse 1.2s ease-in-out infinite;
}
@keyframes activity-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* 错误态 */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
</style>
