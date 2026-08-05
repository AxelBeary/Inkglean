<!--
  TplGuestbook — 留言板（F4，共享逻辑组件）

  硬约束：不写任何装饰样式（无 color/background/border/font-size）。
  组件只提供语义结构（gb-* class），4 模板通过 :deep(.gb-*) 各自定视觉。
  原生 input/textarea/button（不用 Element Plus，模板样式覆盖更直接）。

  数据契约（公开 API，camelCase）：
  - GET  /api/public/artist/:subdomain/messages → { messages: [{ id, nickname, content, artistReply, repliedAt, createdAt }], total, page, pageSize }
  - POST /api/public/artist/:subdomain/messages → { id } (201)；429 = 限流
-->
<template>
  <div class="tpl-guestbook">
    <!-- 提交表单 -->
    <form class="gb-form" @submit.prevent="submit">
      <input
        v-model="nickname"
        class="gb-input"
        type="text"
        maxlength="20"
        :placeholder="$t('guestbook.nicknamePlaceholder')"
        :aria-label="$t('guestbook.nickname')"
      />
      <textarea
        v-model="content"
        class="gb-textarea"
        rows="3"
        maxlength="200"
        :placeholder="$t('guestbook.contentPlaceholder')"
        :aria-label="$t('guestbook.content')"
      ></textarea>
      <button class="gb-submit" type="submit" :disabled="submitting">
        {{ $t('guestbook.submit') }}
      </button>
      <p class="gb-pending-hint" v-if="justSubmitted">{{ $t('guestbook.pendingHint') }}</p>
    </form>

    <!-- 留言列表 -->
    <div class="gb-list" v-if="messages.length">
      <div class="gb-item" v-for="m in messages" :key="m.id">
        <div class="gb-item-head">
          <span class="gb-nickname">{{ m.nickname }}</span>
          <span class="gb-time">{{ formatDateTime(m.createdAt) }}</span>
        </div>
        <p class="gb-content">{{ m.content }}</p>
        <!-- 画师回复 -->
        <div class="gb-reply" v-if="m.artistReply">
          <span class="gb-reply-tag">{{ $t('guestbook.artistTag') }}</span>
          <p class="gb-reply-content">{{ m.artistReply }}</p>
        </div>
      </div>
    </div>
    <p class="gb-empty" v-else-if="!loading">{{ $t('guestbook.empty') }}</p>

    <!-- 加载更多 -->
    <button class="gb-load-more" v-if="hasMore" type="button" :disabled="loadingMore" @click="loadMore">
      {{ $t('guestbook.loadMore') }}
    </button>
    <p class="gb-no-more" v-else-if="messages.length">{{ $t('guestbook.noMore') }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { artistPublicApi } from '../../api/index.js'
import { formatDateTime } from '../../utils/datetime.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  subdomain: { type: String, required: true }
})

const { t } = useI18n()

const messages = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const loadingMore = ref(false)
const submitting = ref(false)
const justSubmitted = ref(false)

const nickname = ref('')
const content = ref('')

const PAGE_SIZE = 20
const hasMore = computed(() => messages.value.length < total.value)

async function fetchPage(p) {
  const res = await artistPublicApi.getMessages(props.subdomain, p, PAGE_SIZE)
  return res
}

onMounted(async () => {
  try {
    const res = await fetchPage(1)
    messages.value = res.messages || []
    total.value = res.total || 0
  } catch { /* 留言板加载失败不阻塞主页 */ }
  finally { loading.value = false }
})

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const res = await fetchPage(page.value + 1)
    messages.value = [...messages.value, ...(res.messages || [])]
    page.value += 1
  } catch { /* 静默 */ }
  finally { loadingMore.value = false }
}

async function submit() {
  const nick = nickname.value.trim()
  const text = content.value.trim()
  // 打磨批：空提交拦截统一为 JS 守卫 + ElMessage（与 TrackOrder 查询页同风格，替代原生 required 浏览器气泡）
  if (!nick) return ElMessage.warning(t('guestbook.nicknameRequired'))
  if (!text) return ElMessage.warning(t('guestbook.contentRequired'))
  submitting.value = true
  try {
    await artistPublicApi.postMessage(props.subdomain, { nickname: nick, content: text })
    justSubmitted.value = true
    content.value = ''
  } catch (err) {
    // 429 限流：后端返回 code=RATE_LIMITED
    if (err.response?.status === 429) {
      ElMessage.warning(t('guestbook.rateLimited'))
    } else {
      ElMessage.error(err.message)
    }
  } finally {
    submitting.value = false
  }
}
</script>
