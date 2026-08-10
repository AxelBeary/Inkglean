<template>
  <div class="dashboard">
    <ArtistLayout>
      <!-- v0.18 双栏布局（C58）：>768px 双栏（左 60% / 右 40%），≤768px 单列
           DOM 顺序 = 窄屏顺序（验收 6.6）；宽屏通过 grid-row/grid-column 显式分栏（验收 6.4/6.5）
           各模块独立加载/独立失败，互不阻塞（验收 §9.1） -->
      <div class="dash-grid">
        <!-- 左栏：问候区（含今日统计行）→ 收入统计 → 统计卡片 ×3 → 合并列表
             左栏独立 wrapper（flex 列紧凑堆叠，与右栏互不对齐行高） -->
        <div class="area-left">
          <div class="area area-greeting enter-stagger" :style="{ '--stagger': 0 }">
            <GreetingHero :stats="stats" />
          </div>
          <div class="area area-revenue enter-stagger" :style="{ '--stagger': 1 }">
            <RevenueChart />
          </div>
          <div class="area area-stats enter-stagger" :style="{ '--stagger': 2 }">
            <StatCards :stats="stats" />
          </div>
          <div class="area area-todo enter-stagger" :style="{ '--stagger': 3 }">
            <TodoList />
          </div>
        </div>

        <!-- 右栏：名额概览卡（有则显示）→ 快捷操作区 → 状态切换 → 最近活动流
             右栏独立 wrapper（flex 列紧凑堆叠，不与左栏行高对齐——避免左栏高卡片顶出大片空白） -->
        <div class="area-right">
          <div class="area area-slot enter-stagger" :style="{ '--stagger': 4 }">
            <SlotOverview />
          </div>
          <div class="area area-quick enter-stagger" :style="{ '--stagger': 5 }">
            <QuickActions />
          </div>
          <div class="area area-activity enter-stagger" :style="{ '--stagger': 6 }">
            <ActivityFeed />
          </div>

          <!-- F4: 留言审核（右栏 row 5） -->
          <div class="area area-guestbook enter-stagger" :style="{ '--stagger': 7 }">
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
      </div>
    </ArtistLayout>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { useArtistStore } from '../../stores/artist.js'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../utils/datetime.js'
import { subscribeReconnect } from '../../utils/reconnect.js'
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

/** 仪表盘关键数据重拉（断网重连/回前台复用；各模块独立失败互不阻塞） */
async function refreshAll() {
  // 拉取画师资料失败不白屏也不额外登出（401 由 api 拦截器/store 处理），仅记录
  try {
    await store.fetchProfile()
  } catch (err) {
    // eslint-disable-next-line no-console -- 本地兜底日志：资料拉取失败不阻断仪表盘其他模块
    console.warn('[Dashboard] fetchProfile failed:', err)
  }
  // 统计卡片 + 今日统计行（独立失败，不阻塞其他模块）
  try { stats.value = await artistApi.getStats() } catch { /* ignore */ }
  // F4: 留言审核（独立失败，不阻塞其他模块）
  loadGuestbook()
}

let unsubscribeReconnect = null
onMounted(() => {
  refreshAll()
  // G-3（R-16）: 断网重连后复用 refreshAll 重拉
  unsubscribeReconnect = subscribeReconnect(refreshAll)
})
onUnmounted(() => {
  unsubscribeReconnect?.()
})

// ─── F4: 留言审核 ───
const guestbookMessages = ref([])
const guestbookLoading = ref(true)
const replyDrafts = reactive({})

const pendingCount = computed(() => guestbookMessages.value.filter(m => m.status === 'pending').length)

async function loadGuestbook() {
  guestbookLoading.value = true
  try {
    // G-8（F-2 适配）: 后端改分页响应 { items, total, page, pageSize }；
    // 留言卡片取最新一页（pageSize=20 = 后端默认，行为与旧全量列表的口径对齐为"最新 N 条"）
    const res = await artistApi.getMessages({ pageSize: 20 })
    // 管理员已删除的留言不进入画师审核列表
    guestbookMessages.value = (res.items || []).filter(m => !m.deleted_by_admin)
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
  /* 左栏 + 右栏：各自独立列（flex 紧凑堆叠，互不对齐行高——
     避免一栏高卡片把另一栏下方区块顶出大片空白，用户 X①② 反馈） */
  .area-left {
    grid-column: 1;
    grid-row: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .area-right {
    grid-column: 2;
    grid-row: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

/* 02C: 仪表盘各区 staggered 进入（一次性 fade-up，间隔 60ms；克制 0.3s ease-out；total = 7x60ms = 420ms） */
@keyframes dash-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.enter-stagger {
  animation: dash-enter 0.3s var(--ease-out) both;
  animation-delay: calc(var(--stagger, 0) * 60ms);
}
/* 02C: reduced-motion 显式兜底——theme.css 全局只压 duration 不压 delay，delay 期间 both 填充态会空白 */
@media (prefers-reduced-motion: reduce) {
  .enter-stagger { animation: none; }
}

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
/* 克制动效批（2026-08-07 用户反馈批：留言审核按钮按压 ≤0.2s，含 transition 特异性恢复过渡） */
.artist-scope .gb-mod-actions :deep(.el-button) { transition: color .25s, background-color .25s, border-color .25s, transform 0.15s ease-out; }
.artist-scope .gb-mod-actions :deep(.el-button:active),
.artist-scope .gb-mod-reply-box :deep(.el-button:active) { transform: scale(0.98); }
</style>
