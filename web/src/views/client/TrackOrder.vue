<template>
  <div class="track-page">
    <el-page-header @back="$router.push(`/home?artist=${subdomain}`)" title="返回主页" content="查询进度" />

    <el-card class="track-card">
      <!-- 输入订单号 -->
      <div class="input-row" v-if="!orderData">
        <el-input
          v-model="orderNo" placeholder="输入订单号，如 A001"
          size="large" @keyup.enter="doTrack" clearable
        />
        <el-button type="primary" size="large" @click="doTrack" :loading="loading">
          查询
        </el-button>
      </div>

      <!-- 查询结果 -->
      <div v-else class="result">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="订单号">{{ orderData.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="画师">{{ orderData.artistName }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ orderData.tierName || '自定义' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType">{{ statusText }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="排队位置" v-if="orderData.position">
            第 {{ orderData.position }} 位 / 共 {{ orderData.total }} 位
          </el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDate(orderData.createdAt) }}</el-descriptions-item>
        </el-descriptions>

        <!-- 进度条 -->
        <el-steps :active="stepActive" finish-status="success" simple style="margin-top: 24px">
          <el-step title="已提交" />
          <el-step title="已确认" />
          <el-step title="制作中" />
          <el-step title="已完成" />
          <el-step title="已交付" />
        </el-steps>

        <!-- 交付文件 -->
        <div v-if="orderData.deliverables?.length" class="deliverables">
          <h3>📦 交付文件</h3>
          <el-button v-for="d in orderData.deliverables" :key="d.id"
            type="success" @click="download(d.url)">
            ⬇ {{ d.fileName }}
          </el-button>
        </div>

        <el-button style="margin-top: 16px" @click="orderData = null">查询其他订单</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { orderApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'

const route = useRoute()
const orderNo = ref('')
const orderData = ref(null)
const loading = ref(false)

const subdomain = computed(() => {
  if (route.query.artist) return route.query.artist
  const parts = window.location.hostname.split('.')
  if (parts.length >= 3) return parts[0]
  return 'alice'
})

const statusMap = {
  pending: { text: '⏳ 待确认', type: 'info', step: 0 },
  confirmed: { text: '✅ 已确认', type: 'primary', step: 1 },
  wip: { text: '🎨 制作中', type: 'warning', step: 2 },
  revision: { text: '✏️ 修改中', type: 'warning', step: 2 },
  done: { text: '✔ 已完成', type: 'success', step: 3 },
  delivered: { text: '📦 已交付', type: 'success', step: 4 },
  cancelled: { text: '❌ 已取消', type: 'danger', step: -1 }
}

const statusText = computed(() => statusMap[orderData.value?.status]?.text || '未知')
const statusType = computed(() => statusMap[orderData.value?.status]?.type || 'info')
const stepActive = computed(() => statusMap[orderData.value?.status]?.step ?? 0)

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleString('zh-CN')
}

function download(url) {
  window.open(url, '_blank')
}

async function doTrack() {
  if (!orderNo.value.trim()) return ElMessage.warning('请输入订单号')
  loading.value = true
  try {
    orderData.value = await orderApi.track(orderNo.value.trim().toUpperCase())
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 支持 URL 参数 ?no=A001
  if (route.query.no) {
    orderNo.value = route.query.no
    doTrack()
  }
})
</script>

<style scoped>
.track-page { max-width: 600px; margin: 0 auto; padding: 16px; }
.track-card { margin-top: 16px; }
.input-row { display: flex; gap: 12px; }
.input-row .el-input { flex: 1; }
.deliverables { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.deliverables h3 { margin-bottom: 8px; }
</style>
