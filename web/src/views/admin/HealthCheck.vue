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
    <el-page-header @back="$router.push('/admin')" :title="$t('admin.backToAdmin')" :content="$t('admin.health.title')" />

    <el-card style="margin-top: 16px">
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
            <span class="health-status" aria-hidden="true">{{ statusIcon(c.status) }}</span>
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
import { ref } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'

const checks = ref([])
const checking = ref(false)
const expanded = ref([])

const STATUS_ICON = { ok: '✅', warn: '⚠️', fail: '❌' }
function statusIcon(status) { return STATUS_ICON[status] || '❓' }

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
.health-page { max-width: 900px; margin: 0 auto; padding: 16px; }
.health-actions { display: flex; gap: 12px; }
.health-note { margin: 10px 0 0; font-size: 12px; color: var(--text-secondary); }
.health-list { margin-top: 16px; }
.health-status { margin-right: 8px; }
.health-name { font-weight: 700; margin-right: 10px; }
.health-summary { margin-left: 10px; font-size: 13px; color: var(--text-secondary); }
.health-detail {
  margin: 0;
  padding: 12px;
  background: var(--fill-color-light, #f5f7fa);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
