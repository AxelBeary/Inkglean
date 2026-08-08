<template>
  <ArtistLayout>
    <div class="tools-export-page">
      <h2 class="od-page-title">{{ $t('toolsExport.title') }}</h2>
      <p class="tools-export-sub">{{ $t('toolsExport.subtitle') }}</p>

      <!-- 导出区：日期范围 + 导出按钮 -->
      <div class="export-panel">
        <el-form label-position="top" @submit.prevent="doExport">
          <el-form-item :label="$t('toolsExport.rangeLabel')" required>
            <el-date-picker
              v-model="range"
              type="daterange"
              range-separator="—"
              :start-placeholder="$t('toolsExport.startPlaceholder')"
              :end-placeholder="$t('toolsExport.endPlaceholder')"
              value-format="YYYY-MM-DD"
              :clearable="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-button
            type="primary"
            :loading="exporting"
            :disabled="!range?.length"
            @click="doExport"
          >
            {{ $t('toolsExport.exportBtn') }}
          </el-button>
        </el-form>

        <!-- 收入概览区（日期范围选好后自动加载；订单/总收入待后端区间汇总端点） -->
        <div class="income-overview" v-if="overview || overviewLoading">
          <div class="income-overview-head">
            <h3 class="income-overview-title">{{ $t('toolsExport.incomeOverview') }}</h3>
            <span v-if="overviewLoading" class="income-overview-loading">{{ $t('toolsExport.incomeLoading') }}</span>
          </div>
          <div class="income-grid" v-if="overview">
            <!-- 05D-E2: 订单收入/总收入两格无后端区间汇总端点，隐藏占位（保留 incomeNote 说明；后端端点预留不动） -->
            <div class="income-cell">
              <span class="income-label">{{ $t('toolsExport.incomeStandalone') }}</span>
              <span class="income-value income-standalone">{{ fmtYuan(overview.standaloneCents) }}</span>
            </div>
            <div class="income-cell">
              <span class="income-label">{{ $t('toolsExport.incomeCount') }}</span>
              <span class="income-value">{{ overview.standaloneCount }}{{ $t('toolsExport.incomeCountUnit') }}</span>
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
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, watch } from 'vue'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatCents } from '../../utils/money.js'
import { artistApi } from '../../api/index.js'

const { t } = useI18n()

// 默认区间：本月 1 号 → 今天（导出最常见诉求是当月/上月对账）
function defaultRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return [fmt(first), fmt(now)]
}

const range = ref(defaultRange())
const exporting = ref(false)
const emptyHint = ref(false)

// 收入概览：散单数据来自 /api/artist/tools/standalone-incomes（口径与导出 CSV 的散单行一致）；
// 订单/总收入无区间 JSON 汇总端点（后端缺口，见交付报告），暂不展示
const overview = ref(null)
const overviewLoading = ref(false)

function fmtYuan(cents) {
  return `¥${formatCents(cents)}`
}

async function loadOverview() {
  if (!range.value?.length) return
  const [from, to] = range.value
  overviewLoading.value = true
  try {
    // 05D-I1: 收口进 artistApi（401 自动登出/15s 超时/i18n 翻译走统一拦截器）
    const data = await artistApi.getStandaloneIncomes({ from, to })
    const items = data?.items || []
    overview.value = {
      standaloneCents: items.reduce((s, it) => s + (it.amountCents || 0), 0),
      standaloneCount: items.length
    }
  } catch (err) {
    overview.value = null
    ElMessage.error(err.message || t('toolsExport.incomeLoadFailed'))
  } finally {
    overviewLoading.value = false
  }
}

// 日期范围变化自动刷新收入概览（初始加载一次）
watch(range, () => {
  if (range.value?.length) loadOverview()
}, { immediate: true })

/** 从 Content-Disposition 解析下载文件名（后端返回 income-YYYYMMDD-YYYYMMDD.csv） */
function filenameFromDisposition(header, fallback) {
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
        localStorage.removeItem('artist_logged_in')
        localStorage.removeItem('artist_is_admin')
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
    if (err?.name === 'AbortError') {
      ElMessage.error(t('toolsExport.timeout'))
      return
    }
    ElMessage.error(err.message || t('toolsExport.failed'))
  } finally {
    clearTimeout(timer)
    exporting.value = false
  }
}
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.tools-export-page { padding: 24px; max-width: 760px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.tools-export-sub { margin-top: 6px; color: var(--ink3, #888); font-size: 13px; }

.export-panel {
  margin-top: 20px;
  padding: 22px 24px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
  box-shadow: var(--sh-1, 0 1px 3px rgba(0, 0, 0, 0.06));
}
.export-empty-hint { margin-top: 16px; }
.tools-export-note { margin-top: 16px; font-size: 12px; color: var(--ink3, #888); line-height: 1.6; }
/* 收入概览：纸墨 token 卡片（--card/--ink/--hq），亮暗双主题自动适配 */
.income-overview {
  margin-top: 20px;
  padding: 18px 20px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
}
.income-overview-head { display: flex; align-items: baseline; justify-content: space-between; }
.income-overview-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }
.income-overview-loading { font-size: 12px; color: var(--ink3, #888); }
.income-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.income-cell {
  padding: 12px 14px;
  background: var(--paper, #faf8f2);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-s, 6px);
}
.income-label { display: block; font-size: 12px; color: var(--ink3, #888); margin-bottom: 6px; }
.income-value { display: block; font-size: 20px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.income-total { color: var(--ink3, #888); font-weight: 600; font-size: 14px; }
.income-standalone { color: var(--hq, #b4532a); }
.income-overview-note { margin-top: 12px; font-size: 12px; color: var(--ink3, #888); line-height: 1.6; }
</style>
