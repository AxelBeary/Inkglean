<template>
  <!-- loading态：骨架条 -->
  <template v-if="state === 'loading'">
    <div class="gb-skeleton">
      <div v-for="i in 3" :key="i" class="gb-skeleton-row"></div>
    </div>
  </template>

  <!-- 错误态 -->
  <div v-else-if="state === 'error'" class="module-error">
    <span>{{ $t('dashboard.guestbookError') }}</span>
    <el-button size="small" @click="load">{{ $t('dashboard.retry') }}</el-button>
  </div>

  <!-- 空状态 -->
  <InkEmpty v-else-if="!guestbookMessages.length" :title="$t('dashboard.guestbookEmpty')" />

  <!-- 留言列表 -->
  <div v-else class="gb-mod-list">
    <div
      v-for="m in guestbookMessages" :key="m.id"
      class="gb-mod-item" :class="{ 'gb-mod-item--pending': m.status === 'pending' }"
    >
      <div class="gb-mod-head">
        <span class="gb-mod-nick">{{ m.nickname }}</span>
        <StatusChip :type="chipType(m.status)">
          {{ $t('dashboard.guestbook' + statusLabel(m.status)) }}
        </StatusChip>
      </div>
      <p class="gb-mod-content">{{ m.content }}</p>
      <p class="gb-mod-time">{{ formatDateTime(m.created_at) }}</p>
      <div class="gb-mod-reply" v-if="m.artist_reply">
        <span class="gb-mod-reply-label">{{ $t('dashboard.guestbookReply') }}：</span>{{ m.artist_reply }}
      </div>
      <div class="gb-mod-actions" v-if="m.status === 'pending'">
        <el-button size="small" class="gb-btn gb-btn--approve" @click="approveMsg(m)">{{ $t('dashboard.guestbookApprove') }}</el-button>
        <el-button size="small" class="gb-btn gb-btn--reject" @click="rejectMsg(m)">{{ $t('dashboard.guestbookReject') }}</el-button>
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
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { artistApi } from '../../../api/index.js'
import type { GuestbookMessage } from '../../../api/types.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { UI_PAGE_SIZE } from '../../../constants/pagination.js'
import { formatDateTime } from '../../../utils/datetime.js'
import StatusChip from '../visual/StatusChip.vue'
import InkEmpty from '../visual/InkEmpty.vue'

const { t } = useI18n()

const state = ref<'loading' | 'ok' | 'error'>('loading')
const guestbookMessages = ref<GuestbookMessage[]>([])
const replyDrafts = reactive<Record<string, string>>({})

const pendingCount = computed(() => guestbookMessages.value.filter((m: GuestbookMessage) => m.status === 'pending').length)

function chipType(status: string): string {
  const map: Record<string, string> = { pending: 'pend', approved: 'done', rejected: 'cancel' }
  return map[status] || 'info'
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

async function load() {
  state.value = 'loading'
  try {
    const res = await artistApi.getMessages({ pageSize: UI_PAGE_SIZE })
    guestbookMessages.value = (res.items || []).filter((m: GuestbookMessage) => !m.deleted_by_admin)
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

async function approveMsg(m: GuestbookMessage) {
  try {
    const updated = await artistApi.approveMessage(m.id)
    Object.assign(m, updated)
    ElMessage.success(t('dashboard.guestbookApprovedMsg'))
  } catch (err: unknown) { ElMessage.error(err instanceof Error ? err.message : '') }
}

async function rejectMsg(m: GuestbookMessage) {
  try {
    await artistApi.rejectMessage(m.id)
    m.status = 'rejected'
    ElMessage.success(t('dashboard.guestbookRejectedMsg'))
  } catch (err: unknown) { ElMessage.error(err instanceof Error ? err.message : '') }
}

async function replyMsg(m: GuestbookMessage) {
  const reply = (replyDrafts[m.id] || '').trim()
  if (!reply) return
  try {
    const updated = await artistApi.replyMessage(m.id, reply)
    Object.assign(m, updated)
    replyDrafts[m.id] = ''
    ElMessage.success(t('dashboard.guestbookRepliedMsg'))
  } catch (err: unknown) { ElMessage.error(err instanceof Error ? err.message : '') }
}

onMounted(() => load())

defineExpose({ load, pendingCount })
</script>

<style scoped>
/* 账本式列表（参照 LedgerTodo .row：行间 --line 分隔，hover 只加深纸底） */
.gb-mod-list { display: flex; flex-direction: column; max-height: 480px; overflow-y: auto; }
.gb-mod-item {
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  border-radius: 4px;
  transition: background var(--dur-fast) var(--ease-out);
}
.gb-mod-item:last-child { border-bottom: none; }
.gb-mod-item:hover { background: var(--paper2); }
/* 待审 = 账本里的藤黄墨线（同 LedgerTodo 逾期行的左线标记） */
.gb-mod-item--pending { border-left: 3px solid var(--th); }
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
/* 通过/拒绝 = 墨线描边按钮（参照 LedgerTodo .r-btn：1px color-mix + 手剪圆角） */
.artist-scope .gb-mod-actions :deep(.el-button) {
  font: inherit;
  font-size: calc(var(--font-scale, 1) * 12px);
  cursor: pointer;
  background: none;
  padding: 3px 11px;
  border: 1px solid color-mix(in srgb, var(--ink) 30%, transparent);
  border-radius: 3px 6px 4px 6px / 6px 4px 6px 3px;
  transition: background var(--dur-mid) var(--ease-out), color var(--dur-mid) var(--ease-out), border-color var(--dur-mid) var(--ease-out);
}
.artist-scope .gb-mod-actions :deep(.gb-btn--approve) { color: var(--sl); border-color: color-mix(in srgb, var(--sl) 40%, transparent); }
.artist-scope .gb-mod-actions :deep(.gb-btn--approve:hover) { background: var(--sl-t); }
.artist-scope .gb-mod-actions :deep(.gb-btn--reject) { color: var(--zs); border-color: color-mix(in srgb, var(--zs) 40%, transparent); }
.artist-scope .gb-mod-actions :deep(.gb-btn--reject:hover) { background: var(--zs-t); }
.gb-skeleton { display: flex; flex-direction: column; gap: 8px; }
.gb-skeleton-row {
  height: 80px; border-radius: var(--r-m);
  background: var(--paper2);
  animation: gb-pulse 1.2s ease-in-out infinite;
}
@keyframes gb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
</style>
