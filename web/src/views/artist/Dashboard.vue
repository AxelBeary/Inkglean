<template>
  <div class="dashboard">
    <ArtistLayout>
      <h2>{{ $t('dashboard.title') }}</h2>

      <!-- 统计卡片 -->
      <div class="stat-grid">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.pendingCount ?? '-' }}</div>
          <div class="stat-label">{{ $t('dashboard.pendingNew') }}</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.activeCount ?? '-' }}</div>
          <div class="stat-label">{{ $t('dashboard.activeOrders') }}</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">¥{{ stats?.monthRevenue ?? '-' }}</div>
          <div class="stat-label">{{ $t('dashboard.monthRevenue') }}</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats?.totalCompleted ?? '-' }}</div>
          <div class="stat-label">{{ $t('dashboard.totalCompleted') }}</div>
        </el-card>
      </div>

      <!-- 快捷操作 -->
      <h3 style="margin: 24px 0 12px">{{ $t('dashboard.quickActions') }}</h3>
      <div class="quick-actions">
        <el-button type="primary" @click="$router.push('/queue')">{{ $t('dashboard.queueBoard') }}</el-button>
        <el-button type="success" @click="$router.push('/manual-order')">{{ $t('dashboard.manualOrder') }}</el-button>
        <el-button @click="$router.push('/orders')">{{ $t('dashboard.allOrders') }}</el-button>
        <el-button @click="$router.push('/settings')">{{ $t('dashboard.settings') }}</el-button>
      </div>

      <!-- 当前状态 -->
      <el-card style="margin-top: 24px">
        <template #header>{{ $t('dashboard.currentStatus') }}</template>
        <el-radio-group v-model="currentStatus" @change="updateStatus" size="large">
          <el-radio-button value="open">{{ $t('dashboard.statusOpen') }}</el-radio-button>
          <el-radio-button value="full">{{ $t('dashboard.statusFull') }}</el-radio-button>
          <el-radio-button value="break">{{ $t('dashboard.statusBreak') }}</el-radio-button>
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
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
const store = useArtistStore()
const stats = ref(null)
const currentStatus = ref('open')

async function updateStatus(val) {
  const prev = currentStatus.value
  try {
    await artistApi.updateProfile({ status: val })
    ElMessage.success(t('dashboard.statusUpdated'))
  } catch (err) {
    currentStatus.value = prev // 回滚 UI 状态
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
.stat-card { text-align: center; background: var(--bg-card); transition: background 0.3s; }
.stat-num { font-size: 28px; font-weight: bold; color: var(--el-color-primary); }
.stat-label { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
.quick-actions { display: flex; flex-wrap: wrap; gap: 12px; }
</style>
