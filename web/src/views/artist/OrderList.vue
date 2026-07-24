<template>
  <ArtistLayout>
    <h2>📦 订单管理</h2>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-radio-group v-model="filter" @change="loadOrders" size="default">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="pending">待确认</el-radio-button>
        <el-radio-button value="confirmed">已确认</el-radio-button>
        <el-radio-button value="wip">制作中</el-radio-button>
        <el-radio-button value="done">已完成</el-radio-button>
        <el-radio-button value="delivered">已交付</el-radio-button>
        <el-radio-button value="cancelled">已取消</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 订单列表 -->
    <el-table :data="orders" v-loading="loading" stripe style="width: 100%; margin-top: 16px">
      <el-table-column prop="order_no" label="订单号" width="100" />
      <el-table-column prop="tier_name" label="类型" width="100">
        <template #default="{ row }">{{ row.tier_name || '自定义' }}</template>
      </el-table-column>
      <el-table-column prop="client_qq" label="客户QQ" width="120" />
      <el-table-column prop="client_name" label="昵称" width="100" />
      <el-table-column label="优先级" width="80">
        <template #default="{ row }">
          <el-tag :type="priorityType(row.priority)" size="small">
            {{ priorityLabel(row.priority) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="来源" width="80">
        <template #default="{ row }">
          <el-tag :type="row.source === 'self' ? 'primary' : 'info'" size="small">
            {{ row.source === 'self' ? '自助' : '手动' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="下单时间" width="160">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" width="100">
        <template #default="{ row }">
          <el-button size="small" @click="$router.push(`/orders/${row.id}`)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'

const orders = ref([])
const loading = ref(true)
const filter = ref('')

const priorityType = (p) => ({ high: 'danger', medium: 'warning', low: 'success' }[p] || 'info')
const priorityLabel = (p) => ({ high: '高', medium: '中', low: '低' }[p] || p)
const statusType = (s) => ({
  pending: 'info', confirmed: 'primary', wip: 'warning',
  revision: 'warning', done: 'success', delivered: 'success', cancelled: 'danger'
}[s] || 'info')
const statusLabel = (s) => ({
  pending: '待确认', confirmed: '已确认', wip: '制作中',
  revision: '修改中', done: '已完成', delivered: '已交付', cancelled: '已取消'
}[s] || s)

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadOrders() {
  loading.value = true
  try {
    orders.value = await artistApi.getOrders(filter.value || undefined)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadOrders)
</script>

<style scoped>
.filter-bar { overflow-x: auto; }
</style>
