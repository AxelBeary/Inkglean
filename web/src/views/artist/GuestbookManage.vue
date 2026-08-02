<template>
  <ArtistLayout>
    <h2 class="font-display">{{ $t('guestbookManage.title') }}</h2>

    <!-- 状态筛选 + F8 语言筛选 -->
    <div class="gm-filter">
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

    <!-- 留言列表 -->
    <div v-loading="loading" class="gm-list">
      <div v-for="msg in pagedMessages" :key="msg.id" class="gm-card" :class="`gm-card--${msg.status}`">
        <div class="gm-card-head">
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
            size="small" type="success"
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
              <el-button size="small" type="danger">{{ $t('dashboard.guestbookReject') }}</el-button>
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
  </ArtistLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { formatDateTime } from '../../utils/datetime.js'

const { t } = useI18n()

const messages = ref([])
const loading = ref(true)
const statusFilter = ref('')
const languageFilter = ref('')
const page = ref(1)
const pageSize = 20

// 回复状态
const replyingId = ref(null)
const replyText = ref('')
const replySaving = ref(false)

// ─── F8: 语言筛选 ───

/** 语言代码 → 显示标签（语言名用原文显示是惯例；未知语言直接显示代码） */
const LANGUAGE_LABELS = {
  'zh-CN': '中文',
  'en': 'English',
  'ja': '日本語'
}

function languageLabel(lang) {
  return LANGUAGE_LABELS[lang] || lang
}

/** 动态语言选项（REQ-021 F8：根据实际数据生成，按数量降序） */
const languageOptions = computed(() => {
  const counts = {}
  for (const m of messages.value) {
    if (m.language) counts[m.language] = (counts[m.language] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => ({ value: lang, label: languageLabel(lang) }))
})

/** 后端 GET /api/artist/messages 返回全量数组（无分页参数），前端本地筛选+分页 */
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

function onFilterChange() { page.value = 1 }

/** 数据刷新后当前语言筛选值已不存在时自动重置（如该语言留言全部删除） */
watch(languageOptions, (opts) => {
  if (languageFilter.value && !opts.some(o => o.value === languageFilter.value)) {
    languageFilter.value = ''
  }
})

const STATUS_TYPE = { pending: 'warning', approved: 'success', rejected: 'info' }
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }
const statusType = (s) => STATUS_TYPE[s] || 'info'
const statusLabel = (s) => STATUS_LABEL[s] || 'Pending'

async function load() {
  loading.value = true
  try {
    messages.value = await artistApi.getMessages()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function approve(msg) {
  try {
    await artistApi.approveMessage(msg.id)
    ElMessage.success(t('dashboard.guestbookApprovedMsg'))
    msg.status = 'approved'
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function reject(msg) {
  try {
    await artistApi.rejectMessage(msg.id)
    ElMessage.success(t('dashboard.guestbookRejectedMsg'))
    msg.status = 'rejected'
  } catch (err) {
    ElMessage.error(err.message)
  }
}

function openReply(msg) {
  replyingId.value = msg.id
  replyText.value = msg.artist_reply || ''
}

async function submitReply(msg) {
  replySaving.value = true
  try {
    await artistApi.replyMessage(msg.id, replyText.value.trim())
    ElMessage.success(t('dashboard.guestbookRepliedMsg'))
    msg.artist_reply = replyText.value.trim()
    replyingId.value = null
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    replySaving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.gm-filter { margin: 16px 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.gm-language-select { width: 140px; }
.gm-badge { margin-left: 6px; }
.gm-lang-badge {
  font-size: 11px; font-weight: 600;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 1px 8px; border-radius: 999px;
  white-space: nowrap;
}

.gm-list { display: flex; flex-direction: column; gap: 12px; min-height: 120px; }
.gm-card {
  padding: 16px 20px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.gm-card:hover { border-color: var(--el-color-primary-light-5); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05); }
.gm-card--pending { border-left: 3px solid var(--el-color-warning); }
.gm-card--rejected { opacity: 0.7; }

.gm-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.gm-nickname { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.gm-time { font-size: 12px; color: var(--text-muted); margin-left: auto; }

.gm-content {
  font-size: 14px; line-height: 1.6; color: var(--text-primary);
  margin: 0 0 10px; white-space: pre-wrap; word-break: break-word;
}

.gm-reply {
  padding: 8px 12px; margin-bottom: 10px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
}
.gm-reply-label { font-size: 11px; font-weight: 600; color: var(--el-color-primary); }
.gm-reply-text { font-size: 13px; color: var(--text-primary); margin: 4px 0 0; line-height: 1.5; }

.gm-reply-editor { margin-bottom: 10px; }
.gm-reply-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

.gm-actions { display: flex; gap: 8px; }

.gm-pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
