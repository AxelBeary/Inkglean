<template>
  <!-- 自定义首页批二（子代理 E）：截稿倒计时（可选板块，板块库添加后才上首页）
       数据源 = artistApi.getDeadlineSoon()；色点三态：逾期朱砂/今天藤黄/未来花青（原型 820）；
       maxRows 密度截断由父层消费 prefs.density.ddlSoon，只截显示不改拉取 -->
  <el-card shadow="hover" class="ddl-card">
    <template #header>
      <CardHead :title="t('dashboardPrefs.moduleDdlSoon')" />
    </template>

    <!-- 错误态 -->
    <div v-if="state === 'error'" class="module-error">
      <span>{{ t('dashboardPrefs.moduleLoadError') }}</span>
      <el-button size="small" @click="load">{{ t('dashboardPrefs.retry') }}</el-button>
    </div>

    <!-- 加载态：骨架条 -->
    <div v-else-if="state === 'loading'" class="ddl-skeleton" aria-hidden="true">
      <div v-for="i in 3" :key="i" class="ddl-skeleton-row"></div>
    </div>

    <!-- 空态 -->
    <p v-else-if="!items.length" class="ddl-empty">{{ t('dashboardPrefs.ddlSoonEmpty') }}</p>

    <!-- 列表：点行跳订单详情（与 ActivityFeed 同口径） -->
    <div v-else class="ddl-list">
      <button
        v-for="item in visibleItems"
        :key="item.id"
        type="button"
        class="ddl-row"
        @click="goOrder(item.id)"
      >
        <span class="ddl-dot" :class="'ddl-dot--' + toneOf(item.daysLeft)"></span>
        <span class="ddl-name">{{ displayName(item) }}</span>
        <span class="ddl-due" :class="{ late: toneOf(item.daysLeft) === 'overdue' }">{{ dueText(item.daysLeft) }}</span>
      </button>
      <p v-if="hiddenCount > 0" class="row-more">{{ t('dashboard.listMore', { n: hiddenCount }) }}</p>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { artistApi } from '../../../api/index'
import type { DeadlineSoonItem } from '../../../api/types'
import CardHead from '../visual/CardHead.vue'
import { classifyDeadline, deadlineLabel } from '../../../utils/ddl-soon'
import type { DdlTone } from '../../../utils/ddl-soon'

const props = withDefaults(defineProps<{
  /** 显示行数上限（0=全部；父层消费 prefs.density.ddlSoon），只截显示不改拉取 */
  maxRows?: number
}>(), {
  maxRows: 0
})

const { t } = useI18n()
const router = useRouter()
const state = ref<'loading' | 'ok' | 'error'>('loading')
const items = ref<DeadlineSoonItem[]>([])

/** 密度截断：maxRows>0 时只显示前 N 条 */
const visibleItems = computed(() => props.maxRows > 0 ? items.value.slice(0, props.maxRows) : items.value)
const hiddenCount = computed(() => props.maxRows > 0 ? Math.max(0, items.value.length - props.maxRows) : 0)

function toneOf(daysLeft: number): DdlTone {
  return classifyDeadline(daysLeft)
}
function dueText(daysLeft: number): string {
  const label = deadlineLabel(daysLeft)
  return t(label.key, label.params ?? {})
}
/** 客户名优先，无名落单号（clientName 可空，后端契约） */
function displayName(item: DeadlineSoonItem): string {
  return item.clientName || `#${item.orderNo}`
}
function goOrder(id: number) {
  void router.push(`/orders/${id}`)
}

async function load() {
  state.value = 'loading'
  try {
    const res = await artistApi.getDeadlineSoon()
    items.value = res.items ?? []
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

onMounted(() => load())
</script>

<style scoped>
/* 纸墨卡片（与 ActivityFeed 同手法：纸边圆角 + hover 只深阴影不抬升） */
.ddl-card {
  background: var(--card);
  border: none;
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-2);
}

.ddl-list { display: flex; flex-direction: column; }
.ddl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px dashed var(--line);
  border-radius: var(--r-s);
  cursor: pointer;
  width: 100%;
  border-left: none;
  border-right: none;
  border-top: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: inherit;
  transition: background var(--dur-fast) var(--ease-out);
}
.ddl-row:last-child { border-bottom: none; }
.ddl-row:hover { background: var(--paper2); }

/* 三态色点：逾期朱砂 / 今天藤黄 / 未来花青 */
.ddl-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ddl-dot--overdue { background: var(--zs); }
.ddl-dot--today { background: var(--th); }
.ddl-dot--future { background: var(--hq); }

.ddl-name {
  flex: 1;
  min-width: 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ddl-due {
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ddl-due.late { color: var(--zs); }

/* 密度截断提示（自定义首页批一，与 ActivityFeed 同口径） */
.row-more { margin: 8px 4px 0; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); }

.ddl-empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
}

/* 骨架条（脉动） */
.ddl-skeleton { display: flex; flex-direction: column; gap: 8px; }
.ddl-skeleton-row {
  height: 32px;
  border-radius: var(--r-m);
  background: var(--paper2);
  animation: ddl-pulse 1.2s ease-in-out infinite;
}
@keyframes ddl-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* 错误态（与 ActivityFeed 同口径） */
.module-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink2);
}
</style>
