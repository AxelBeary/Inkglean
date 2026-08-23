<template>
  <div class="tools-export-page">
    <h2 class="od-page-title">{{ $t('toolsExport.title') }}</h2>
    <p class="page-sub">{{ $t('toolsExport.subtitle') }}</p>

    <!-- 818-H：导出区按行结构整理（说明在左、控件在右） -->
    <div class="page-card export-panel">
      <div class="group-head">{{ $t('toolsExport.groupRange') }}</div>
      <el-form @submit.prevent="doExport">
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ $t('toolsExport.rangeLabel') }}</div>
            <div class="desc">{{ $t('toolsExport.rangeDesc') }}</div>
          </div>
          <div class="ctrl">
            <el-date-picker
              v-model="range"
              type="daterange"
              range-separator="—"
              :start-placeholder="$t('toolsExport.startPlaceholder')"
              :end-placeholder="$t('toolsExport.endPlaceholder')"
              value-format="YYYY-MM-DD"
              :clearable="false"
              class="te-range"
            />
          </div>
        </div>
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ $t('toolsExport.exportBtn') }}</div>
            <div class="desc">{{ $t('toolsExport.exportDesc') }}</div>
          </div>
          <div class="ctrl">
            <el-button
              type="primary"
              :loading="exporting"
              :disabled="!range?.length"
              @click="doExport"
            >
              {{ $t('toolsExport.exportBtn') }}
            </el-button>
          </div>
        </div>
      </el-form>

      <!-- 收入概览区（日期范围选好后自动加载；t1 围剿：消费 income-summary，口径对齐导出 CSV） -->
      <div class="income-overview" v-if="overview || overviewLoading">
        <div class="income-overview-head">
          <h3 class="income-overview-title">{{ $t('toolsExport.incomeOverview') }}</h3>
          <span v-if="overviewLoading" class="income-overview-loading">{{ $t('toolsExport.incomeLoading') }}</span>
        </div>
        <div class="income-grid" v-if="overview">
          <div class="income-cell">
            <span class="income-label">{{ $t('toolsExport.incomeOrder') }}</span>
            <span class="income-value">{{ formatYuan(overview.orderIncomeCents) }}</span>
          </div>
          <div class="income-cell">
            <span class="income-label">{{ $t('toolsExport.incomeStandalone') }}</span>
            <span class="income-value income-standalone">{{ formatYuan(overview.standaloneIncomeCents) }}</span>
          </div>
          <div class="income-cell">
            <span class="income-label">{{ $t('toolsExport.incomeTotal') }}</span>
            <span class="income-value">{{ formatYuan(overview.totalCents) }}</span>
          </div>
        </div>
        <p class="income-overview-note">{{ $t('toolsExport.incomeNote') }}</p>
      </div>

      <!-- 空数据提示（后端空 CSV 仅表头 → 前端检测行数） -->
      <el-alert
        v-if="emptyHint"
        type="info"
        :closable="false"
        show-icon
        class="export-empty-hint"
      >
        {{ $t('toolsExport.emptyHint') }}
      </el-alert>

      <p class="tools-export-note">{{ $t('toolsExport.note') }}</p>
    </div>

    <!-- oimimo 吸纳批四：收入趋势图（与上方收入概览/导出 CSV 同源同口径） -->
    <div class="page-card export-panel">
      <div class="group-head">{{ $t('toolsExport.incomeTrend') }}</div>
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('toolsExport.incomeTrendLabel') }}</div>
          <div class="desc">{{ $t('toolsExport.incomeTrendDesc') }}</div>
        </div>
      </div>
      <IncomeTrendCharts />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatYuan } from '../../utils/money'
import { todayStr } from '../../utils/datetime'
import { artistApi } from '../../api/index'
import { useArtistStore } from '../../stores/artist'
import IncomeTrendCharts from '../../components/artist/IncomeTrendCharts.vue'
import type { IncomeSummaryResult } from '../../api/types'

const { t } = useI18n()
const store = useArtistStore()

// 默认区间：本月 1 号 → 今天（导出最常见诉求是当月/上月对账）
function defaultRange(): [string, string] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return [fmt(first), todayStr()]
}

const range = ref<[string, string] | null>(defaultRange())
const exporting = ref(false)
const emptyHint = ref(false)

// t1 围剿修复：收入概览改消费 /api/artist/tools/income-summary（订单收款+散单，与导出 CSV 同源同口径）；
// 此前只统散单而 CSV 合并两源，对账时概览数字与 CSV 明显不一致
const overview = ref<IncomeSummaryResult | null>(null)
const overviewLoading = ref(false)
/** a1: 请求序号——快速切换日期范围时旧响应不得覆盖新概览 */
let overviewSeq = 0

async function loadOverview() {
  if (!range.value?.length) return
  const [from, to] = range.value
  const mySeq = ++overviewSeq
  overviewLoading.value = true
  try {
    // 05D-I1: 收口进 artistApi（401 自动登出/15s 超时/i18n 翻译走统一拦截器）
    const res = await artistApi.getIncomeSummary({ from, to })
    if (mySeq !== overviewSeq) return
    overview.value = res
  } catch (err) {
    if (mySeq !== overviewSeq) return
    overview.value = null
    ElMessage.error((err instanceof Error ? err.message : '') || t('toolsExport.incomeLoadFailed'))
  } finally {
    if (mySeq === overviewSeq) overviewLoading.value = false
  }
}

// 日期范围变化自动刷新收入概览（初始加载一次）
watch(range, () => {
  if (range.value?.length) loadOverview()
}, { immediate: true })

onUnmounted(() => { overviewSeq++ }) // a1: 卸载后在途概览响应作废

/** 从 Content-Disposition 解析下载文件名（后端返回 income-YYYYMMDD-YYYYMMDD.csv） */
function filenameFromDisposition(header: string | null, fallback: string): string {
  const m = /filename="?([^";]+)"?/.exec(header || '')
  return m ? m[1] : fallback
}

async function doExport() {
  if (!range.value?.length || exporting.value) return
  const [from, to] = range.value
  exporting.value = true
  emptyHint.value = false
  // 05D-E1: CSV blob 下载保留 fetch（不经 JSON 拦截器），但补 15s 超时 + 401 登出（对齐 axios 拦截器行为）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    // token 在 httpOnly cookie → 必须带 credentials；CSV 走 blob 下载（不经过 axios JSON 拦截器）
    const res = await fetch(`/api/artist/tools/export.csv?from=${from}&to=${to}`, { credentials: 'include', signal: controller.signal })
    if (!res.ok) {
      // 05D-E1: 401 → 与拦截器一致清认证并跳登录
      if (res.status === 401) {
        // REQ-043 I6-e: 清会话统一走 store action（store 为准，localStorage 由 action 清理）
        store.logout()
        window.location.href = '/login'
        return
      }
      let msg = `HTTP ${res.status}`
      try {
        const data = await res.json()
        if (data?.error) msg = data.error
      } catch { /* 非 JSON 错误体，用状态码兜底 */ }
      throw new Error(msg)
    }
    const text = await res.text()
    // 空数据：后端只返回表头行（无 BOM 前导数据行）→ 提示不下载
    if (text.split(/\r?\n/).filter(Boolean).length <= 1) {
      emptyHint.value = true
      return
    }
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filenameFromDisposition(res.headers.get('Content-Disposition'), `income-${from.replace(/-/g, '')}-${to.replace(/-/g, '')}.csv`)
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(t('toolsExport.downloaded'))
  } catch (err) {
    // 05D-E1: AbortController 超时 → 专用提示
    if ((err as { name?: string })?.name === 'AbortError') {
      ElMessage.error(t('toolsExport.timeout'))
      return
    }
    ElMessage.error((err instanceof Error ? err.message : '') || t('toolsExport.failed'))
  } finally {
    clearTimeout(timer)
    exporting.value = false
  }
}
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
/* 页宽归一批：移除页级限宽 760px，交给 ArtistLayout 内容容器统一管（--page-max-w） */
.tools-export-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; }

.export-panel {
  margin-top: 20px;
  padding: 4px 24px 16px;
}

/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点 */
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
/* 824 响应式巡逻：:deep() 让 scope 挂 .row 侧——EP 日期控件根元素不接父级 scope 属性，
   普通加权选择器打不中；窄容器下吃满 .ctrl 不溢出卡片（390 实测溢出 23px） */
.row :deep(.te-range) { width: 100%; max-width: 420px; }
.export-empty-hint { margin-top: 16px; }
.tools-export-note { margin-top: 16px; font-size: 12px; color: var(--ink3); line-height: 1.6; }
/* 收入概览：纸墨 token 卡片（--card/--ink/--hq），亮暗双主题自动适配 */
.income-overview {
  margin-top: 20px;
  padding: 18px 20px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-m, 8px);
}
.income-overview-head { display: flex; align-items: baseline; justify-content: space-between; }
.income-overview-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }
.income-overview-loading { font-size: 12px; color: var(--ink3); }
.income-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.income-cell {
  padding: 12px 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-s, 6px);
}
.income-label { display: block; font-size: 12px; color: var(--ink3); margin-bottom: 6px; }
.income-value { display: block; font-size: 20px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.income-total { color: var(--ink3); font-weight: 600; font-size: 14px; }
.income-standalone { color: var(--hq); }
.income-overview-note { margin-top: 12px; font-size: 12px; color: var(--ink3); line-height: 1.6; }

/* 页宽容器查询收尾批：@media 改 @container 认容器宽（.row 为页内双列字段行，非视口语义） */
@container (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
