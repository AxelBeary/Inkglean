<template>
  <!-- v0.38 第二批: H1 文楷 28/700（REQ §1.3） -->
  <h2 class="font-display od-page-title">{{ $t('orderList.title') }}</h2>

  <!-- 818-H：筛选工具条按行结构整理（说明在左、控件在右） -->
  <div class="group ol-filter">
    <div class="group-head">{{ $t('orderList.filterTitle') }}</div>
    <!-- REQ-020 F1: 订单搜索（客户昵称/订单号/档位名，300ms debounce） -->
    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('orderList.searchLabel') }}</div>
        <div class="desc">{{ $t('orderList.searchDesc') }}</div>
      </div>
      <div class="ctrl">
        <div class="search-bar">
          <el-input
            v-model="searchQuery"
            :placeholder="$t('orderList.searchPlaceholder')"
            clearable
            prefix-icon="Search"
            class="ol-search"
            @input="onSearchInput"
            @clear="onSearchClear"
          />
        </div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('orderList.filterLabel') }}</div>
        <div class="desc">{{ $t('orderList.filterDesc') }}</div>
      </div>
      <div class="ctrl">
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
      </div>
    </div>
  </div>

  <!-- REQ-037 批3 D1: 复合筛选全量拉取进度（大单量可见反馈） -->
  <div v-if="fetchProgress" class="fetch-progress">
    <el-progress :percentage="Math.round(fetchProgress.done / fetchProgress.total * 100)" :stroke-width="6" :show-text="false" />
    <span class="fetch-progress-text">{{ $t('orderList.fetchAllProgress', { done: fetchProgress.done, total: fetchProgress.total }) }}</span>
  </div>

  <!-- P0-3: 移动端卡片视图（≤768px 替代表格；点击进详情） -->
  <div class="order-cards">
    <router-link
      v-for="row in displayedOrders" :key="row.id"
      class="order-card"
      :to="{ path: `/orders/${row.id}`, query: { from: 'orders' } }"
    >
      <div class="order-card-top">
        <el-image v-if="row.focus_image_path" :src="row.focusImageUrl" fit="cover" class="order-card-thumb" :alt="$t('orderDetail.referenceImage')" />
        <div class="order-card-main">
          <div class="order-card-no">{{ row.order_no }}</div>
          <div class="order-card-sub">{{ row.tier_name || $t('common.custom') }} · {{ row.client_name || row.client_qq }}</div>
        </div>
        <el-tag size="small" :class="`status-tag status-tag--${row.status}`">{{ $t(`common.orderStatus.${row.status}`) }}</el-tag>
      </div>
      <div class="order-card-bottom">
        <span class="order-card-time">{{ formatDate(row.created_at) }}</span>
        <el-tag size="small" :class="`prio-tag prio-tag--${row.priority}`">{{ $t(`common.priority.${row.priority}`) }}</el-tag>
      </div>
    </router-link>
  </div>

  <!-- 订单列表（巡检修复批 B7: 窄屏允许横向滚动，列宽合计 1004px） -->
  <!-- M3: 加载期显示卡片骨架屏（不遮罩已渲染内容），表格 v-if="!loading" -->
  <HySkeleton v-if="loading" count="6" />
  <div class="order-table-wrap" v-if="!loading">
    <el-table :data="displayedOrders" stripe style="width: 100%; margin-top: 16px" @row-click="onRowClick">
      <!-- R16: 缩略图列（焦点图优先，无则 —） -->
      <el-table-column :label="$t('orderList.colImage')" width="64" class-name="thumb-col">
        <template #default="{ row }">
          <!-- REQ-037 D2: 预览点击 stopPropagation，避免与整行 row-click 跳详情叠加
                 （QueueBoardList R18/R53 同款陷阱：el-image 内置预览点击会冒泡） -->
          <el-image
            v-if="row.focus_image_path"
            :src="row.focusImageUrl"
            fit="cover"
            class="order-thumb"
            :alt="$t('orderDetail.referenceImage')"
            :preview-src-list="[row.focusImageUrl]"
            preview-teleported
            @click.stop
          />
          <span v-else class="no-thumb">—</span>
        </template>
      </el-table-column>
      <!-- REQ-037 批3 D2: 订单号列改真链接（键盘可达；stop 防与 row-click 双跳） -->
      <el-table-column :label="$t('orderList.colOrderNo')" width="100">
        <template #default="{ row }">
          <router-link class="order-no-link" :to="{ path: `/orders/${row.id}`, query: { from: 'orders' } }" @click.stop>{{ row.order_no }}</router-link>
        </template>
      </el-table-column>
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
      <el-table-column prop="created_at" :label="$t('orderList.colTime')" min-width="160">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column :label="$t('orderList.colActions')" fixed="right" width="100">
        <template #default="{ row }">
          <el-button size="small" @click.stop="$router.push(`/orders/${row.id}?from=orders`)">{{ $t('common.detail') }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>

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
      @current-change="onPageChange"
      @size-change="onSizeChange"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { FETCH_ALL_PAGE_SIZE, ORDER_LIST_UI_PAGE_SIZE } from '../../constants/pagination.js'
// v0.38 第二批: 统一墨线空态（REQ-026 §二）
import InkEmpty from '../../components/artist/visual/InkEmpty.vue'
// M3: 订单卡片骨架屏（加载期替代 v-loading 遮罩）
import HySkeleton from '../../components/shared/HySkeleton.vue'
import { formatDateTimeShort } from '../../utils/datetime.js'
import { safeGetItem, safeSetItem } from '../../utils/storage.js'

const route = useRoute()
const router = useRouter()
const orders = ref([])
const loading = ref(true)
const filter = ref('')
// REQ-020 F1: 搜索（300ms debounce）
const searchQuery = ref('')
let searchTimer = null
function onSearchInput() {
  clearTimeout(searchTimer)
  invalidateFullOrdersCache()
  searchTimer = setTimeout(() => { page.value = 1; loadOrders() }, 300)
}
function onSearchClear() {
  clearTimeout(searchTimer)
  invalidateFullOrdersCache()
  page.value = 1
  loadOrders()
}
onUnmounted(() => {
  clearTimeout(searchTimer)
  loadSeq++ // a1: 卸载后慢响应/剩余分页不得继续写 refs（seq 作废）
})
// #2: 复合筛选（active=非终态，过滤掉 done/delivered / completed=done+delivered，客户端过滤）
const compositeFilter = ref('')
const ACTIVE_STATUSES = ['pending', 'confirmed', 'wip', 'revision']
const COMPLETED_STATUSES = ['done', 'delivered']
const displayedOrders = computed(() => {
  if (compositeFilter.value) {
    // 05D-O1: 复合筛选已拉全量并过滤（见 loadOrders）→ 前端分页切片
    const start = (page.value - 1) * pageSize.value
    return orders.value.slice(start, start + pageSize.value)
  }
  return orders.value
})
// ─── REQ-037 批3 D1: 复合筛选全量数据会话内缓存 ───
// active/completed 复合筛选需拉全量客户端过滤；同会话短时缓存避免统计卡来回跳转重复拉；
// 订单列表页无写操作，TTL 到期自然失效即可
let fullOrdersCache = null // { key, items, at }
const FULL_ORDERS_CACHE_TTL = 60_000
function fullOrdersCacheKey() { return searchQuery.value.trim() || '' }
function invalidateFullOrdersCache() { fullOrdersCache = null }
const fetchProgress = ref(null) // { done, total } | null
const page = ref(1)
const pageSize = ref(ORDER_LIST_UI_PAGE_SIZE)
const total = ref(0)

import { statusType, priorityType } from '../../constants/order.js'

function formatDate(str) {
  return formatDateTimeShort(str)
}

function onFilterChange() {
  page.value = 1
  compositeFilter.value = '' // 手动切筛选时清除复合过滤
  invalidateFullOrdersCache()
  rememberFilterState() // E9: 筛选记忆
  loadOrders()
}

// ─── E9（2026-08-14）: 筛选记忆——筛选条件存 localStorage，回来不重置 ───
// URL ?status=（统计卡跳转）优先级高于记忆值；存储只存白名单内枚举，脏值不信任。
// 只记状态筛选（单选/复合），搜索词属临时输入不记。
const FILTER_MEMORY_KEY = 'orderlist_filter_memory'
const FILTER_MEMORY_STATUSES = ['', 'pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled']
const FILTER_MEMORY_COMPOSITES = ['', 'active', 'completed']
function rememberFilterState() {
  safeSetItem(FILTER_MEMORY_KEY, JSON.stringify({ filter: filter.value, composite: compositeFilter.value }))
}
function restoreFilterState() {
  try {
    const raw = safeGetItem(FILTER_MEMORY_KEY)
    if (!raw) return
    const saved = JSON.parse(raw)
    const f = typeof saved?.filter === 'string' && FILTER_MEMORY_STATUSES.includes(saved.filter) ? saved.filter : ''
    const c = typeof saved?.composite === 'string' && FILTER_MEMORY_COMPOSITES.includes(saved.composite) ? saved.composite : ''
    // 单选筛选与复合互斥（与手动切换行为同口径）：有单选则复合作废
    filter.value = f
    compositeFilter.value = f ? '' : c
  } catch { /* 存储形状损坏：静默忽略，回落全部 */ }
}

// 竞态保护：请求序号（搜索/翻页快速切换时慢请求不得覆盖新结果）
let loadSeq = 0
// 05D-O1: 复合筛选（active/completed）后端无该语义 → 拉全量后客户端过滤（pageSize 上限 200 循环，订单多时稍慢）
// REQ-037 批3 D1: 会话内缓存 + 进度提示
async function fetchAllOrders() {
  const q = searchQuery.value.trim() || ''
  const ck = fullOrdersCacheKey()
  // REQ-037 批3 D1: 缓存命中直接返回
  if (fullOrdersCache && fullOrdersCache.key === ck && Date.now() - fullOrdersCache.at < FULL_ORDERS_CACHE_TTL) {
    return fullOrdersCache.items
  }
  const status = filter.value || undefined
  const pageSize = FETCH_ALL_PAGE_SIZE
  const all = []
  const first = await artistApi.getOrders(status, { page: 1, pageSize, q: q || undefined })
  const firstItems = first.items ?? first
  all.push(...firstItems)
  const totalCount = first.total ?? firstItems.length
  // 围剿 a1-4: totalCount===0 时 pages=0 会让进度条 done/total 出现 NaN/Infinity——下限兜底为 1
  const pages = Math.max(1, Math.ceil(totalCount / pageSize))
  fetchProgress.value = { done: 1, total: pages }
  for (let p = 2; p <= pages; p++) {
    const res = await artistApi.getOrders(status, { page: p, pageSize, q: q || undefined })
    const items = res.items ?? res
    if (items.length) all.push(...items)
    fetchProgress.value = { done: p, total: pages }
  }
  return all
}

async function loadOrders() {
  const mySeq = ++loadSeq
  loading.value = true
  try {
    if (compositeFilter.value) {
      // 05D-O1: 复合筛选 → 全量拉取后过滤，orders.value 即过滤结果，total 不再误导
      const all = await fetchAllOrders()
      if (mySeq !== loadSeq) return
      // REQ-037 批3 D1: 写入缓存（seq 校验通过后，防旧请求污染）
      fullOrdersCache = { key: fullOrdersCacheKey(), items: all, at: Date.now() }
      fetchProgress.value = null
      const filtered = all.filter(o => compositeFilter.value === 'active' ? ACTIVE_STATUSES.includes(o.status) : COMPLETED_STATUSES.includes(o.status))
      orders.value = filtered
      total.value = filtered.length
      return
    }
    const q = searchQuery.value.trim() || undefined
    const res = await artistApi.getOrders(filter.value || undefined, { page: page.value, pageSize: pageSize.value, q })
    if (mySeq !== loadSeq) return
    orders.value = res.items ?? res
    total.value = res.total ?? orders.value.length
  } catch (err) {
    if (mySeq !== loadSeq) return
    ElMessage.error(err.message)
  } finally {
    if (mySeq === loadSeq) loading.value = false
  }
}

// 分页事件分发：复合筛选数据已在内存，翻页/切 pageSize 只切片不重拉
function onPageChange() {
  if (!compositeFilter.value) loadOrders()
}
function onSizeChange() {
  page.value = 1
  if (!compositeFilter.value) loadOrders()
}

// 05D-O2: 桌面整行点击进详情（移动端卡片原本就可点；详情按钮保留兼容）
function onRowClick(row) {
  router.push(`/orders/${row.id}?from=orders`)
}

onMounted(() => {
  // #2: 统计卡跳转带 ?status= 时初始化筛选（优先级高于 E9 记忆值）
  const q = route.query.status
  if (q && typeof q === 'string') {
    if (['pending', 'confirmed', 'wip', 'done', 'delivered', 'cancelled'].includes(q)) {
      filter.value = q
    } else if (q === 'active' || q === 'completed') {
      compositeFilter.value = q // 复合值走客户端过滤，不设 filter（加载全量）
    }
    rememberFilterState() // E9: URL 带来的筛选同样写入记忆
  } else {
    restoreFilterState() // E9: 无 URL 意图时恢复上次筛选
  }
  loadOrders()
})
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }

/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点 */
.group {
  margin: 12px 0;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.ol-search { width: 100%; max-width: 320px; }
.filter-bar { overflow-x: auto; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}

/* REQ-037 批3 D1: 复合筛选进度条 */
.fetch-progress { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
.fetch-progress-text { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); white-space: nowrap; }
.fetch-progress .el-progress { flex: 1; }

/* REQ-037 批3 D2: 订单号真链接（悬停显示链接感） */
.order-no-link { color: inherit; text-decoration: none; }
.order-no-link:hover { color: var(--hq); text-decoration: underline; }

/* ─── 表格换肤（REQ §二：表头下沉底色 / 行 hover 纸色底 / 金额日期等宽） ─── */
.el-table { --el-table-border-color: var(--line); --el-table-header-bg-color: var(--paper2); --el-table-row-hover-bg-color: var(--paper2); }
.el-table :deep(.el-table__header th) {
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600; color: var(--ink2);
  background: var(--paper2);
}
.el-table :deep(.el-table__row td) { color: var(--ink); }
.el-table :deep(.el-table__body tr) { transition: background var(--dur-fast); cursor: pointer; }
/* 斑马纹用极浅纸色（密集界面保持安静） */
.el-table :deep(.el-table__row--striped td) { background: color-mix(in srgb, var(--paper2) 55%, transparent); }

/* 巡检修复批 B7: 窄屏表格横向滚动（修法②——容器 overflow-x + 表格 min-width） */
.order-table-wrap { overflow-x: auto; }
.order-table-wrap .el-table { min-width: 1004px; }

/* R16: 缩略图 */
.order-thumb { width: 40px; height: 40px; border-radius: var(--r-s); display: block; cursor: zoom-in; }

/* ─── P0-3: 移动端卡片视图（≤768px；token 用后台纸墨变量） ─── */
.order-cards { display: none; }
@media (max-width: 768px) {
  .order-table-wrap { display: none; }
  .order-cards { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
  .order-card { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; cursor: pointer; text-decoration: none; color: inherit; }
  .order-card-top { display: flex; align-items: center; gap: 12px; }
  .order-card-thumb { width: 44px; height: 44px; border-radius: 6px; flex: none; }
  .order-card-main { flex: 1; min-width: 0; }
  .order-card-no { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
  .order-card-sub { font-size: 12.5px; color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .order-card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .order-card-time { font-size: 12.5px; color: var(--ink3); }
}
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

/* 02D P1-8: 空态墨线轻微浮沉（2s 缓动循环，位移 ≤4px，不缩放不旋转——克制动效纪律；
   reduced-motion 由 theme.css 全局兜底压缩） */
:deep(.v-empty-stroke) { animation: huiyue-empty-float 2s ease-in-out infinite; }
@keyframes huiyue-empty-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* ═══ REQ-037 批3 D3: ≤600px 筛选换行胶囊（桌面端 0 变化） ═══ */
@media (max-width: 600px) {
  .filter-bar { overflow-x: visible; }
  .filter-bar :deep(.el-radio-group) { display: flex; flex-wrap: wrap; gap: 8px; }
  .filter-bar :deep(.el-radio-button__inner) {
    border-radius: var(--r-s);
    border: 1px solid var(--line2);
    box-shadow: none;
  }
  .filter-bar :deep(.el-radio-button:first-child .el-radio-button__inner),
  .filter-bar :deep(.el-radio-button:last-child .el-radio-button__inner) { border-radius: var(--r-s); }
  .filter-bar :deep(.el-radio-button__inner.is-checked) { border-color: var(--hq); }
}
</style>
