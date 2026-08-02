<template>
  <ArtistLayout>
    <h2>{{ $t('orderList.title') }}</h2>

    <!-- REQ-020 F1: 订单搜索（客户昵称/订单号/档位名，300ms debounce） -->
    <div class="search-bar">
      <el-input
        v-model="searchQuery"
        :placeholder="$t('orderList.searchPlaceholder')"
        clearable
        prefix-icon="Search"
        style="max-width: 320px"
        @input="onSearchInput"
        @clear="onSearchClear"
      />
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-radio-group v-model="filter" @change="onFilterChange" size="default">
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
    <el-table :data="displayedOrders" v-loading="loading" stripe style="width: 100%; margin-top: 16px">
      <!-- R16: 缩略图列（焦点图优先，无则 —） -->
      <el-table-column :label="$t('orderList.colImage')" width="64" class-name="thumb-col">
        <template #default="{ row }">
          <el-image
            v-if="row.focus_image_path"
            :src="row.focusImageUrl"
            fit="cover"
            class="order-thumb"
            :alt="$t('orderDetail.referenceImage')"
            :preview-src-list="[row.focusImageUrl]"
            preview-teleported
          />
          <span v-else class="no-thumb">—</span>
        </template>
      </el-table-column>
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

    <!-- REQ-020 F1: 搜索无结果提示 -->
    <el-empty v-if="!loading && orders.length === 0 && searchQuery.trim()" :description="$t('orderList.noSearchResult')" />

    <!-- S-10: 分页 -->
    <div style="display: flex; justify-content: flex-end; margin-top: 16px">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @current-change="loadOrders"
        @size-change="loadOrders"
      />
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { formatDateTimeShort } from '../../utils/datetime.js'

const route = useRoute()
const orders = ref([])
const loading = ref(true)
const filter = ref('')
// REQ-020 F1: 搜索（300ms debounce）
const searchQuery = ref('')
let searchTimer = null
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; loadOrders() }, 300)
}
function onSearchClear() {
  clearTimeout(searchTimer)
  page.value = 1
  loadOrders()
}
onUnmounted(() => clearTimeout(searchTimer))
// #2: 复合筛选（active=非终态 / completed=done+delivered，客户端过滤）
const compositeFilter = ref('')
const ACTIVE_STATUSES = ['pending', 'confirmed', 'wip', 'revision', 'done']
const COMPLETED_STATUSES = ['done', 'delivered']
const displayedOrders = computed(() => {
  if (compositeFilter.value === 'active') return orders.value.filter(o => ACTIVE_STATUSES.includes(o.status))
  if (compositeFilter.value === 'completed') return orders.value.filter(o => COMPLETED_STATUSES.includes(o.status))
  return orders.value
})
const page = ref(1)
const pageSize = ref(50)
const total = ref(0)

import { ORDER_STATUS_TYPE, PRIORITY_TYPE } from '../../constants/order.js'

// (本地别名保持模板兼容)
const priorityType = (p) => PRIORITY_TYPE[p] || 'info'
const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'

function formatDate(str) {
  return formatDateTimeShort(str)
}

function onFilterChange() {
  page.value = 1
  compositeFilter.value = '' // 手动切筛选时清除复合过滤
  loadOrders()
}

async function loadOrders() {
  loading.value = true
  try {
    const q = searchQuery.value.trim() || undefined
    const res = await artistApi.getOrders(filter.value || undefined, { page: page.value, pageSize: pageSize.value, q })
    orders.value = res.items ?? res
    total.value = res.total ?? orders.value.length
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // #2: 统计卡跳转带 ?status= 时初始化筛选
  const q = route.query.status
  if (q && typeof q === 'string') {
    if (['pending', 'confirmed', 'wip', 'done', 'delivered', 'cancelled'].includes(q)) {
      filter.value = q
    } else if (q === 'active' || q === 'completed') {
      compositeFilter.value = q // 复合值走客户端过滤，不设 filter（加载全量）
    }
  }
  loadOrders()
})
</script>

<style scoped>
/* R42a: 工具栏 */
.order-toolbar { margin: 12px 0; }
/* REQ-020 F1: 搜索栏 */
.search-bar { margin: 12px 0; }
.filter-bar { overflow-x: auto; }
/* R16: 缩略图 */
.order-thumb { width: 40px; height: 40px; border-radius: 6px; display: block; cursor: zoom-in; }
.no-thumb { color: var(--text-muted); }
@media (max-width: 600px) {
  .order-thumb { width: 32px; height: 32px; }
}
</style>
