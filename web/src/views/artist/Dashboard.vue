<template>
  <div class="dashboard">
    <ArtistLayout>
      <!-- v0.18 双栏布局（C58）：>768px 双栏（左 60% / 右 40%），≤768px 单列
           DOM 顺序 = 窄屏顺序（验收 6.6）；宽屏通过 grid-row/grid-column 显式分栏（验收 6.4/6.5）
           各模块独立加载/独立失败，互不阻塞（验收 §9.1） -->
      <div class="dash-grid">
        <!-- 左栏：问候区（含今日统计行）→ 收入统计 → 统计卡片 ×3 → 合并列表 -->
        <div class="area area-greeting">
          <GreetingHero :stats="stats" />
        </div>
        <div class="area area-revenue">
          <RevenueChart />
        </div>
        <div class="area area-stats">
          <StatCards :stats="stats" />
        </div>
        <div class="area area-todo">
          <TodoList />
        </div>

        <!-- REQ-033: 门面统计（管理员开关控制显隐；enabled=false 完全不渲染） -->
        <div class="area area-tracking" v-if="trackingStats?.enabled">
          <el-card>
            <template #header><CardHead :title="$t('dashboard.trackingTitle')" /></template>
            <div class="tracking-mini">
              <div class="tracking-total">{{ trackingStats?.total ?? '-' }}</div>
              <div class="tracking-label">{{ $t('dashboard.trackingTotal') }}</div>
              <div class="tracking-list" v-if="trackingStats?.byName?.length">
                <div v-for="item in trackingStats.byName.slice(0, 6)" :key="item.name" class="tracking-row">
                  <span class="tracking-name">{{ $t(`dashboard.trackingNames.${item.name}`, item.name) }}</span>
                  <span class="tracking-count">{{ item.count }}</span>
                </div>
              </div>
            </div>
          </el-card>
        </div>

        <!-- 右栏：名额概览卡（有则显示）→ 快捷操作区 → 状态切换 → 最近活动流 -->
        <div class="area area-slot">
          <SlotOverview />
        </div>
        <div class="area area-quick">
          <QuickActions />
        </div>
        <div class="area area-activity">
          <ActivityFeed />
        </div>

        <!-- F4: 留言审核（右栏 row 5） -->
        <div class="area area-guestbook">
          <el-card v-loading="guestbookLoading">
            <template #header>
              <CardHead :title="$t('dashboard.guestbookTitle')">
                <template #extra>
                  <StatusChip v-if="pendingCount > 0" type="pend">{{ pendingCount }}</StatusChip>
                </template>
              </CardHead>
            </template>
            <div v-if="guestbookMessages.length" class="gb-mod-list">
              <div
                v-for="m in guestbookMessages" :key="m.id"
                class="gb-mod-item" :class="{ 'gb-mod-item--pending': m.status === 'pending' }"
              >
                <div class="gb-mod-head">
                  <span class="gb-mod-nick">{{ m.nickname }}</span>
                  <StatusChip :type="{ pending: 'pend', approved: 'done', rejected: 'cancel' }[m.status]">
                    {{ $t(`dashboard.guestbook${m.status.charAt(0).toUpperCase() + m.status.slice(1)}`) }}
                  </StatusChip>
                </div>
                <p class="gb-mod-content">{{ m.content }}</p>
                <p class="gb-mod-time">{{ formatDateTime(m.created_at) }}</p>
                <!-- 已有回复：展示 -->
                <div class="gb-mod-reply" v-if="m.artist_reply">
                  <span class="gb-mod-reply-label">{{ $t('dashboard.guestbookReply') }}：</span>{{ m.artist_reply }}
                </div>
                <!-- 操作区：pending 可通过/拒绝；所有未删除的可回复 -->
                <div class="gb-mod-actions" v-if="m.status === 'pending'">
                  <el-button size="small" type="primary" @click="approveMsg(m)">{{ $t('dashboard.guestbookApprove') }}</el-button>
                  <el-button size="small" @click="rejectMsg(m)">{{ $t('dashboard.guestbookReject') }}</el-button>
                </div>
                <div class="gb-mod-reply-box">
                  <el-input
                    v-model="replyDrafts[m.id]"
                    type="textarea" :rows="2" maxlength="500"
                    :placeholder="$t('dashboard.guestbookReplyPlaceholder')"
                  />
                  <el-button
                    size="small" style="margin-top: 6px"
                    :disabled="!(replyDrafts[m.id] || '').trim()"
                    @click="replyMsg(m)"
                  >
                    {{ $t('dashboard.guestbookReplySave') }}
                  </el-button>
                </div>
              </div>
            </div>
            <InkEmpty v-else :title="$t('dashboard.guestbookEmpty')" />
          </el-card>
        </div>
      </div>
    </ArtistLayout>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useArtistStore } from '../../stores/artist.js'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../utils/datetime.js'
import ArtistLayout from '../../components/ArtistLayout.vue'
// v0.38: 统一视觉组件（REQ-026 §二）
import CardHead from '../../components/artist/visual/CardHead.vue'
import StatusChip from '../../components/artist/visual/StatusChip.vue'
import InkEmpty from '../../components/artist/visual/InkEmpty.vue'
import GreetingHero from '../../components/artist/dashboard/GreetingHero.vue'
import RevenueChart from '../../components/artist/dashboard/RevenueChart.vue'
import StatCards from '../../components/artist/dashboard/StatCards.vue'
import TodoList from '../../components/artist/dashboard/TodoList.vue'
import QuickActions from '../../components/artist/dashboard/QuickActions.vue'
import ActivityFeed from '../../components/artist/dashboard/ActivityFeed.vue'
import SlotOverview from '../../components/artist/dashboard/SlotOverview.vue'

const { t } = useI18n()
const store = useArtistStore()
const stats = ref(null)
// REQ-033: 门面统计（独立失败静默，区块 v-if 依赖 enabled）
const trackingStats = ref(null)

onMounted(async () => {
  await store.fetchProfile()
  // 统计卡片 + 今日统计行（独立失败，不阻塞其他模块）
  try { stats.value = await artistApi.getStats() } catch { /* ignore */ }
  // REQ-033: 门面统计（独立失败静默，不阻塞其他模块）
  try { trackingStats.value = await artistApi.getMyTrackingSummary() } catch { /* ignore */ }
  // F4: 留言审核（独立失败，不阻塞其他模块）
  loadGuestbook()
})

// ─── F4: 留言审核 ───
const guestbookMessages = ref([])
const guestbookLoading = ref(true)
const replyDrafts = reactive({})

const pendingCount = computed(() => guestbookMessages.value.filter(m => m.status === 'pending').length)

async function loadGuestbook() {
  guestbookLoading.value = true
  try {
    const msgs = await artistApi.getMessages()
    // 管理员已删除的留言不进入画师审核列表
    guestbookMessages.value = (msgs || []).filter(m => !m.deleted_by_admin)
  } catch { /* ignore */ }
  finally { guestbookLoading.value = false }
}

async function approveMsg(m) {
  try {
    const updated = await artistApi.approveMessage(m.id)
    Object.assign(m, updated)
    ElMessage.success(t('dashboard.guestbookApprovedMsg'))
  } catch (err) { ElMessage.error(err.message) }
}

async function rejectMsg(m) {
  try {
    await artistApi.rejectMessage(m.id)
    m.status = 'rejected'
    ElMessage.success(t('dashboard.guestbookRejectedMsg'))
  } catch (err) { ElMessage.error(err.message) }
}

async function replyMsg(m) {
  const reply = (replyDrafts[m.id] || '').trim()
  if (!reply) return
  try {
    const updated = await artistApi.replyMessage(m.id, reply)
    Object.assign(m, updated)
    replyDrafts[m.id] = ''
    ElMessage.success(t('dashboard.guestbookRepliedMsg'))
  } catch (err) { ElMessage.error(err.message) }
}
</script>

<style scoped>
/* ─── 窄屏默认：单列，DOM 顺序即展示顺序（验收 6.6） ─── */
.dash-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── 宽屏：双栏（左 60% / 右 40%），显式行列分配（验收 6.1~6.5） ─── */
@media (min-width: 769px) {
  .dash-grid {
    display: grid;
    grid-template-columns: 3fr 2fr;
    column-gap: 16px;
    row-gap: 16px;
    align-items: start;
  }
  /* 左栏 */
  .area-greeting { grid-column: 1; grid-row: 1; }
  .area-revenue  { grid-column: 1; grid-row: 2; }
  .area-stats    { grid-column: 1; grid-row: 3; }
  .area-todo     { grid-column: 1; grid-row: 4; }
  .area-tracking { grid-column: 1; grid-row: 5; }
  /* 右栏 */
  .area-slot     { grid-column: 2; grid-row: 1; }
  .area-quick    { grid-column: 2; grid-row: 2; }
  .area-activity { grid-column: 2; grid-row: 3; }
  .area-guestbook { grid-column: 2; grid-row: 4; }
}

/* ─── F4: 留言审核区（v0.38 token 换肤） ─── */
/* ─── REQ-033: 门面统计（管理员开关控制显隐） ─── */
.tracking-mini { display: flex; flex-direction: column; align-items: center; padding: 8px 0 4px; }
.tracking-total { font-size: 28px; font-weight: bold; color: var(--ink); font-family: var(--f-d); font-variant-numeric: tabular-nums; }
.tracking-label { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 13px); margin: 4px 0 12px; }
.tracking-list { width: 100%; display: flex; flex-direction: column; gap: 6px; }
.tracking-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: var(--r-m); background: var(--card); border: 1px solid var(--line); font-size: calc(var(--font-scale, 1) * 13px); }
.tracking-name { color: var(--ink2); }
.tracking-count { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }

/* ─── F4: 留言审核区（v0.38 token 换肤） ─── */
.gb-mod-list { display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto; }
.gb-mod-item {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  background: var(--card);
}
/* pending 待确认：藤黄软底（语义：待确认） */
.gb-mod-item--pending {
  background: var(--th-t);
  border-color: color-mix(in srgb, var(--th) 45%, transparent);
}
.gb-mod-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.gb-mod-nick { font-weight: 700; font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink); }
.gb-mod-content { margin: 0 0 4px; font-size: calc(var(--font-scale, 1) * 13px); line-height: 1.6; word-break: break-word; color: var(--ink2); }
.gb-mod-time { margin: 0 0 8px; font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink3); }
.gb-mod-reply {
  margin-bottom: 8px;
  padding: 6px 10px;
  background: var(--hq-t);
  border-radius: 6px;
  font-size: calc(var(--font-scale, 1) * 12px);
  line-height: 1.5;
  color: var(--ink2);
}
.gb-mod-reply-label { font-weight: 700; color: var(--hq-d); }
.gb-mod-actions { margin-bottom: 8px; }
</style>
