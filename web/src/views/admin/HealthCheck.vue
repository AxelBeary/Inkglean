<!--
  HealthCheck — 系统自检页面（HC）

  GET /api/admin/health → { checks: [{ id, name, status: ok|warn|fail, summary, detail }], timestamp }
  - 结果不持久化（刷新即消失，ref 存内存）
  - 每行可展开详情（el-collapse）
  - 磁盘空间项标注"仅供参考"
  - 诊断包下载：GET /api/admin/health/download（httpOnly cookie 随请求携带）
-->
<template>
  <div class="health-page">
    <el-card>
      <div class="health-actions">
        <el-button type="primary" :loading="checking" @click="runChecks">
          {{ checking ? $t('admin.health.checking') : $t('admin.health.start') }}
        </el-button>
        <el-button v-if="checks.length" @click="downloadReport">{{ $t('admin.health.download') }}</el-button>
      </div>
      <p class="health-note">{{ $t('admin.health.refresh') }}</p>

      <!-- 未检查：空状态 -->
      <el-empty v-if="!checks.length && !checking" :description="$t('admin.health.emptyHint')" />

      <!-- 检查结果列表 -->
      <el-collapse v-else-if="checks.length" v-model="expanded" class="health-list">
        <el-collapse-item v-for="c in checks" :key="c.id" :name="c.id">
          <template #title>
            <el-icon class="health-status" :class="`health-status--${c.status}`" aria-hidden="true">
              <component :is="statusIcon(c.status)" />
            </el-icon>
            <span class="health-name">{{ c.name }}</span>
            <el-tag size="small" :type="{ ok: 'success', warn: 'warning', fail: 'danger' }[c.status]">
              {{ $t(`admin.health.status${c.status.charAt(0).toUpperCase() + c.status.slice(1)}`) }}
            </el-tag>
            <span class="health-summary">{{ c.summary }}</span>
            <el-tag v-if="c.id === 'disk'" size="small" type="info">{{ $t('admin.health.diskNote') }}</el-tag>
          </template>
          <pre class="health-detail">{{ JSON.stringify(c.detail, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup>
import { ref, markRaw } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
// v0.34 任务3：状态 emoji 改 SVG（保留状态语义色）
import { CircleCheck, Warning, CircleClose, QuestionFilled } from '@element-plus/icons-vue'

const checks = ref([])
const checking = ref(false)
const expanded = ref([])

const STATUS_ICON = { ok: markRaw(CircleCheck), warn: markRaw(Warning), fail: markRaw(CircleClose) }
function statusIcon(status) { return STATUS_ICON[status] || QuestionFilled }

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
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026，管理后台从简） ═══ */
.health-page { /* 容器由 AdminLayout 提供 */ }
.health-actions { display: flex; gap: 12px; }
.health-note { margin: 10px 0 0; font-size: 12px; color: var(--ink2); }
.health-list { margin-top: 16px; }
.health-status { margin-right: 8px; font-size: 16px; }
/* v0.34 任务3：SVG 状态图标沿用 ok/warn/fail 语义色（石绿/藤黄/朱砂） */
.health-status--ok { color: var(--sl); }
.health-status--warn { color: var(--th); }
.health-status--fail { color: var(--zs); }
.health-name { font-weight: 700; margin-right: 10px; color: var(--ink); }
.health-summary { margin-left: 10px; font-size: 13px; color: var(--ink2); }
/* #63: JSON 详情面板跟随主题底色，不硬编码白底灰字 */
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
