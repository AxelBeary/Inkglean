<template>
  <h2 class="font-display gb-page-title">{{ $t('guestbookManage.title') }}</h2>

  <!-- 820-L：留言功能关闭 → 直接访问给空态（导航与角标已隐藏，此处兜底） -->
  <div v-if="featureDisabled" class="gb-disabled">
    <el-empty :description="$t('guestbookManage.disabled')" />
  </div>

  <template v-else>
    <!-- 818-H：筛选行按行结构整理（说明在左、控件在右） -->
    <div class="group gm-filter">
      <div class="group-head">{{ $t('guestbookManage.filterLabel') }}</div>
      <!-- 状态筛选 + F8 语言筛选 -->
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('guestbookManage.filterLabel') }}</div>
          <div class="desc">{{ $t('guestbookManage.filterDesc') }}</div>
        </div>
        <div class="ctrl">
          <el-radio-group v-model="statusFilter" size="default" @change="onFilterChange">
            <el-radio-button value="">{{ $t('guestbookManage.all') }}</el-radio-button>
            <el-radio-button value="pending">
              {{ $t('dashboard.guestbookPending') }}
              <el-badge v-if="pendingCount > 0" :value="pendingCount" class="gm-badge" />
            </el-radio-button>
            <el-radio-button value="approved">{{ $t('dashboard.guestbookApproved') }}</el-radio-button>
            <el-radio-button value="rejected">{{ $t('dashboard.guestbookRejected') }}</el-radio-button>
          </el-radio-group>
          <el-select
            v-model="languageFilter" size="default" class="gm-language-select"
            @change="onFilterChange"
          >
            <el-option value="" :label="$t('guestbookManage.languageAll')" />
            <el-option
              v-for="lang in languageOptions" :key="lang.value"
              :value="lang.value" :label="lang.label"
            />
          </el-select>
        </div>
      </div>
    </div>

    <!-- v130: 批量审核操作条（勾选后出现；回复仍逐条，审核可批量） -->
    <div v-if="selectedIds.size > 0" class="gm-batch-bar">
      <el-checkbox
        :model-value="isAllFilteredSelected"
        :indeterminate="selectedIds.size > 0 && !isAllFilteredSelected"
        @change="toggleSelectAll"
      >
        {{ $t('guestbookManage.selectAll') }}
      </el-checkbox>
      <span class="gm-batch-count">{{ $t('guestbookManage.selectedCount', { n: selectedIds.size }) }}</span>
      <el-button size="small" type="success" :loading="bulkBusy" @click="bulkDo('approve')">
        {{ $t('guestbookManage.bulkApprove') }}
      </el-button>
      <el-popconfirm :title="$t('guestbookManage.bulkRejectConfirm', { n: selectedIds.size })" @confirm="bulkDo('reject')">
        <template #reference>
          <el-button size="small" type="danger" :disabled="bulkBusy">{{ $t('guestbookManage.bulkReject') }}</el-button>
        </template>
      </el-popconfirm>
      <el-button size="small" text :disabled="bulkBusy" @click="selectedIds = new Set<number>()">{{ $t('common.cancel') }}</el-button>
    </div>

    <!-- 留言列表 -->
    <div v-loading="loading" class="gm-list">
      <div v-for="msg in pagedMessages" :key="msg.id" class="gm-card" :class="[`gm-card--${msg.status}`, { 'gm-card--selected': selectedIds.has(msg.id) }]">
        <div class="gm-card-head">
          <el-checkbox
            class="gm-select" :model-value="selectedIds.has(msg.id)"
            :aria-label="`${$t('guestbookManage.selectAll')} - ${msg.nickname}`"
            @change="toggleSelect(msg.id)"
          />
          <span class="gm-nickname">{{ msg.nickname }}</span>
          <span v-if="msg.language" class="gm-lang-badge">{{ languageLabel(msg.language) }}</span>
          <el-tag :type="statusType(msg.status)" size="small">{{ $t(`dashboard.guestbook${statusLabel(msg.status)}`) }}</el-tag>
          <span class="gm-time">{{ formatDateTime(msg.created_at) }}</span>
        </div>
        <p class="gm-content">{{ msg.content }}</p>

        <!-- 已有回复 -->
        <div v-if="msg.artist_reply" class="gm-reply">
          <span class="gm-reply-label">{{ $t('guestbookManage.replyLabel') }}</span>
          <p class="gm-reply-text">{{ msg.artist_reply }}</p>
        </div>

        <!-- 回复编辑区（展开时） -->
        <div v-if="replyingId === msg.id" class="gm-reply-editor">
          <el-input
            v-model="replyText" type="textarea" :rows="2"
            :placeholder="$t('dashboard.guestbookReplyPlaceholder')"
            maxlength="500" show-word-limit
          />
          <div class="gm-reply-actions">
            <el-button size="small" @click="replyingId = null">{{ $t('common.cancel') }}</el-button>
            <el-button size="small" type="primary" :loading="replySaving" :disabled="!replyText.trim()" @click="submitReply(msg)">
              {{ $t('dashboard.guestbookReplySave') }}
            </el-button>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="gm-actions">
          <el-button
            v-if="msg.status !== 'approved'"
            size="small" type="success" :loading="actionBusyId === msg.id"
            @click="approve(msg)"
          >
            {{ $t('dashboard.guestbookApprove') }}
          </el-button>
          <el-popconfirm
            v-if="msg.status !== 'rejected'"
            :title="$t('guestbookManage.rejectConfirm')"
            @confirm="reject(msg)"
          >
            <template #reference>
              <el-button size="small" type="danger" :disabled="actionBusyId === msg.id">{{ $t('dashboard.guestbookReject') }}</el-button>
            </template>
          </el-popconfirm>
          <el-button
            size="small"
            @click="openReply(msg)"
          >
            {{ msg.artist_reply ? $t('guestbookManage.editReply') : $t('dashboard.guestbookReply') }}
          </el-button>
        </div>
      </div>

      <el-empty v-if="!loading && filteredMessages.length === 0" :description="$t('dashboard.guestbookEmpty')" />
    </div>

    <!-- 分页（后端返回全量，前端本地分页） -->
    <div v-if="filteredMessages.length > pageSize" class="gm-pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="filteredMessages.length"
        layout="total, prev, pager, next"
      />
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { GuestbookMessage } from '../../api/types'
import { artistApi } from '../../api/index'
import { useArtistStore } from '../../stores/artist'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../utils/datetime'
import { trackEvent } from '../../utils/track'
import { UI_PAGE_SIZE, GUESTBOOK_FETCH_ALL_PAGE_SIZE } from '../../constants/pagination'

const { t } = useI18n()
const store = useArtistStore()

const messages = ref<GuestbookMessage[]>([])
const loading = ref(true)
/** 820-L：留言功能关闭标记（profile 未加载时先取，取不到按开启处理，由后端守卫兜底） */
const featureDisabled = ref(false)
const statusFilter = ref('')
const languageFilter = ref('')
const page = ref(1)
const pageSize = UI_PAGE_SIZE

// 回复状态
const replyingId = ref<number | null>(null)
const replyText = ref('')
const replySaving = ref(false)
// A3: 审核动作行级 pending 锁（approve/reject 请求期间仅锁定当前行，防连点不阻塞其他行）
const actionBusyId = ref<number | null>(null)

// ─── v130: 批量审核（批准/婉拒；选择范围=当前筛选集，跨页可全选） ───
const selectedIds = ref<Set<number>>(new Set<number>())
const bulkBusy = ref(false)

function toggleSelect(id: number) {
  const next = new Set<number>(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

const isAllFilteredSelected = computed(() =>
  filteredMessages.value.length > 0 && filteredMessages.value.every(m => selectedIds.value.has(m.id))
)
function toggleSelectAll(checked: boolean | string | number) {
  const next = new Set<number>(selectedIds.value)
  for (const m of filteredMessages.value) {
    if (checked) next.add(m.id)
    else next.delete(m.id)
  }
  selectedIds.value = next
}

async function bulkDo(action: 'approve' | 'reject') {
  const ids = [...selectedIds.value]
  if (!ids.length || bulkBusy.value) return
  bulkBusy.value = true
  try {
    const res = await artistApi.bulkMessages(action, ids)
    const st = action === 'approve' ? 'approved' : 'rejected'
    for (const m of messages.value) {
      if (selectedIds.value.has(m.id)) m.status = st as GuestbookMessage['status']
    }
    ElMessage.success(t('guestbookManage.bulkDone', { n: res.updated ?? ids.length }))
    selectedIds.value = new Set<number>()
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    bulkBusy.value = false
  }
}

// ─── F8: 语言筛选 ───

/** 语言代码 → 显示标签（语言名用原文显示是惯例；未知语言直接显示代码） */
const LANGUAGE_LABELS = {
  'zh-CN': '中文',
  'en': 'English',
  'ja': '日本語'
}

function languageLabel(lang: string) {
  return LANGUAGE_LABELS[lang as keyof typeof LANGUAGE_LABELS] || lang
}

/** 动态语言选项（REQ-021 F8：根据实际数据生成，按数量降序） */
const languageOptions = computed(() => {
  const counts: Record<string, number> = {}
  for (const m of messages.value) {
    if (m.language) counts[m.language] = (counts[m.language] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => ({ value: lang, label: languageLabel(lang) }))
})

/** G-8（F-2 适配）: 后端已分页（items/total/page/pageSize）且无 status/language 筛选参数，
    故按 pageSize=100（后端上限）分页拉全量后沿用本地筛选+分页——筛选口径与角标计数保持不变；
    对齐 api/index.js getAllOrders 的循环取全模式。 */
const filteredMessages = computed(() => {
  let list = messages.value
  if (statusFilter.value) list = list.filter(m => m.status === statusFilter.value)
  if (languageFilter.value) list = list.filter(m => m.language === languageFilter.value)
  return list
})
const pagedMessages = computed(() =>
  filteredMessages.value.slice((page.value - 1) * pageSize, page.value * pageSize)
)
const pendingCount = computed(() => messages.value.filter(m => m.status === 'pending').length)

function onFilterChange() { page.value = 1; selectedIds.value = new Set<number>() }

/** 数据刷新后当前语言筛选值已不存在时自动重置（如该语言留言全部删除） */
watch(languageOptions, (opts) => {
  if (languageFilter.value && !opts.some(o => o.value === languageFilter.value)) {
    languageFilter.value = ''
  }
})

// a1: 批准/删除留言使过滤集收缩时，页码钳回有效范围（避免短暂空页）
watch(() => filteredMessages.value.length, (len) => {
  const maxPage = Math.max(1, Math.ceil(len / pageSize))
  if (page.value > maxPage) page.value = maxPage
})

type MsgStatus = GuestbookMessage['status']
const STATUS_TYPE: Record<MsgStatus, 'warning' | 'success' | 'info'> = { pending: 'warning', approved: 'success', rejected: 'info' }
const STATUS_LABEL: Record<MsgStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }
const statusType = (s: MsgStatus) => STATUS_TYPE[s] || 'info'
const statusLabel = (s: MsgStatus) => STATUS_LABEL[s] || 'Pending'

async function load() {
  if (featureDisabled.value) return
  loading.value = true
  try {
    const PAGE_SIZE = GUESTBOOK_FETCH_ALL_PAGE_SIZE // 后端单页上限（F-2 clamp 1-100）
    const first = await artistApi.getMessages({ page: 1, pageSize: PAGE_SIZE })
    const total = first.total ?? (first.items || []).length
    let all: GuestbookMessage[] = [...(first.items || [])]
    const pages = Math.ceil(total / PAGE_SIZE)
    for (let p = 2; p <= pages; p++) {
      const res = await artistApi.getMessages({ page: p, pageSize: PAGE_SIZE })
      all = all.concat(res.items || [])
    }
    messages.value = all
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    loading.value = false
  }
}

async function approve(msg: GuestbookMessage) {
  if (actionBusyId.value === msg.id) return
  actionBusyId.value = msg.id
  try {
    await artistApi.approveMessage(msg.id)
    ElMessage.success(t('dashboard.guestbookApprovedMsg'))
    msg.status = 'approved'
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    actionBusyId.value = null
  }
}

async function reject(msg: GuestbookMessage) {
  if (actionBusyId.value === msg.id) return
  actionBusyId.value = msg.id
  try {
    await artistApi.rejectMessage(msg.id)
    ElMessage.success(t('dashboard.guestbookRejectedMsg'))
    msg.status = 'rejected'
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    actionBusyId.value = null
  }
}

function openReply(msg: GuestbookMessage) {
  replyingId.value = msg.id
  replyText.value = msg.artist_reply || ''
}

async function submitReply(msg: GuestbookMessage) {
  replySaving.value = true
  try {
    await artistApi.replyMessage(msg.id, replyText.value.trim())
    ElMessage.success(t('dashboard.guestbookRepliedMsg'))
    trackEvent('artist_action', { action: 'guestbook_reply' })
    msg.artist_reply = replyText.value.trim()
    replyingId.value = null
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    replySaving.value = false
  }
}

onMounted(async () => {
  // 直接访问 /guestbook（刷新后 profile 可能未加载）：先补拉 profile 再判定开关
  if ((store.profile as { guestbook_enabled?: number } | null)?.guestbook_enabled === undefined) {
    try {
      await store.fetchProfile()
    } catch { /* profile 拉取失败不阻塞页面，按开启处理（后端仍会正常返回数据） */ }
  }
  featureDisabled.value = (store.profile as { guestbook_enabled?: number } | null)?.guestbook_enabled === 0
  if (featureDisabled.value) {
    loading.value = false
    return
  }
  await load()
})
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.gb-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }

/* 820-L：功能关闭空态 */
.gb-disabled { padding: 48px 0; }

/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点 */
.group {
  margin: 16px 0;
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
.ctrl { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
.gm-language-select { width: 140px; }
.gm-badge { margin-left: 6px; }
.gm-lang-badge {
  font-size: calc(var(--font-scale, 1) * 11px); font-weight: 600;
  color: var(--hq);
  background: var(--hq-t);
  padding: 1px 8px; border-radius: 999px;
  white-space: nowrap;
}

.gm-list { display: flex; flex-direction: column; gap: 12px; min-height: 120px; }
/* v130: 批量操作条（纸墨化：卡片底+描边，与批量栏同族） */
.gm-batch-bar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin: 0 0 12px; padding: 8px 16px;
  background: var(--card); border: 1px solid var(--line2);
  border-radius: var(--r-m); box-shadow: var(--sh-1);
}
.gm-batch-count {
  padding: 4px 12px; border-radius: var(--r-pill);
  background: var(--hq-t); color: var(--hq);
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600;
}
.gm-select { flex: none; height: auto; }
.gm-card {
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  background: var(--card);
  transition: border-color var(--dur-mid), box-shadow var(--dur-mid);
}
.gm-card:hover { border-color: color-mix(in srgb, var(--hq) 50%, transparent); box-shadow: var(--sh-1); }
/* v130: 选中态花青描边（与多选选中语义一致） */
.gm-card--selected { border-color: var(--hq); }
/* 待审核留言：藤黄=待确认（语义一对一） */
.gm-card--pending { border-left: 3px solid var(--th); }
.gm-card--rejected {
  /* b5: 已拒卡片不再整卡稀释文字透明度——改用边框/底色区分 */
  border-color: var(--line2, #ddd);
  background: var(--paper2, #fafafa);
}

.gm-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.gm-nickname { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); }
.gm-time { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-left: auto; }

.gm-content {
  font-size: calc(var(--font-scale, 1) * 14px); line-height: 1.6; color: var(--ink);
  margin: 0 0 10px; white-space: pre-wrap; word-break: break-word;
}

.gm-reply {
  padding: 8px 12px; margin-bottom: 10px;
  border-radius: var(--r-m);
  background: var(--hq-t);
  border-left: 3px solid var(--hq);
}
.gm-reply-label { font-size: calc(var(--font-scale, 1) * 11px); font-weight: 600; color: var(--hq); }
.gm-reply-text { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); margin: 4px 0 0; line-height: 1.5; }

.gm-reply-editor { margin-bottom: 10px; }
.gm-reply-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

.gm-actions { display: flex; gap: 8px; }

.gm-pagination { display: flex; justify-content: flex-end; margin-top: 16px; }

/* 02D P1-8: 空态插画轻微浮沉（2s 缓动循环，位移 ≤4px，不缩放不旋转——克制动效纪律；
   reduced-motion 由 theme.css 全局兜底压缩） */
:deep(.el-empty__image) { animation: huiyue-empty-float 2s ease-in-out infinite; }
@keyframes huiyue-empty-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* 页宽容器查询收尾批：行堆叠断点改认容器宽（ArtistLayout 已设 container-type） */
@container (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
