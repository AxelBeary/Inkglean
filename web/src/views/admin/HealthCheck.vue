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
    <div class="admin-page-head admin-page-head--actions">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.health.title') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.health.refresh') }}</p>
      </div>
      <div class="health-actions">
        <el-button type="primary" :loading="checking" @click="runChecks">
          {{ checking ? $t('admin.health.checking') : $t('admin.health.start') }}
        </el-button>
        <el-button v-if="checks.length" @click="downloadReport">{{ $t('admin.health.download') }}</el-button>
      </div>
    </div>

    <!-- 未检查：空状态 -->
    <el-card shadow="never" class="section-card" v-if="!checks.length && !checking">
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
          <span class="health-status" aria-hidden="true">
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

<script setup>
import { ref, markRaw } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
// v0.34 任务3：状态 emoji 改 SVG（保留状态语义色）
import { CircleCheck, Warning, CircleClose, QuestionFilled, ArrowDown } from '@element-plus/icons-vue'

const checks = ref([])
const checking = ref(false)
const expanded = ref([])

const STATUS_ICON = { ok: markRaw(CircleCheck), warn: markRaw(Warning), fail: markRaw(CircleClose) }
function statusIcon(status) { return STATUS_ICON[status] || QuestionFilled }

function isExpanded(id) { return expanded.value.includes(id) }
function toggleExpand(id) {
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
    ElMessage.error(err.message)
    checks.value = []
  } finally {
    checking.value = false
  }
}

function downloadReport() {
  // httpOnly cookie 随同源 GET 请求自动携带，浏览器直接触发下载
  window.location = '/api/admin/health/download'
}
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807）——状态卡片化 ═══ */
.health-page { }

.health-actions { display: flex; gap: var(--sp-2, 8px); }

/* 检查结果卡片网格（2 列） */
.health-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-4, 16px); }
@media (max-width: 900px) {
  .health-grid { grid-template-columns: 1fr; }
}
.health-card {
  border-radius: var(--r-l, 11px);
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
</style>
