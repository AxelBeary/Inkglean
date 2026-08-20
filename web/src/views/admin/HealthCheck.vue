<!--
  HealthCheck — 系统自检页面（HC）

  GET /api/admin/health → { checks: [{ id, name, status: ok|warn|fail, summary, detail }], timestamp }
  - 结果不持久化（刷新即消失，ref 存内存）
  - 每项一张卡（状态点 + 名称 + 状态 tag + summary，可展开详情）
  - 磁盘空间项标注"仅供参考"
  - 诊断包下载：GET /api/admin/health/download（httpOnly cookie 随请求携带）
-->
<template>
  <div class="health-page">
    <!-- 页头 -->
    <div class="admin-page-head">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.health.title') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.health.refresh') }}</p>
      </div>
    </div>

    <!-- 0818 用户拍板方案 A：系统更新检查（只读信息；更新需在服务器上跑命令，面板不代执行） -->
    <el-card shadow="never" class="admin-section-card update-card">
      <template #header>
        <div class="update-head">
          <span class="card-title">{{ $t('admin.update.title') }}</span>
          <el-button size="small" text :loading="updateLoading" @click="loadVersion(true)">{{ $t('admin.update.recheck') }}</el-button>
        </div>
      </template>
      <div class="row">
        <div class="health-action-text">
          <div class="lab">{{ $t('admin.update.current') }}</div>
          <div class="desc">{{ $t('admin.update.currentHint') }}</div>
        </div>
        <span class="update-val">{{ versionText }}</span>
      </div>
      <div class="row">
        <div class="health-action-text">
          <div class="lab">{{ $t('admin.update.latest') }}</div>
          <div class="desc">{{ $t('admin.update.latestHint') }}</div>
        </div>
        <span class="update-val">{{ latestText }}</span>
      </div>
      <div class="row">
        <div class="health-action-text">
          <div class="lab">{{ $t('admin.update.status') }}</div>
          <div class="desc">{{ $t('admin.update.statusHint') }}</div>
        </div>
        <el-tag size="small" effect="light" :type="statusTagType">{{ statusText }}</el-tag>
      </div>
      <div class="row">
        <div class="health-action-text">
          <div class="lab">{{ $t('admin.update.cmd') }}</div>
          <div class="desc">{{ $t('admin.update.cmdHint') }}</div>
        </div>
        <div class="update-cmd">
          <code>{{ UPDATE_CMD }}</code>
          <el-button size="small" @click="copyUpdateCmd">{{ $t('admin.update.copy') }}</el-button>
        </div>
      </div>
    </el-card>

    <!-- 819-I：一行一事——说明在左、操作按钮在右 -->
    <div class="group health-actions-group">
      <div class="row">
        <div class="health-action-text">
          <div class="lab">{{ $t('admin.health.start') }}</div>
          <div class="desc">{{ $t('admin.health.startHint') }}</div>
        </div>
        <el-button type="primary" :loading="checking" @click="runChecks">
          {{ checking ? $t('admin.health.checking') : $t('admin.health.start') }}
        </el-button>
      </div>
      <div class="row">
        <div class="health-action-text">
          <div class="lab">{{ $t('admin.health.download') }}</div>
          <div class="desc">{{ $t('admin.health.downloadHint') }}</div>
        </div>
        <el-button :loading="downloading" :disabled="!checks.length" @click="downloadReport">{{ $t('admin.health.download') }}</el-button>
      </div>
    </div>

    <!-- 未检查：空状态 -->
    <el-card shadow="never" class="admin-section-card" v-if="!checks.length && !checking">
      <el-empty :description="$t('admin.health.emptyHint')" />
    </el-card>

    <!-- 检查结果：每项一张状态卡（派工 D） -->
    <div v-else-if="checks.length" class="health-grid">
      <el-card
        v-for="c in checks" :key="c.id" shadow="never"
        class="health-card" :class="`health-card--${c.status}`"
      >
        <button
          type="button" class="health-card-head"
          :aria-expanded="isExpanded(c.id)"
          @click="toggleExpand(c.id)"
        >
          <!-- b3 清扫：状态 class 补挂，语义色（ok/warn/fail）随状态生效 -->
          <span class="health-status" :class="`health-status--${c.status}`" aria-hidden="true">
            <el-icon><component :is="statusIcon(c.status)" /></el-icon>
          </span>
          <span class="health-name">{{ c.name }}</span>
          <el-tag size="small" effect="light" :type="{ ok: 'success', warn: 'warning', fail: 'danger' }[c.status]">
            {{ $t(`admin.health.status${c.status.charAt(0).toUpperCase() + c.status.slice(1)}`) }}
          </el-tag>
          <el-tag v-if="c.id === 'disk'" size="small" type="info">{{ $t('admin.health.diskNote') }}</el-tag>
          <span class="health-summary">{{ c.summary }}</span>
          <el-icon class="health-caret" :class="{ 'health-caret--open': isExpanded(c.id) }"><ArrowDown /></el-icon>
        </button>
        <el-collapse-transition>
          <div v-show="isExpanded(c.id)" class="health-detail-wrap">
            <pre class="health-detail">{{ JSON.stringify(c.detail, null, 2) }}</pre>
          </div>
        </el-collapse-transition>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, markRaw, computed, onMounted } from 'vue'
import type { Component } from 'vue'
import { adminApi } from '../../api/index'
import type { HealthCheckItem, SystemVersionResult } from '../../api/types'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist'
// 0818 方案 A：更新命令复制走公共剪贴板封装（同 ScheduleSharePage 口径）
import { copyText as copyToClipboard } from '../../utils/clipboard'
import { formatDateTime } from '../../utils/datetime'
// v0.34 任务3：状态 emoji 改 SVG（保留状态语义色）
import { CircleCheck, Warning, CircleClose, QuestionFilled, ArrowDown } from '@element-plus/icons-vue'

const store = useArtistStore()
const { t } = useI18n()
const checks = ref<HealthCheckItem[]>([])
const checking = ref(false)
const downloading = ref(false)
const expanded = ref<string[]>([])

// ─── 0818 方案 A：系统更新检查（进页自动拉一次；重新检查走 force 绕缓存） ───
const UPDATE_CMD = 'git pull && docker compose up -d --build'
const versionInfo = ref<SystemVersionResult | null>(null)
const updateLoading = ref(false)
const updateFailed = ref(false)

const versionText = computed(() => {
  if (updateFailed.value) return t('admin.update.loadFailed')
  if (!versionInfo.value) return '—'
  const { version, commit, deployedAt } = versionInfo.value.current
  const commitShort = commit && commit !== 'unknown' ? commit.slice(0, 7) : t('admin.update.commitUnknown')
  return deployedAt
    ? `${version} · ${commitShort} · ${formatDateTime(deployedAt)}`
    : `${version} · ${commitShort}`
})
const latestText = computed(() => {
  if (updateFailed.value || !versionInfo.value) return '—'
  const { latest } = versionInfo.value
  if (!latest.ok) return t('admin.update.statusFetchFailed')
  return latest.date ? `${latest.sha!.slice(0, 7)} · ${formatDateTime(latest.date)}` : latest.sha!.slice(0, 7)
})
const statusText = computed(() => {
  if (updateFailed.value) return t('admin.update.loadFailed')
  if (!versionInfo.value) return '—'
  const { upToDate, latest } = versionInfo.value
  if (!latest.ok) return t('admin.update.statusFetchFailed')
  if (upToDate === true) return t('admin.update.statusUpToDate')
  if (upToDate === false) return t('admin.update.statusBehind')
  return t('admin.update.statusUnknown')
})
const statusTagType = computed(() => {
  if (!versionInfo.value || updateFailed.value || !versionInfo.value.latest.ok) return 'info'
  if (versionInfo.value.upToDate === true) return 'success'
  if (versionInfo.value.upToDate === false) return 'warning'
  return 'info'
})

async function loadVersion(force = false) {
  updateLoading.value = true
  updateFailed.value = false
  try {
    versionInfo.value = await adminApi.getSystemVersion(force)
  } catch {
    updateFailed.value = true
  } finally {
    updateLoading.value = false
  }
}

async function copyUpdateCmd() {
  if (await copyToClipboard(UPDATE_CMD)) {
    ElMessage.success(t('admin.update.copied'))
  } else {
    ElMessage.error(t('admin.update.copyFailed'))
  }
}

// 进页自动拉一次版本信息（失败静默降级为错误态文案，不打断自检页主体）
onMounted(() => loadVersion())

const STATUS_ICON: Record<string, Component> = { ok: markRaw(CircleCheck), warn: markRaw(Warning), fail: markRaw(CircleClose) }
function statusIcon(status: string) { return STATUS_ICON[status] || QuestionFilled }

function isExpanded(id: string) { return expanded.value.includes(id) }
function toggleExpand(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter(x => x !== id)
    : [...expanded.value, id]
}

async function runChecks() {
  checking.value = true
  expanded.value = []
  try {
    const res = await adminApi.getHealth()
    checks.value = res.checks || []
  } catch (err) {
    ElMessage.error((err as Error).message)
    checks.value = []
  } finally {
    checking.value = false
  }
}

/** 从 Content-Disposition 解析下载文件名（后端返回 health-report-YYYY-MM-DD.json） */
function filenameFromDisposition(header: string | null, fallback: string) {
  const m = /filename="?([^";]+)"?/.exec(header || '')
  return m ? m[1] : fallback
}

async function downloadReport() {
  if (downloading.value) return
  downloading.value = true
  // 诊断包走 fetch+blob：失败仅页内报错，不再整页导航（参照 ToolsExport 下载实现）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    // httpOnly cookie 随同源 GET 请求自动携带；带 credentials 与拦截器语义一致
    const res = await fetch('/api/admin/health/download', { credentials: 'include', signal: controller.signal })
    if (!res.ok) {
      // 401 → 与 axios 拦截器一致：清会话并跳登录
      if (res.status === 401) {
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
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filenameFromDisposition(
      res.headers.get('Content-Disposition'),
      `health-report-${new Date().toISOString().slice(0, 10)}.json`
    )
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(t('admin.health.downloaded'))
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      ElMessage.error(t('admin.health.downloadTimeout'))
      return
    }
    ElMessage.error((err as Error).message || t('admin.health.downloadFailed'))
  } finally {
    clearTimeout(timer)
    downloading.value = false
  }
}
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807）——状态卡片化 ═══ */
.health-page { }

/* 819-I：分组卡片 + 一行一事（对齐 QuickNote 基准） */
.group {
  margin-bottom: 16px;
  padding: 4px 24px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}

/* 0818 方案 A：更新检查卡片（一行一事：说明在左，值/控件在右） */
.update-card { margin-bottom: 16px; }
.update-head { display: flex; align-items: center; justify-content: space-between; }
.update-val { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); font-variant-numeric: tabular-nums; text-align: right; }
.update-cmd { display: flex; align-items: center; gap: 8px; min-width: 0; }
.update-cmd code {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink);
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-m);
  padding: 4px 8px; white-space: nowrap;
}
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.health-action-text { min-width: 0; }

/* 检查结果卡片网格（2 列） */
.health-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-4, 16px); }
@media (max-width: 900px) {
  .health-grid { grid-template-columns: 1fr; }
}
.health-card {
  border-radius: var(--r-l);
  border: 1px solid var(--line);
  transition: box-shadow var(--dur-fast), border-color var(--dur-fast);
}
.health-card--ok:hover { box-shadow: var(--sh-2); }
.health-card--warn { border-left: 3px solid var(--th); }
.health-card--fail { border-left: 3px solid var(--zs); }
.health-card--ok { border-left: 3px solid var(--sl); }

.health-card-head {
  display: flex; align-items: center; gap: var(--sp-2, 8px);
  cursor: pointer; user-select: none;
  padding: var(--sp-1, 4px) 0;
  width: 100%;
  border: none; background: none; font: inherit; color: inherit; text-align: inherit;
}
.health-card-head:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
.health-status { font-size: 18px; flex: none; }
/* 状态语义色（石绿/藤黄/朱砂） */
.health-status--ok { color: var(--sl); }
.health-status--warn { color: var(--th); }
.health-status--fail { color: var(--zs); }
.health-card :deep(.el-card__body) { padding: var(--sp-4, 16px); }
.health-name { font-weight: 700; color: var(--ink); flex: none; }
.health-summary { margin-left: auto; font-size: 13px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
.health-caret { color: var(--ink3); font-size: 14px; flex: none; transition: transform var(--dur-fast) ease-out; }
.health-caret--open { transform: rotate(180deg); }

/* 详情面板（跟随主题底色，不硬编码白底灰字） */
.health-detail-wrap { margin-top: var(--sp-3, 12px); }
.health-detail {
  margin: 0;
  padding: 12px;
  background: var(--paper2);
  color: var(--ink);
  border-radius: var(--r-m);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
