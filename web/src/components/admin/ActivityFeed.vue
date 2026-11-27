<template>
  <!-- v86 事件流水幕布（步 2）：管理员面板上的实时事件流水。
       设计口径见 AGENTS/eventfeed-20261128/SPEC.md §4 步 2 与任务书：
       轮询优先（全仓无 SSE 先例）/ 断线明示状态不静默空屏 / 按事件类型着色 / 可暂停 / 可筛选。 -->
  <div class="afeed" :class="`afeed--${status}`" data-testid="activity-feed">
    <!-- 一行一事：说明在左、控件在右（对齐本页 gb-filter-row 范式） -->
    <div class="afeed-bar">
      <div class="afeed-bar-text">
        <div class="lab">{{ t('admin.activity.title') }}</div>
        <div class="desc">{{ t('admin.activity.desc') }}</div>
      </div>
      <div class="afeed-controls">
        <el-select
          :model-value="filters.action"
          size="small" clearable class="afeed-select-pos"
          :placeholder="t('admin.activity.filterActionAll')"
          data-testid="afeed-action-filter"
          @change="onActionFilterChange"
        >
          <el-option v-for="a in actionOptions" :key="a" :value="a" :label="actionLabel(a)" />
        </el-select>
        <el-select
          :model-value="filters.actorKind"
          size="small" clearable class="afeed-select-actor"
          :placeholder="t('admin.activity.filterActorAll')"
          data-testid="afeed-actor-filter"
          @change="onActorFilterChange"
        >
          <el-option v-for="k in actorKinds" :key="k" :value="k" :label="t(`admin.activity.actor.${k}`)" />
        </el-select>
        <el-button
          size="small" :type="paused ? 'warning' : 'default'" plain
          data-testid="afeed-pause"
          @click="togglePause"
        >
          {{ paused ? t('admin.activity.resume') : t('admin.activity.pause') }}
        </el-button>
      </div>
    </div>

    <!-- 连接状态：四态各自明确，绝不静默空屏 -->
    <div v-if="status === 'error'" class="afeed-banner afeed-banner--error" role="alert" data-testid="afeed-error">
      <span>{{ t('admin.activity.loadFailed') }}</span>
      <el-button size="small" data-testid="afeed-retry" @click="retry">{{ t('dashboard.retry') }}</el-button>
    </div>
    <div v-else-if="status === 'stale'" class="afeed-banner afeed-banner--stale" role="status" data-testid="afeed-stale">
      <span>{{ t('admin.activity.stale', { time: lastSuccessText }) }}</span>
      <el-button size="small" data-testid="afeed-retry" @click="retry">{{ t('dashboard.retry') }}</el-button>
    </div>
    <div v-else-if="paused" class="afeed-banner afeed-banner--paused" role="status" data-testid="afeed-paused">
      <span>{{ t('admin.activity.pausedHint') }}</span>
    </div>
    <div v-else class="afeed-banner afeed-banner--live" role="status" data-testid="afeed-live">
      <span class="afeed-dot" aria-hidden="true"></span>
      <span>{{ t('admin.activity.live') }}</span>
    </div>

    <!-- 流水列表：网格行（对齐本页 gb-list 范式），窄屏纵向卡片 -->
    <div v-if="loading" class="afeed-skeleton" data-testid="afeed-loading">{{ t('common.loading') }}</div>
    <template v-else-if="rows.length">
      <div class="afeed-list-head">
        <span class="afeed-col afeed-col--time">{{ t('admin.activity.colTime') }}</span>
        <span class="afeed-col afeed-col--actor">{{ t('admin.activity.colActor') }}</span>
        <span class="afeed-col afeed-col--action">{{ t('admin.activity.colAction') }}</span>
        <span class="afeed-col afeed-col--target">{{ t('admin.activity.colTarget') }}</span>
        <span class="afeed-col afeed-col--ip">{{ t('admin.activity.colIp') }}</span>
      </div>
      <TransitionGroup tag="div" name="afeed-row" class="afeed-list">
        <div
          v-for="row in rows" :key="row.id"
          class="afeed-row" :class="rowClass(row)"
          :data-testid="`afeed-row-${row.action}`"
        >
          <span class="afeed-col afeed-col--time" :data-label="t('admin.activity.colTime')">
            {{ formatDateTime(new Date(row.at).toISOString()) }}
          </span>
          <span class="afeed-col afeed-col--actor" :data-label="t('admin.activity.colActor')">
            <span class="afeed-actor-dot" :class="`afeed-actor-dot--${row.actorKind}`" aria-hidden="true"></span>
            {{ t(`admin.activity.actor.${row.actorKind}`) }}<template v-if="row.actorId != null"> #{{ row.actorId }}</template>
          </span>
          <span class="afeed-col afeed-col--action" :data-label="t('admin.activity.colAction')">
            <span class="afeed-tag" :class="`afeed-tag--${row.outcome === 'fail' ? 'fail' : actionTone(row.action)}`">
              {{ actionLabel(row.action) }}
            </span>
            <span v-if="metaSummary(row)" class="afeed-meta">{{ metaSummary(row) }}</span>
          </span>
          <span class="afeed-col afeed-col--target" :data-label="t('admin.activity.colTarget')">
            {{ targetText(row) }}
          </span>
          <span class="afeed-col afeed-col--ip" :data-label="t('admin.activity.colIp')">
            <code v-if="row.ip" class="afeed-ip">{{ row.ip }}</code>
            <span v-else class="afeed-dash">—</span>
          </span>
        </div>
      </TransitionGroup>
      <div class="afeed-foot">
        <el-button v-if="hasMore" size="small" text data-testid="afeed-load-more" @click="loadMore">
          {{ t('admin.activity.loadMore') }}
        </el-button>
        <span v-else class="afeed-end">{{ t('admin.activity.noMore') }}</span>
      </div>
    </template>
    <!-- 空态只在「确实没有事件」时出现：错误态已由上方横幅全权表达，
         两者同时显示会让用户以为"没数据"而非"加载失败"（本批测试 TC-AF-05 实测踩到） -->
    <el-empty
      v-else-if="status !== 'error'"
      :description="t('admin.activity.empty')"
      data-testid="afeed-empty"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { activityApi } from '../../api/index'
import type { ActivityActorKind, ActivityEventItem } from '../../api/types'
import { formatDateTime } from '../../utils/datetime'
import { useActivityFeed } from './useActivityFeed'

const { t } = useI18n()

const { rows, loading, status, paused, lastSuccessAt, hasMore, filters,
  loadMore, applyFilters, togglePause, retry } = useActivityFeed()

/** 筛选下拉的 action 枚举：由后端 /filters 下发（与 ACTIONS 常量同源，不在前端写死） */
const actionOptions = ref<string[]>([])
/** actorKind 四态（后端下发的兜底默认值：库层 CHECK 固定四态） */
const actorKinds = ref<ActivityActorKind[]>(['admin', 'artist', 'client', 'anon'])

onMounted(async () => {
  try {
    const f = await activityApi.getActivityFilters()
    actionOptions.value = f.actions
    if (f.actorKinds?.length) actorKinds.value = f.actorKinds
  } catch {
    // 枚举拉不到不阻塞幕布主功能：下拉退化为只有「全部」，事件本体照常显示
    actionOptions.value = []
  }
})

/**
 * 筛选变更 handler（具名函数而非模板内联箭头：vue-tsc 下内联箭头参数会退化为 any，
 * 与 web/src/views/admin/AdminDashboard.vue 的 artistStatusType 具名化同因）
 */
function onActionFilterChange(v: string | null | undefined): void {
  void applyFilters({ action: v || '' })
}
function onActorFilterChange(v: ActivityActorKind | null | undefined): void {
  void applyFilters({ actorKind: v || '' })
}

/** i18n 查不到就回退原始 action 名（后端新增事件时前端不至于显示 key） */
function actionLabel(action: string): string {
  const key = `admin.activity.action.${action}`
  const label = t(key)
  return label === key ? action : label
}

/**
 * 按事件类型着色：认证（墨蓝）/ 管理动作（朱砂）/ 交易上传（石绿）。
 * 失败一律压制为朱砂深色（outcome='fail' 优先于类型色）。
 */
type Tone = 'auth' | 'admin' | 'trade'
function actionTone(action: string): Tone {
  if (action.startsWith('login_') || action === 'stepup_fail') return 'auth'
  if (action === 'order_create' || action === 'reference_upload'
    || action === 'report_submit' || action === 'guestbook_post') return 'trade'
  return 'admin'
}

function rowClass(row: ActivityEventItem): string {
  return `afeed-row--${row.outcome === 'fail' ? 'fail' : actionTone(row.action)}`
}

function targetText(row: ActivityEventItem): string {
  if (!row.targetType && row.targetId == null) return '—'
  const tt = row.targetType
  let label = ''
  if (tt) {
    const key = `admin.activity.target.${tt}`
    const translated = t(key)
    label = translated === key ? tt : translated
  }
  return row.targetId != null ? `${label} #${row.targetId}`.trim() : label
}

/** meta 摘要：只挑排障关心的两个字段（reason / method），绝不整段平铺（含内部归因） */
function metaSummary(row: ActivityEventItem): string {
  const parts: string[] = []
  const method = row.meta?.method
  if (typeof method === 'string') parts.push(method)
  const reason = row.meta?.reason
  if (typeof reason === 'string' && row.outcome === 'fail') parts.push(reason)
  const orderNo = row.meta?.orderNo
  if (typeof orderNo === 'string') parts.push(orderNo)
  return parts.join(' · ')
}

const lastSuccessText = computed(() =>
  lastSuccessAt.value ? formatDateTime(new Date(lastSuccessAt.value).toISOString()) : '—'
)
</script>

<style scoped>
/* 幕布本体：与 AdminDashboard 的 gb-* 列表同款纸墨骨架，行级淡入用 var(--dur-mid) */
.afeed { margin-top: var(--sp-4, 16px); }

.afeed-bar {
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.afeed-bar-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.afeed-controls { display: flex; gap: var(--sp-2, 8px); flex-wrap: wrap; justify-content: flex-end; }
.afeed-select-pos { width: 168px; }
.afeed-select-actor { width: 128px; }

/* 状态横幅四态：live 静默克制 / paused 墨灰 / stale 警示黄 / error 朱砂 */
.afeed-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-bottom: 10px;
  border-radius: var(--r-m); font-size: 12.5px;
}
.afeed-banner--live { background: var(--hq-t); color: var(--ink2); }
.afeed-banner--paused { background: var(--paper2); color: var(--ink2); }
.afeed-banner--stale { background: var(--hq-t); color: var(--ink); justify-content: space-between; }
.afeed-banner--error {
  background: var(--zs-t); color: var(--zs);
  justify-content: space-between; font-size: 13px;
}
.afeed-dot {
  width: 7px; height: 7px; border-radius: 50%; background: var(--shilv, #6f8f6a);
  animation: afeed-pulse 2s ease-in-out infinite;
}
@keyframes afeed-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }

.afeed-skeleton { padding: 24px 12px; color: var(--ink3); font-size: 13px; text-align: center; }

/* 网格行：列宽对齐 admin 列表范式；窄屏改纵向卡片 */
.afeed-list-head,
.afeed-row {
  display: grid;
  grid-template-columns: 150px 130px minmax(180px, 1fr) 140px 130px;
  gap: 8px; align-items: center;
  padding: 8px 12px; box-sizing: border-box;
}
.afeed-list-head {
  font-size: 12px; font-weight: 500; color: var(--ink2);
  background: var(--paper2);
  border: 1px solid var(--line); border-bottom: none;
  border-radius: var(--r-m) var(--r-m) 0 0;
}
.afeed-list {
  position: relative; max-height: 420px; overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 0 0 var(--r-m) var(--r-m);
}
.afeed-row {
  background: var(--card); border-bottom: 1px solid var(--line);
  font-size: 13px; color: var(--ink);
  border-left: 3px solid transparent;
}
.afeed-row:last-child { border-bottom: none; }
/* 按事件类型着色：左缘色条（auth 墨蓝 / admin 朱砂 / trade 石绿 / fail 深朱砂） */
.afeed-row--auth { border-left-color: var(--mo, #4a5b7a); }
.afeed-row--admin { border-left-color: var(--zs, #a8443a); }
.afeed-row--trade { border-left-color: var(--shilv, #6f8f6a); }
.afeed-row--fail { border-left-color: var(--zs-deep, #7d2b23); background: var(--zs-t); }

.afeed-col { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.afeed-col--ip { text-align: right; }
.afeed-ip {
  font-size: 12px; color: var(--ink2);
  background: var(--paper2); padding: 2px 6px; border-radius: var(--r-s);
}
.afeed-dash { color: var(--ink3); }

.afeed-tag {
  display: inline-block; padding: 2px 8px; border-radius: var(--r-s);
  font-size: 12px; line-height: 1.5;
  background: var(--paper2); color: var(--ink);
}
.afeed-tag--auth { background: var(--hq-t); color: var(--ink); }
.afeed-tag--admin { background: var(--zs-t); color: var(--zs); }
.afeed-tag--trade { background: var(--hq-t); color: var(--ink2); }
.afeed-tag--fail { background: var(--zs-t); color: var(--zs); font-weight: 600; }
.afeed-meta { margin-left: 6px; font-size: 11.5px; color: var(--ink3); }

.afeed-actor-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  margin-right: 5px; vertical-align: middle; background: var(--ink3);
}
.afeed-actor-dot--admin { background: var(--zs, #a8443a); }
.afeed-actor-dot--artist { background: var(--shilv, #6f8f6a); }
.afeed-actor-dot--client { background: var(--mo, #4a5b7a); }
.afeed-actor-dot--anon { background: var(--ink3); }

.afeed-foot { display: flex; justify-content: center; align-items: center; padding: 10px 0; }
.afeed-end { font-size: 12px; color: var(--ink3); }

.afeed-row-enter-active,
.afeed-row-leave-active { transition: opacity var(--dur-mid); }
.afeed-row-enter-from,
.afeed-row-leave-to { opacity: 0; }

/* 断点对齐 AdminLayout / admin-common.css：900 / 600 */
@media (max-width: 900px) {
  .afeed-select-pos { width: 140px; }
  .afeed-select-actor { width: 110px; }
}
@media (max-width: 720px) {
  .afeed-bar { grid-template-columns: 1fr; }
  .afeed-controls { justify-content: flex-start; }
}
@media (max-width: 600px) {
  .afeed-list-head { display: none; }
  .afeed-row {
    grid-template-columns: 1fr auto;
    row-gap: 6px;
    padding: 12px;
    align-items: start;
  }
  .afeed-col--action,
  .afeed-col--target { grid-column: 1 / -1; }
  .afeed-col--time { grid-column: 1; }
  .afeed-col--ip { grid-column: 2; text-align: right; }
  .afeed-col--actor { grid-column: 1 / -1; }
  .afeed-col--time::before,
  .afeed-col--actor::before,
  .afeed-col--action::before,
  .afeed-col--target::before,
  .afeed-col--ip::before {
    content: attr(data-label);
    display: block;
    font-size: 11px;
    color: var(--ink3);
    margin-bottom: 3px;
  }
  .afeed-col--action,
  .afeed-col--target { white-space: normal; overflow: visible; text-overflow: clip; }
}
</style>
