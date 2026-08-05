<template>
  <div class="admin-page">
    <div class="stat-grid">
      <el-card shadow="hover"><div class="stat-num">{{ stats?.artistCount ?? '-' }}</div><div class="stat-label">{{ $t('admin.artistCount') }}</div></el-card>
      <el-card shadow="hover"><div class="stat-num">{{ stats?.orderCount ?? '-' }}</div><div class="stat-label">{{ $t('admin.totalOrders') }}</div></el-card>
      <el-card shadow="hover"><div class="stat-num">{{ stats?.activeOrders ?? '-' }}</div><div class="stat-label">{{ $t('admin.activeOrders') }}</div></el-card>
    </div>

    <el-card style="margin-top: 24px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>{{ $t('admin.artistList') }}</span>
          <el-button type="primary" size="small" @click="$router.push('/admin/artists')">{{ $t('admin.manageArtists') }}</el-button>
          <el-button size="small" @click="$router.push('/admin/greetings')">{{ $t('admin.greetingManage') }}</el-button>
          <el-button size="small" @click="$router.push('/admin/default-workflow')">{{ $t('admin.defaultWorkflow') }}</el-button>
          <el-button size="small" @click="$router.push('/admin/health')">{{ $t('admin.health.title') }}</el-button>
        </div>
      </template>
      <el-table :data="artists" v-loading="loading" stripe>
        <el-table-column prop="name" :label="$t('admin.colName')" />
        <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" />
        <el-table-column prop="qq_number" :label="$t('admin.colQq')" />
        <el-table-column :label="$t('admin.colStatus')">
          <template #default="{ row }">
            <el-tag :type="{ open: 'success', full: 'warning', break: 'danger', hidden: 'info' }[row.status]">
              {{ $t(`common.statusShort.${row.status}`) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 回收站（事故修复：孤儿文件不再永久删除，可恢复） -->
    <el-card style="margin-top: 24px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>{{ $t('admin.recycleBin.title') }}</span>
          <el-button
            v-if="recycleTotal > 0"
            type="danger" size="small" :loading="emptying"
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
      <!-- REQ-022 F4: 分页（每页 20 条，total 文案由 ElConfigProvider 内置双语提供） -->
      <div v-if="recycleTotal > 0" style="display: flex; justify-content: flex-end; margin-top: 16px">
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
    <el-card style="margin-top: 24px">
      <template #header>
        <div class="gb-filter-header">
          <span>{{ $t('admin.guestbook.title') }}</span>
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
            <el-tag size="small" :type="{ pending: 'warning', approved: 'success', rejected: 'info' }[row.status]">{{ $t(`admin.guestbook.status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.guestbook.colTime')" width="170">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column width="110">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="handleDeleteMessage(row)">{{ $t('admin.guestbook.delete') }}</el-button>
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
.admin-page { /* 容器由 AdminLayout 提供 */ }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-num { font-size: 28px; font-weight: bold; color: var(--el-color-primary); text-align: center; }
.stat-label { color: var(--text-secondary); font-size: 13px; text-align: center; }
/* REQ-022 F5: 留言筛选行 */
.gb-filter-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.gb-filters { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
