<template>
  <ArtistLayout>
    <h2>{{ $t('orderList.title') }}</h2>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-radio-group v-model="filter" @change="loadOrders" size="default">
        <el-radio-button value="">{{ $t('orderList.all') }}</el-radio-button>
        <el-radio-button value="pending">{{ $t('common.orderStatus.pending') }}</el-radio-button>
        <el-radio-button value="confirmed">{{ $t('common.orderStatus.confirmed') }}</el-radio-button>
        <el-radio-button value="wip">{{ $t('common.orderStatus.wip') }}</el-radio-button>
        <el-radio-button value="done">{{ $t('common.orderStatus.done') }}</el-radio-button>
        <el-radio-button value="delivered">{{ $t('common.orderStatus.delivered') }}</el-radio-button>
        <el-radio-button value="cancelled">{{ $t('common.orderStatus.cancelled') }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 订单列表 -->
    <el-table :data="orders" v-loading="loading" stripe style="width: 100%; margin-top: 16px">
      <el-table-column prop="order_no" :label="$t('orderList.colOrderNo')" width="100" />
      <el-table-column prop="tier_name" :label="$t('orderList.colType')" width="100">
        <template #default="{ row }">{{ row.tier_name || $t('common.custom') }}</template>
      </el-table-column>
      <el-table-column prop="client_qq" :label="$t('orderList.colQq')" width="120" />
      <el-table-column prop="client_name" :label="$t('orderList.colName')" width="100" />
      <el-table-column :label="$t('orderList.colPriority')" width="80">
        <template #default="{ row }">
          <el-tag :type="priorityType(row.priority)" size="small">
            {{ $t(`common.priority.${row.priority}`) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('orderList.colStatus')" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ $t(`common.orderStatus.${row.status}`) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('orderList.colSource')" width="80">
        <template #default="{ row }">
          <el-tag :type="row.source === 'self' ? 'primary' : 'info'" size="small">
            {{ row.source === 'self' ? $t('common.source.self') : $t('common.source.manual') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" :label="$t('orderList.colTime')" width="160">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column :label="$t('orderList.colActions')" fixed="right" width="100">
        <template #default="{ row }">
          <el-button size="small" @click="$router.push(`/orders/${row.id}?from=orders`)">{{ $t('common.detail') }}</el-button>
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
import { formatDateTimeShort } from '../../utils/datetime.js'

const orders = ref([])
const loading = ref(true)
const filter = ref('')

const priorityType = (p) => ({ high: 'danger', medium: 'warning', low: 'success' }[p] || 'info')
const statusType = (s) => ({
  pending: 'info', confirmed: 'primary', wip: 'warning',
  revision: 'warning', done: 'success', delivered: 'success', cancelled: 'danger'
}[s] || 'info')

function formatDate(str) {
  return formatDateTimeShort(str)
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
