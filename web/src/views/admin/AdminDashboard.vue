<template>
  <div class="admin-page">
    <!-- 页头：标题 + 说明 -->
    <div class="admin-page-head">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.panelTitle') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.dashboardSubtitle') }}</p>
      </div>
    </div>

    <!-- 双栏仪表盘（对标画师后台 Dashboard：宽屏 3fr/2fr，窄屏单列） -->
    <div class="dash-grid">
      <!-- 左栏：统计卡 + 画师列表 -->
      <div class="area-left">
        <!-- 统计卡（画师数/总订单/活跃订单） -->
        <div class="stat-grid">
          <el-card shadow="never" class="admin-stat-card">
            <div class="stat-num">{{ stats?.artistCount ?? '-' }}</div>
            <div class="stat-label">{{ $t('admin.artistCount') }}</div>
          </el-card>
          <el-card shadow="never" class="admin-stat-card">
            <div class="stat-num">{{ stats?.orderCount ?? '-' }}</div>
            <div class="stat-label">{{ $t('admin.totalOrders') }}</div>
          </el-card>
          <el-card shadow="never" class="admin-stat-card">
            <div class="stat-num">{{ stats?.activeOrders ?? '-' }}</div>
            <div class="stat-label">{{ $t('admin.activeOrders') }}</div>
          </el-card>
        </div>

        <!-- 画师列表（保留全列表，管理后台画师量小，信息完整优先） -->
        <el-card shadow="never" class="admin-section-card">
          <template #header>
            <div class="card-head">
              <span class="card-title">{{ $t('admin.artistList') }}</span>
              <el-button text type="primary" @click="$router.push('/admin/artists')">{{ $t('admin.manageArtists') }}</el-button>
            </div>
          </template>
          <el-table :data="artists" v-loading="loading" stripe>
            <el-table-column prop="name" :label="$t('admin.colName')" min-width="120">
              <template #default="{ row }">
                <span class="cell-name">{{ row.name }}</span>
                <el-tag v-if="row.isAdmin" size="small" type="danger" class="cell-tag">{{ $t('admin.adminTag') }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" min-width="120">
              <template #default="{ row }"><code class="cell-code">{{ row.subdomain }}</code></template>
            </el-table-column>
            <el-table-column prop="qq_number" :label="$t('admin.colQq')" width="110" />
            <el-table-column :label="$t('admin.colStatus')" width="110">
              <template #default="{ row }">
                <el-tag :type="ARTIST_STATUS_TYPE[row.status] || 'info'" effect="light">
                  {{ $t(`common.statusShort.${row.status}`) }}
                </el-tag>
              </template>
            </el-table-column>
            <!-- 824 响应式巡逻：操作列右固定，防窄屏藏进表内横滚 -->
            <el-table-column :label="$t('common.actions')" width="110" align="right" fixed="right">
              <template #default>
                <el-button size="small" type="primary" plain @click="$router.push('/admin/artists')">{{ $t('admin.manage') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>

      <!-- 右栏：快捷操作 + 留言管理（运营功能，独立分组不再堆叠） -->
      <div class="area-right">
        <!-- 快捷操作 -->
        <el-card shadow="never" class="admin-section-card">
          <template #header>
            <div class="card-head">
              <span class="card-title">{{ $t('admin.quickActions') }}</span>
            </div>
          </template>
          <!-- 819-I：控件在右（快捷入口按按钮组右对齐，不做逐行说明） -->
          <div class="quick-list">
            <el-button type="primary" plain @click="$router.push('/admin/artists')">{{ $t('admin.manageArtists') }}</el-button>
            <el-button plain @click="$router.push('/admin/greetings')">{{ $t('admin.greetingManage') }}</el-button>
            <el-button plain @click="$router.push('/admin/default-workflow')">{{ $t('admin.defaultWorkflow') }}</el-button>
            <el-button plain @click="$router.push('/admin/health')">{{ $t('admin.health.title') }}</el-button>
          </div>
        </el-card>

        <!-- F4: 留言管理（跨画师，强制删除） -->
        <el-card shadow="never" class="admin-section-card gb-card">
          <template #header>
            <div class="card-head">
              <span class="card-title">{{ $t('admin.guestbook.title') }}</span>
            </div>
          </template>
          <!-- 819-I：一行一事——说明在左、筛选控件在右（REQ-022 F5 三维筛选结构不动） -->
          <div class="row gb-filter-row">
            <div class="gb-filter-text">
              <div class="lab">{{ $t('admin.guestbook.filterLabel') }}</div>
              <div class="desc">{{ $t('admin.guestbook.filterDesc') }}</div>
            </div>
            <div class="gb-filters">
              <el-select v-model="filterArtistId" size="small" clearable style="width: 132px" :placeholder="$t('admin.guestbook.colArtist')" @change="loadAdminMessages">
                <el-option v-for="a in artists" :key="a.id" :label="a.name" :value="a.id" />
              </el-select>
              <el-select v-model="filterStatus" size="small" clearable style="width: 112px" :placeholder="$t('admin.guestbook.colStatus')" @change="loadAdminMessages">
                <el-option :label="$t('admin.guestbook.statusPending')" value="pending" />
                <el-option :label="$t('admin.guestbook.statusApproved')" value="approved" />
                <el-option :label="$t('admin.guestbook.statusRejected')" value="rejected" />
              </el-select>
              <el-select v-model="filterReplied" size="small" clearable style="width: 112px" :placeholder="$t('admin.guestbook.filterByReplied')" @change="loadAdminMessages">
                <el-option :label="$t('admin.guestbook.repliedYes')" :value="1" />
                <el-option :label="$t('admin.guestbook.repliedNo')" :value="0" />
              </el-select>
            </div>
          </div>
          <!-- P1-B：留言加载失败不再静默——错误横幅 + 重试；失败不显示「暂无留言」空态 -->
          <div v-if="msgLoadFailed" class="load-error-banner gb-error" role="alert">
            <span>{{ t('common.networkError') }}</span>
            <el-button size="small" @click="loadAdminMessages">{{ t('dashboard.retry') }}</el-button>
          </div>
          <!-- T 波：el-table 行由 EP 内部渲染、无法挂 Vue 过渡，改等价 CSS 网格列表 +
               TransitionGroup 行级淡出 var(--dur-mid)——删除留言不再瞬变 -->
          <div v-else-if="msgLoading || adminMessages.length" class="gb-table-wrap">
            <div class="gb-list-head">
              <span class="gb-col gb-col--artist">{{ $t('admin.guestbook.colArtist') }}</span>
              <span class="gb-col gb-col--nick">{{ $t('admin.guestbook.colNickname') }}</span>
              <span class="gb-col gb-col--content">{{ $t('admin.guestbook.colContent') }}</span>
              <span class="gb-col gb-col--status">{{ $t('admin.guestbook.colStatus') }}</span>
              <span class="gb-col gb-col--time">{{ $t('admin.guestbook.colTime') }}</span>
              <span class="gb-col gb-col--actions"></span>
            </div>
            <TransitionGroup tag="div" name="gb-row" class="gb-list" v-loading="msgLoading">
              <div v-for="row in pagedAdminMessages" :key="row.id" class="gb-row">
                <span class="gb-col gb-col--artist" :data-label="$t('admin.guestbook.colArtist')">{{ row.artist_name || `#${row.artist_id}` }}</span>
                <span class="gb-col gb-col--nick" :data-label="$t('admin.guestbook.colNickname')">{{ row.nickname }}</span>
                <span class="gb-col gb-col--content" :title="row.content" :data-label="$t('admin.guestbook.colContent')">{{ row.content }}</span>
                <span class="gb-col gb-col--status" :data-label="$t('admin.guestbook.colStatus')">
                  <el-tag size="small" effect="light" :type="{ pending: 'warning', approved: 'success', rejected: 'info' }[row.status]">{{ $t(`admin.guestbook.status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`) }}</el-tag>
                </span>
                <span class="gb-col gb-col--time" :data-label="$t('admin.guestbook.colTime')">{{ formatDateTime(row.created_at) }}</span>
                <span class="gb-col gb-col--actions">
                  <el-button size="small" type="danger" plain @click="handleDeleteMessage(row)">{{ $t('admin.guestbook.delete') }}</el-button>
                </span>
              </div>
            </TransitionGroup>
            <!-- b3 清扫：留言列表客户端分页（全量已拉取，仅限制 DOM 渲染量；筛选切换重置页码） -->
            <div v-if="adminMessages.length > GB_PAGE_SIZE" class="pager">
              <el-pagination
                v-model:current-page="messagesPage"
                :page-size="GB_PAGE_SIZE"
                :total="adminMessages.length"
                layout="total, prev, pager, next"
              />
            </div>
          </div>
          <el-empty v-else-if="!msgLoadFailed" :description="$t('admin.guestbook.empty')" />
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '../../api/index'
import type { GlobalStats, AdminArtistItem, AdminGuestbookMessage, AdminMessageFilters } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../utils/datetime'
import { ARTIST_STATUS_TYPE } from '../../constants/order'

const { t } = useI18n()
const stats = ref<GlobalStats | null>(null)
const artists = ref<AdminArtistItem[]>([])
const loading = ref(true)

// ─── F4: 留言管理（跨画师）；REQ-022 F5: 三维筛选（画师/审核状态/是否已回复） ───
const adminMessages = ref<AdminGuestbookMessage[]>([])
const msgLoading = ref(true)
const msgLoadFailed = ref(false)
const messagesPage = ref(1)
/** b3 清扫：留言列表分页大小（客户端截断，防全量渲染） */
const GB_PAGE_SIZE = 10
const pagedAdminMessages = computed(() =>
  adminMessages.value.slice((messagesPage.value - 1) * GB_PAGE_SIZE, messagesPage.value * GB_PAGE_SIZE)
)
const filterArtistId = ref<number | null>(null)
const filterStatus = ref<AdminMessageFilters['status'] | null>(null)
const filterReplied = ref<AdminMessageFilters['replied'] | null>(null)

async function loadAdminMessages() {
  messagesPage.value = 1
  msgLoading.value = true
  msgLoadFailed.value = false
  try {
    adminMessages.value = (await adminApi.getMessages({
      artistId: filterArtistId.value ?? undefined,
      status: filterStatus.value ?? undefined,
      replied: filterReplied.value ?? undefined
    })) || []
  } catch {
    // P1-B：筛选/加载失败清旧数据（防张冠李戴），明示错误 + 重试
    adminMessages.value = []
    msgLoadFailed.value = true
  }
  finally { msgLoading.value = false }
}

async function handleDeleteMessage(row: AdminGuestbookMessage) {
  try {
    await ElMessageBox.confirm(
      t('admin.guestbook.deleteConfirm'),
      t('admin.guestbook.title'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await adminApi.deleteMessage(row.id)
    ElMessage.success(t('admin.guestbook.deleted'))
    adminMessages.value = adminMessages.value.filter(m => m.id !== row.id)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

onMounted(async () => {
  try {
    const [s, a] = await Promise.all([
      adminApi.getStats(),
      adminApi.getArtists()
    ])
    stats.value = s
    artists.value = a
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
  // F4/F5: 留言列表（独立失败，不阻塞其他模块；筛选变更时重新请求后端）
  await loadAdminMessages()
})
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807）——纸墨 token + 布局分层 ═══
   ═══ 2026-08-08 派工：主页重排为仪表盘（对标画师后台 .dash-grid 双栏节奏）──
   回收站迁出到画师管理页（ArtistManage），主页不再出现回收站 */

/* ─── 双栏仪表盘（对齐画师后台 Dashboard：宽屏 3fr/2fr，窄屏单列） ───
   813-fq-tail-shared 战役 S：全站管理后台统一两档断点——≤900px 紧凑 / >900px 宽屏 */
.dash-grid { display: flex; flex-direction: column; gap: var(--sp-4, 16px); }

@media (min-width: 901px) {
  .dash-grid {
    display: grid;
    grid-template-columns: 3fr 2fr;
    column-gap: var(--sp-4, 16px);
    row-gap: var(--sp-4, 16px);
    align-items: start;
  }
  .area-left,
  .area-right {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4, 16px);
  }
}

/* ─── 统计卡 ─── */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4, 16px); }
.stat-num {
  font-size: 30px; font-weight: bold; color: var(--ink);
  font-family: var(--f-d); text-align: center;
  font-variant-numeric: tabular-nums; margin-top: var(--sp-2, 8px);
}
.stat-label { color: var(--ink2); font-size: 13px; text-align: center; margin-bottom: var(--sp-2, 8px); }

/* ─── 区块卡 ─── */
.card-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2, 8px); }
.card-title { font-size: var(--fs-section, 17px); font-weight: 600; color: var(--ink); }

/* ─── 快捷操作：卡片内按钮组（wrap 等宽节奏） ─── */
/* 819-I：控件在右——按钮组整体右对齐 */
.quick-list { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--sp-2, 8px); }

/* ─── P1-B：留言加载失败横幅（复用公告页 P0 同款模式，朱砂浸染克制） ─── */
.load-error-banner {
  padding: 12px 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--zs-t); color: var(--zs); border-radius: var(--r-m); font-size: 13px;
}

/* ─── 表格单元格细节 ─── */
.cell-name { font-weight: 600; color: var(--ink); }
.cell-tag { margin-left: var(--sp-1, 4px); }
.cell-code { font-size: 12px; color: var(--ink2); background: var(--paper2); padding: 4px 8px; border-radius: var(--r-s); }

/* ─── 819-I：一行一事（说明在左、控件在右，对齐 QuickNote 基准） ─── */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.gb-filter-text { min-width: 0; }
.gb-filters { display: flex; gap: var(--sp-2, 8px); flex-wrap: wrap; justify-content: flex-end; }

/* ─── T 波：留言表 el-table → 等价网格列表（列宽对齐原 small/stripe/max-height），TransitionGroup 行级淡出 ─── */
.gb-list-head,
.gb-row {
  display: grid;
  grid-template-columns: 110px 100px minmax(160px, 1fr) 80px 150px 90px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  box-sizing: border-box;
}
.gb-list-head {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink2);
  background: var(--paper2);
  border: 1px solid var(--line);
  border-bottom: none;
  border-radius: var(--r-m) var(--r-m) 0 0;
}
.gb-table-wrap { border-radius: var(--r-m); }
.gb-list {
  position: relative;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 0 0 var(--r-m) var(--r-m);
}
.gb-row {
  background: var(--card);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink);
}
.gb-row:nth-child(even) { background: var(--paper2); }
.gb-row:last-child { border-bottom: none; }
.gb-col--content { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gb-col--actions { text-align: right; }
.gb-row-enter-active,
.gb-row-leave-active { transition: opacity var(--dur-mid); }
.gb-row-enter-from,
.gb-row-leave-to { opacity: 0; }
.gb-row-leave-active { position: absolute; width: 100%; }
/* b3 清扫：留言分页（与 ArtistManage 回收站分页同款右对齐） */
.pager { display: flex; justify-content: flex-end; margin-top: var(--sp-4, 16px); }

/* 波 S：断点统一 768→900 */
@media (max-width: 900px) {
  .stat-grid { grid-template-columns: 1fr; }
}

/* P1-B：≤600px 留言纵向卡片（文本行 + 操作行），防 390px 横向溢出；
   桌面端（≥901px）零变 */
@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .gb-filters { justify-content: flex-start; }
}
@media (max-width: 600px) {
  .gb-list-head { display: none; }
  .gb-row {
    grid-template-columns: 1fr auto;
    row-gap: 8px;
    padding: 12px;
    align-items: start;
  }
  .gb-col--artist,
  .gb-col--nick,
  .gb-col--content,
  .gb-col--actions {
    grid-column: 1 / -1;
  }
  .gb-col--status { grid-column: 1; }
  .gb-col--time { grid-column: 2; text-align: right; }
  .gb-col--content { white-space: normal; overflow: visible; text-overflow: clip; }
  .gb-col--actions { text-align: right; }
  .gb-col--artist::before,
  .gb-col--nick::before,
  .gb-col--content::before,
  .gb-col--status::before,
  .gb-col--time::before {
    content: attr(data-label);
    display: block;
    font-size: 11px;
    color: var(--ink3);
    margin-bottom: 4px;
  }
}
</style>
