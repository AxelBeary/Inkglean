<template>
  <div class="admin-page">
    <el-page-header @back="$router.push('/dashboard')" title="返回后台" content="管理员面板" />

    <div class="stat-grid" style="margin-top: 16px">
      <el-card shadow="hover"><div class="stat-num">{{ stats?.artistCount ?? '-' }}</div><div class="stat-label">画师数</div></el-card>
      <el-card shadow="hover"><div class="stat-num">{{ stats?.orderCount ?? '-' }}</div><div class="stat-label">总订单</div></el-card>
      <el-card shadow="hover"><div class="stat-num">{{ stats?.activeOrders ?? '-' }}</div><div class="stat-label">活跃订单</div></el-card>
    </div>

    <el-card style="margin-top: 24px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>画师列表</span>
          <el-button type="primary" size="small" @click="$router.push('/admin/artists')">管理画师</el-button>
        </div>
      </template>
      <el-table :data="artists" stripe>
        <el-table-column prop="name" label="昵称" />
        <el-table-column prop="subdomain" label="子域名" />
        <el-table-column prop="qq_number" label="QQ号" />
        <el-table-column label="状态">
          <template #default="{ row }">
            <el-tag :type="{ open: 'success', full: 'warning', break: 'danger' }[row.status]">
              {{ { open: '可约', full: '排满', break: '休息' }[row.status] }}
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

onMounted(async () => {
  try {
    [stats.value, artists.value] = await Promise.all([
      adminApi.getStats(),
      adminApi.getArtists()
    ])
  } catch (err) {
    ElMessage.error(err.message)
  }
})
</script>

<style scoped>
.admin-page { max-width: 900px; margin: 0 auto; padding: 16px; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-num { font-size: 28px; font-weight: bold; color: #409eff; text-align: center; }
.stat-label { color: #999; font-size: 13px; text-align: center; }
</style>
