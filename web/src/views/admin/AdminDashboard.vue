<template>
  <div class="admin-page">
    <!-- 页头：标题 + 说明 -->
    <div class="page-head">
      <div>
        <h1 class="page-title font-display">{{ $t('admin.panelTitle') }}</h1>
        <p class="page-sub">{{ $t('admin.dashboardSubtitle') }}</p>
      </div>
    </div>

    <!-- 统计卡（画师数/总订单/活跃订单） -->
    <div class="stat-grid">
      <el-card shadow="never" class="stat-card">
        <div class="stat-num">{{ stats?.artistCount ?? '-' }}</div>
        <div class="stat-label">{{ $t('admin.artistCount') }}</div>
      </el-card>
      <el-card shadow="never" class="stat-card">
        <div class="stat-num">{{ stats?.orderCount ?? '-' }}</div>
        <div class="stat-label">{{ $t('admin.totalOrders') }}</div>
      </el-card>
      <el-card shadow="never" class="stat-card">
        <div class="stat-num">{{ stats?.activeOrders ?? '-' }}</div>
        <div class="stat-label">{{ $t('admin.activeOrders') }}</div>
      </el-card>
    </div>

    <!-- 操作区（从标题行独立出来，派工 B：不要挤在标题行） -->
    <div class="action-bar">
      <span class="action-title">{{ $t('admin.quickActions') }}</span>
      <div class="action-buttons">
        <el-button type="primary" @click="$router.push('/admin/artists')">{{ $t('admin.manageArtists') }}</el-button>
        <el-button @click="$router.push('/admin/greetings')">{{ $t('admin.greetingManage') }}</el-button>
        <el-button @click="$router.push('/admin/default-workflow')">{{ $t('admin.defaultWorkflow') }}</el-button>
        <el-button @click="$router.push('/admin/health')">{{ $t('admin.health.title') }}</el-button>
      </div>
    </div>

    <!-- 画师列表 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="card-head">
          <span class="card-title">{{ $t('admin.artistList') }}</span>
          <el-button text type="primary" @click="$router.push('/admin/artists')">{{ $t('admin.manageArtists') }}</el-button>
        </div>
      </template>
      <el-table :data="artists" v-loading="loading" stripe>
        <el-table-column prop="name" :label="$t('admin.colName')" min-width="120">
          <template #default="{ row }">
            <span class="cell-name">{{ row.name }}</span>
            <el-tag v-if="row.isAdmin" size="small" type="danger" class="cell-tag">{{ $t('admin.adminTag') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" min-width="120">
          <template #default="{ row }"><code class="cell-code">{{ row.subdomain }}</code></template>
        </el-table-column>
        <el-table-column prop="qq_number" :label="$t('admin.colQq')" width="110" />
        <el-table-column :label="$t('admin.colStatus')" width="110">
          <template #default="{ row }">
            <el-tag :type="{ open: 'success', full: 'warning', break: 'danger', hidden: 'info' }[row.status]" effect="light">
              {{ $t(`common.statusShort.${row.status}`) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" width="110" align="right">
          <template #default>
            <el-button size="small" type="primary" plain @click="$router.push('/admin/artists')">{{ $t('admin.manage') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 回收站（事故修复：孤儿文件不再永久删除，可恢复） -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="card-head">
          <span class="card-title">{{ $t('admin.recycleBin.title') }}</span>
          <el-button
            v-if="recycleTotal > 0"
            type="danger" size="small" plain :loading="emptying"
            @click="handleEmptyRecycleBin"
          >
            {{ $t('admin.recycleBin.empty') }}
          </el-button>
        </div>
      </template>
      <el-table v-if="recycleLoading || recycleItems.length > 0" :data="recycleItems" v-loading="recycleLoading" stripe>
        <el-table-column prop="fileName" :label="$t('admin.recycleBin.colFile')" min-width="180" show-overflow-tooltip />
        <el-table-column prop="originalPath" :label="$t('admin.recycleBin.colPath')" min-width="200" show-overflow-tooltip />
        <el-table-column :label="$t('admin.recycleBin.colSize')" width="100">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column :label="$t('admin.recycleBin.colMovedAt')" width="170">
          <template #default="{ row }">{{ formatDateTime(row.movedAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="$t('admin.recycleBin.emptyHint')" />
      <!-- REQ-022 F4: 分页（每页 20 条） -->
      <div v-if="recycleTotal > 0" class="pager">
        <el-pagination
          v-model:current-page="recyclePage"
          :page-size="recyclePageSize"
          :total="recycleTotal"
          layout="total, prev, pager, next"
          @current-change="loadRecycleBin"
        />
      </div>
    </el-card>

    <!-- F4: 留言管理（跨画师，强制删除） -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="gb-filter-header">
          <span class="card-title">{{ $t('admin.guestbook.title') }}</span>
          <!-- REQ-022 F5: 画师 / 审核状态 / 是否已回复 三维筛选（清空即全部） -->
          <div class="gb-filters">
            <el-select v-model="filterArtistId" size="small" clearable style="width: 150px" :placeholder="$t('admin.guestbook.colArtist')" @change="loadAdminMessages">
              <el-option v-for="a in artists" :key="a.id" :label="a.name" :value="a.id" />
            </el-select>
            <el-select v-model="filterStatus" size="small" clearable style="width: 120px" :placeholder="$t('admin.guestbook.colStatus')" @change="loadAdminMessages">
              <el-option :label="$t('admin.guestbook.statusPending')" value="pending" />
              <el-option :label="$t('admin.guestbook.statusApproved')" value="approved" />
              <el-option :label="$t('admin.guestbook.statusRejected')" value="rejected" />
            </el-select>
            <el-select v-model="filterReplied" size="small" clearable style="width: 120px" :placeholder="$t('admin.guestbook.filterByReplied')" @change="loadAdminMessages">
              <el-option :label="$t('admin.guestbook.repliedYes')" :value="1" />
              <el-option :label="$t('admin.guestbook.repliedNo')" :value="0" />
            </el-select>
          </div>
        </div>
      </template>
      <el-table v-if="msgLoading || adminMessages.length" :data="adminMessages" v-loading="msgLoading" stripe>
        <el-table-column :label="$t('admin.guestbook.colArtist')" width="120">
          <template #default="{ row }">{{ row.artist_name || `#${row.artist_id}` }}</template>
        </el-table-column>
        <el-table-column prop="nickname" :label="$t('admin.guestbook.colNickname')" width="120" />
        <el-table-column prop="content" :label="$t('admin.guestbook.colContent')" min-width="200" show-overflow-tooltip />
        <el-table-column :label="$t('admin.guestbook.colStatus')" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="{ pending: 'warning', approved: 'success', rejected: 'info' }[row.status]">{{ $t(`admin.guestbook.status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.guestbook.colTime')" width="170">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column width="110" align="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" plain @click="handleDeleteMessage(row)">{{ $t('admin.guestbook.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="$t('admin.guestbook.empty')" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../utils/datetime.js'

const { t } = useI18n()
const stats = ref(null)
const artists = ref([])
const loading = ref(true)

// ─── 回收站（事故修复：孤儿文件可恢复；REQ-022 F4 分页） ───
const recycleItems = ref([])
const recycleLoading = ref(true)
const emptying = ref(false)
const recyclePage = ref(1)
const recyclePageSize = 20
const recycleTotal = ref(0)

async function loadRecycleBin() {
  recycleLoading.value = true
  try {
    const res = await adminApi.getRecycleBin({ page: recyclePage.value, pageSize: recyclePageSize })
    recycleItems.value = res.items || []
    recycleTotal.value = res.total || 0
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    recycleLoading.value = false
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function handleEmptyRecycleBin() {
  try {
    await ElMessageBox.confirm(
      t('admin.recycleBin.emptyConfirm'),
      t('admin.recycleBin.emptyTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  emptying.value = true
  try {
    const res = await adminApi.emptyRecycleBin()
    ElMessage.success(t('admin.recycleBin.emptied', { n: res.deleted }))
    // REQ-022 F4: 清空后回到第 1 页并刷新
    recyclePage.value = 1
    await loadRecycleBin()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    emptying.value = false
  }
}

// ─── F4: 留言管理（跨画师）；REQ-022 F5: 三维筛选（画师/审核状态/是否已回复） ───
const adminMessages = ref([])
const msgLoading = ref(true)
const filterArtistId = ref(null)
const filterStatus = ref(null)
const filterReplied = ref(null)

async function loadAdminMessages() {
  msgLoading.value = true
  try {
    adminMessages.value = (await adminApi.getMessages({
      artistId: filterArtistId.value,
      status: filterStatus.value,
      replied: filterReplied.value
    })) || []
  } catch { /* 留言加载失败不阻塞其他模块 */ }
  finally { msgLoading.value = false }
}

async function handleDeleteMessage(row) {
  try {
    await ElMessageBox.confirm(
      t('admin.guestbook.deleteConfirm'),
      t('admin.guestbook.title'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await adminApi.deleteMessage(row.id)
    ElMessage.success(t('admin.guestbook.deleted'))
    adminMessages.value = adminMessages.value.filter(m => m.id !== row.id)
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(async () => {
  try {
    const [s, a] = await Promise.all([
      adminApi.getStats(),
      adminApi.getArtists()
    ])
    stats.value = s
    artists.value = a
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
  // REQ-022 F4: 回收站分页加载（独立请求）
  await loadRecycleBin()
  // F4/F5: 留言列表（独立失败，不阻塞其他模块；筛选变更时重新请求后端）
  await loadAdminMessages()
})
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807）——纸墨 token + 布局分层 ═══ */
.admin-page { }

/* 页头 */
.page-head { margin-bottom: var(--sp-5, 24px); }
.page-title {
  font-size: var(--fs-page-title, 26px);
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 var(--sp-1, 4px);
  letter-spacing: .02em;
}
.page-sub { margin: 0; font-size: var(--fs-aux, 12.5px); color: var(--ink3); }

/* 统计卡：统一卡片样式（对齐、间距、圆角/阴影） */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4, 16px); }
.stat-card { border-radius: var(--r-l, 11px); border: 1px solid var(--line); transition: box-shadow .15s, transform .15s ease-out; }
.stat-card:hover { box-shadow: var(--sh-2); transform: translateY(-1px); }
.stat-num {
  font-size: 30px; font-weight: bold; color: var(--ink);
  font-family: var(--f-d); text-align: center;
  font-variant-numeric: tabular-nums; margin-top: var(--sp-2, 8px);
}
.stat-label { color: var(--ink2); font-size: 13px; text-align: center; margin-bottom: var(--sp-2, 8px); }

/* 操作区：独立一行（派工 B） */
.action-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--sp-3, 12px); flex-wrap: wrap;
  margin: var(--sp-5, 24px) 0;
  padding: var(--sp-3, 12px) var(--sp-4, 16px);
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-l, 11px);
}
.action-title { font-size: var(--fs-section, 17px); font-weight: 600; color: var(--ink); }
.action-buttons { display: flex; gap: var(--sp-2, 8px); flex-wrap: wrap; }

/* 区块卡 */
.section-card { border-radius: var(--r-l, 11px); border: 1px solid var(--line); margin-top: var(--sp-5, 24px); }
.card-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2, 8px); }
.card-title { font-size: var(--fs-section, 17px); font-weight: 600; color: var(--ink); }

/* 表格单元格细节 */
.cell-name { font-weight: 600; color: var(--ink); }
.cell-tag { margin-left: var(--sp-1, 4px); }
.cell-code { font-size: 12px; color: var(--ink2); background: var(--paper2); padding: 1px 6px; border-radius: var(--r-s, 4px); }

/* 留言筛选行 */
.gb-filter-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2, 8px); }
.gb-filters { display: flex; gap: var(--sp-2, 8px); flex-wrap: wrap; }

/* 分页 */
.pager { display: flex; justify-content: flex-end; margin-top: var(--sp-4, 16px); }

@media (max-width: 768px) {
  .stat-grid { grid-template-columns: 1fr; }
  .action-bar { flex-direction: column; align-items: stretch; }
  .action-buttons { justify-content: flex-start; }
}
</style>
