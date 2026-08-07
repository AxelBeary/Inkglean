<template>
  <ArtistLayout>
    <!-- v0.38 第二批: H1 文楷 28/700（REQ §1.3） -->
    <h2 class="font-display od-page-title">{{ $t('orderList.title') }}</h2>

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
          <el-tag :type="priorityType(row.priority)" size="small" :class="`prio-tag prio-tag--${row.priority}`">
            {{ $t(`common.priority.${row.priority}`) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('orderList.colStatus')" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small" :class="`status-tag status-tag--${row.status}`">{{ $t(`common.orderStatus.${row.status}`) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('orderList.colSource')" width="80">
        <template #default="{ row }">
          <el-tag :type="row.source === 'self' ? 'primary' : 'info'" size="small" :class="`source-tag source-tag--${row.source === 'self' ? 'self' : 'manual'}`">
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

    <!-- REQ-020 F1: 搜索无结果提示（v0.38: 统一墨线空态） -->
    <InkEmpty v-if="!loading && orders.length === 0 && searchQuery.trim()" :title="$t('orderList.noSearchResult')" />

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
// v0.38 第二批: 统一墨线空态（REQ-026 §二）
import InkEmpty from '../../components/artist/visual/InkEmpty.vue'
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
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }

/* R42a: 工具栏 */
.order-toolbar { margin: 12px 0; }
/* REQ-020 F1: 搜索栏 */
.search-bar { margin: 12px 0; }
.filter-bar { overflow-x: auto; }

/* ─── 表格换肤（REQ §二：表头下沉底色 / 行 hover 纸色底 / 金额日期等宽） ─── */
.el-table { --el-table-border-color: var(--line); --el-table-header-bg-color: var(--paper2); --el-table-row-hover-bg-color: var(--paper2); }
.el-table :deep(.el-table__header th) {
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600; color: var(--ink2);
  background: var(--paper2);
}
.el-table :deep(.el-table__row td) { color: var(--ink); }
.el-table :deep(.el-table__body tr) { transition: background 0.15s; }
/* 斑马纹用极浅纸色（密集界面保持安静） */
.el-table :deep(.el-table__row--striped td) { background: color-mix(in srgb, var(--paper2) 55%, transparent); }

/* R16: 缩略图 */
.order-thumb { width: 40px; height: 40px; border-radius: var(--r-s); display: block; cursor: zoom-in; }
.no-thumb { color: var(--ink4); }
@media (max-width: 600px) {
  .order-thumb { width: 32px; height: 32px; }
}

/* ═══ 批4a: 三标签纸墨语义色（OrderList 专用，与 QueueBoard 色条一致；保留 :type 仅作 EP 兜底） ═══ */
/* 优先级：高=赭石 / 中=藤黄 / 低=中性灰 */
.prio-tag--high { background: var(--zhe); color: #fff; border-color: var(--zhe); }
.prio-tag--medium { background: var(--th); color: #fff; border-color: var(--th); }
.prio-tag--low { background: var(--ink4); color: #fff; border-color: var(--ink4); }

/* 来源：自助=花青 / 手动=墨灰 */
.source-tag--self { background: var(--hq); color: #fff; border-color: var(--hq); }
.source-tag--manual { background: var(--ink3); color: #fff; border-color: var(--ink3); }

/* 状态：待确认=藤黄 / 已确认·进行中=花青 / 返修=赭石 / 完成·已交付=石绿 / 取消=朱砂 */
.status-tag--pending { background: var(--th); color: #fff; border-color: var(--th); }
.status-tag--confirmed, .status-tag--wip { background: var(--hq); color: #fff; border-color: var(--hq); }
.status-tag--revision { background: var(--zhe); color: #fff; border-color: var(--zhe); }
.status-tag--done, .status-tag--delivered { background: var(--sl); color: #fff; border-color: var(--sl); }
.status-tag--cancelled { background: var(--zs); color: #fff; border-color: var(--zs); }
</style>
