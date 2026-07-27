<template>
  <div class="admin-page">
    <el-page-header @back="$router.push('/dashboard')" :title="$t('admin.backToAdmin')" :content="$t('admin.panelTitle')" />

    <div class="stat-grid" style="margin-top: 16px">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'

const stats = ref(null)
const artists = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    [stats.value, artists.value] = await Promise.all([
      adminApi.getStats(),
      adminApi.getArtists()
    ])
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.admin-page { max-width: 900px; margin: 0 auto; padding: 16px; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-num { font-size: 28px; font-weight: bold; color: var(--el-color-primary); text-align: center; }
.stat-label { color: var(--text-secondary); font-size: 13px; text-align: center; }
</style>
