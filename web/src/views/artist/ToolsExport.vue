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
import { ref } from 'vue'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

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
  try {
    // token 在 httpOnly cookie → 必须带 credentials；CSV 走 blob 下载（不经过 axios JSON 拦截器）
    const res = await fetch(`/api/artist/tools/export.csv?from=${from}&to=${to}`, { credentials: 'include' })
    if (!res.ok) {
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
    ElMessage.error(err.message || t('toolsExport.failed'))
  } finally {
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
</style>
