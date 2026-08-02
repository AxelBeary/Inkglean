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
            <el-tag :type="{ open: 'success', full: 'warning', break: 'danger' }[row.status]">
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
            v-if="recycleItems.length > 0"
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
    </el-card>

    <!-- F4: 留言管理（跨画师，强制删除） -->
    <el-card style="margin-top: 24px">
      <template #header>
        <span>{{ $t('admin.guestbook.title') }}</span>
      </template>
      <el-table v-if="msgLoading || adminMessages.length" :data="adminMessages" v-loading="msgLoading" stripe>
        <el-table-column :label="$t('admin.guestbook.colArtist')" width="120">
          <template #default="{ row }">{{ row.artist_name || `#${row.artist_id}` }}</template>
        </el-table-column>
        <el-table-column prop="nickname" :label="$t('admin.guestbook.colNickname')" width="120" />
        <el-table-column prop="content" :label="$t('admin.guestbook.colContent')" min-width="200" show-overflow-tooltip />
        <el-table-column :label="$t('admin.guestbook.colStatus')" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', approved: 'success', rejected: 'info' }[row.status]">{{ row.status }}</el-tag>
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

// ─── 回收站（事故修复：孤儿文件可恢复） ───
const recycleItems = ref([])
const recycleLoading = ref(true)
const emptying = ref(false)

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
    recycleItems.value = []
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    emptying.value = false
  }
}

// ─── F4: 留言管理（跨画师） ───
const adminMessages = ref([])
const msgLoading = ref(true)

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
    const [s, a, rb] = await Promise.all([
      adminApi.getStats(),
      adminApi.getArtists(),
      adminApi.getRecycleBin()
    ])
    stats.value = s
    artists.value = a
    recycleItems.value = rb.items || []
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
    recycleLoading.value = false
  }
  // F4: 留言列表（独立失败，不阻塞其他模块）
  try {
    adminMessages.value = (await adminApi.getMessages()) || []
  } catch { /* 后端 GET /api/admin/messages 待三号补齐 */ }
  finally { msgLoading.value = false }
})
</script>

<style scoped>
.admin-page { /* 容器由 AdminLayout 提供 */ }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-num { font-size: 28px; font-weight: bold; color: var(--el-color-primary); text-align: center; }
.stat-label { color: var(--text-secondary); font-size: 13px; text-align: center; }
</style>
