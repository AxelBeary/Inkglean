<template>
  <div class="dashboard">
    <ArtistLayout>
      <h2>📊 仪表盘</h2>

      <!-- 统计卡片 -->
      <div class="stat-grid">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.pendingCount ?? '-' }}</div>
          <div class="stat-label">待处理新单</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.activeCount ?? '-' }}</div>
          <div class="stat-label">进行中订单</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">¥{{ stats?.monthRevenue ?? '-' }}</div>
          <div class="stat-label">本月收入</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.totalCompleted ?? '-' }}</div>
          <div class="stat-label">累计完成</div>
        </el-card>
      </div>

      <!-- 快捷操作 -->
      <h3 style="margin: 24px 0 12px">快捷操作</h3>
      <div class="quick-actions">
        <el-button type="primary" @click="$router.push('/queue')">📋 排期看板</el-button>
        <el-button type="success" @click="$router.push('/manual-order')">✍ 手动录单</el-button>
        <el-button @click="$router.push('/orders')">📦 全部订单</el-button>
        <el-button @click="$router.push('/settings')">⚙ 主页设置</el-button>
      </div>

      <!-- 当前状态 -->
      <el-card style="margin-top: 24px">
        <template #header>当前主页状态</template>
        <el-radio-group v-model="currentStatus" @change="updateStatus" size="large">
          <el-radio-button value="open">✅ 可约稿</el-radio-button>
          <el-radio-button value="full">⏳ 已排满</el-radio-button>
          <el-radio-button value="break">💤 休息中</el-radio-button>
        </el-radio-group>
      </el-card>
    </ArtistLayout>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useArtistStore } from '../../stores/artist.js'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'

const store = useArtistStore()
const stats = ref(null)
const currentStatus = ref('open')

async function updateStatus(val) {
  try {
    await artistApi.updateProfile({ status: val })
    ElMessage.success('状态已更新')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(async () => {
  await store.fetchProfile()
  currentStatus.value = store.profile?.status || 'open'
  try {
    stats.value = await artistApi.getStats()
  } catch { /* ignore */ }
})
</script>

<style scoped>
.stat-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px; margin-top: 16px;
}
.stat-card { text-align: center; }
.stat-num { font-size: 28px; font-weight: bold; color: #409eff; }
.stat-label { color: #999; font-size: 13px; margin-top: 4px; }
.quick-actions { display: flex; flex-wrap: wrap; gap: 12px; }
</style>
