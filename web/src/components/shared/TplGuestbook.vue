<!--
  TplGuestbook — 留言板（F4，共享逻辑组件）

  P1-B 收敛（813-hunt）：4 模板的 :deep(.gb-*) 皮肤（~390 行）迁入组件主题变体
  theme="card|plaque|inline|note"（Classic 卡片 / Gallery 展签 / Folio 内联 / Atelier 纸面留言条），
  模板调用处只传 theme，不再各自 deep 覆盖；视觉逐条等价迁移。
  未传 theme 时维持旧硬约束：无任何装饰样式，只提供语义结构（gb-* class）。
  原生 input/textarea/button（不用 Element Plus，模板样式覆盖更直接）。

  数据契约（公开 API，camelCase）：
  - GET  /api/public/artist/:subdomain/messages → { messages: [{ id, nickname, content, artistReply, repliedAt, createdAt }], total, page, pageSize }
  - POST /api/public/artist/:subdomain/messages → { id } (201)；429 = 限流
-->
<template>
  <!-- 820-L：留言功能关闭时整个板块隐藏（不渲染表单与历史，父级模板同条件包裹，双保险） -->
  <div v-if="enabled" class="tpl-guestbook" :class="themeClass">
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { artistPublicApi } from '../../api/index.js'
import { formatDateTime } from '../../utils/datetime.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  subdomain: { type: String, required: true },
  /** 视觉变体：''（无装饰）/ card / plaque / inline / note */
  theme: { type: String, default: '' },
  /** 820-L：留言功能开关（false=关闭，隐藏整个板块） */
  enabled: { type: Boolean, default: true }
})

const themeClass = computed(() => (props.theme ? `tpl-guestbook--${props.theme}` : ''))

const { t } = useI18n()

const messages = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const loadingMore = ref(false)
const submitting = ref(false)
const justSubmitted = ref(false)
let pendingHintTimer = null

/** 复位「已提交待审核」提示：输入新内容立即清除；5s 无人操作兜底清除（b3 猎杀） */
function clearPendingHint() {
  if (pendingHintTimer) clearTimeout(pendingHintTimer)
  pendingHintTimer = null
  justSubmitted.value = false
}

const nickname = ref('')
const content = ref('')
watch(content, (v) => {
  if (justSubmitted.value && v) clearPendingHint()
})

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
    const res = await artistPublicApi.postMessage(props.subdomain, { nickname: nick, content: text })
    // REQ-042: 命中敏感词 → 提示（不硬拦，先发后审）
    if (res?.warning?.sensitiveWords?.length) {
      ElMessage.warning(t('compliance.warning.hit', { words: res.warning.sensitiveWords.join('、') }))
    }
    content.value = ''
    justSubmitted.value = true
    pendingHintTimer = setTimeout(() => { justSubmitted.value = false; pendingHintTimer = null }, 5000)
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

onUnmounted(() => {
  if (pendingHintTimer) clearTimeout(pendingHintTimer)
})
</script>

<style scoped>
/* ============================================================
   P1-B：四模板主题变体（原 4 模板 :deep 覆盖等价迁移，值不变）
   ============================================================ */

/* ─── card：Classic 卡片式（surface 底 + 圆角边框，温暖友好） ─── */
.tpl-guestbook--card .gb-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 28px;
}
.tpl-guestbook--card .gb-input,
.tpl-guestbook--card .gb-textarea {
  padding: 10px 14px;
  border: 1px solid var(--pal-border);
  border-radius: 10px;
  background: var(--pal-surface);
  color: var(--pal-text);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  transition: border-color var(--dur-mid);
}
.tpl-guestbook--card .gb-input:focus,
.tpl-guestbook--card .gb-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}
.tpl-guestbook--card .gb-input:focus-visible,
.tpl-guestbook--card .gb-textarea:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.tpl-guestbook--card .gb-submit {
  align-self: flex-start;
  padding: 10px 28px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--pal-bg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  /* T 波：hover 禁位移——位移换背景加深 */
  transition: background var(--dur-mid);
}
.tpl-guestbook--card .gb-submit:hover:not(:disabled) { background: var(--color-primary-hover); }
.tpl-guestbook--card .gb-submit:disabled { opacity: 0.5; cursor: default; }
.tpl-guestbook--card .gb-pending-hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-primary);
}
.tpl-guestbook--card .gb-item {
  padding: 16px;
  border: 1px solid var(--pal-border);
  border-radius: 12px;
  background: var(--pal-surface);
  margin-bottom: 12px;
}
.tpl-guestbook--card .gb-item-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.tpl-guestbook--card .gb-nickname { font-weight: 700; font-size: 14px; color: var(--pal-text); }
.tpl-guestbook--card .gb-time { font-size: 12px; color: var(--pal-text-dim); }
.tpl-guestbook--card .gb-content { margin: 0; font-size: 14px; line-height: 1.6; color: var(--pal-text); word-break: break-word; }
.tpl-guestbook--card .gb-reply {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-primary-soft);
}
.tpl-guestbook--card .gb-reply-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 4px;
}
.tpl-guestbook--card .gb-reply-content { margin: 0; font-size: 13px; line-height: 1.6; color: var(--pal-text); }
.tpl-guestbook--card .gb-empty { color: var(--pal-text-dim); font-size: 14px; text-align: center; padding: 24px 0; }
.tpl-guestbook--card .gb-load-more {
  display: block;
  margin: 8px auto 0;
  padding: 8px 24px;
  border: 1px solid var(--pal-border);
  border-radius: 999px;
  background: transparent;
  color: var(--pal-text-dim);
  font-size: 13px;
  cursor: pointer;
  transition: border-color var(--dur-mid), color var(--dur-mid);
}
.tpl-guestbook--card .gb-load-more:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.tpl-guestbook--card .gb-no-more { text-align: center; font-size: 12px; color: var(--pal-text-dim); margin-top: 8px; }

/* ─── plaque：Gallery 展签式（无圆角、细线分隔、字距，美术馆感） ─── */
.tpl-guestbook--plaque { max-width: 640px; margin: 0 auto; }
.tpl-guestbook--plaque .gb-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 40px;
}
.tpl-guestbook--plaque .gb-input,
.tpl-guestbook--plaque .gb-textarea {
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid var(--pal-border);
  background: transparent;
  color: var(--pal-text);
  font-size: 14px;
  font-family: inherit;
  letter-spacing: 0.03em;
  resize: vertical;
  transition: border-color var(--dur-mid);
}
.tpl-guestbook--plaque .gb-input:focus,
.tpl-guestbook--plaque .gb-textarea:focus {
  outline: none;
  border-bottom-color: var(--color-primary);
}
.tpl-guestbook--plaque .gb-input:focus-visible,
.tpl-guestbook--plaque .gb-textarea:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.tpl-guestbook--plaque .gb-submit {
  align-self: flex-start;
  padding: 10px 32px;
  border: 1px solid var(--pal-text);
  background: transparent;
  color: var(--pal-text);
  font-size: 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background var(--dur-mid), color var(--dur-mid);
}
.tpl-guestbook--plaque .gb-submit:hover:not(:disabled) { background: var(--pal-text); color: var(--pal-bg); }
.tpl-guestbook--plaque .gb-submit:disabled { opacity: 0.4; cursor: default; }
.tpl-guestbook--plaque .gb-pending-hint { margin: 0; font-size: 12px; letter-spacing: 0.05em; color: var(--color-primary); }
.tpl-guestbook--plaque .gb-item {
  padding: 20px 0;
  border-bottom: 1px solid var(--pal-border);
}
.tpl-guestbook--plaque .gb-item-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.tpl-guestbook--plaque .gb-nickname { font-weight: 600; font-size: 14px; letter-spacing: 0.05em; color: var(--pal-text); }
.tpl-guestbook--plaque .gb-time { font-size: 11px; letter-spacing: 0.08em; color: var(--pal-text-dim); }
.tpl-guestbook--plaque .gb-content { margin: 0; font-size: 14px; line-height: 1.8; color: var(--pal-text-dim); word-break: break-word; }
.tpl-guestbook--plaque .gb-reply {
  margin-top: 14px;
  padding-left: 16px;
  border-left: 2px solid var(--color-primary);
}
.tpl-guestbook--plaque .gb-reply-tag {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-primary);
  margin-bottom: 4px;
}
.tpl-guestbook--plaque .gb-reply-content { margin: 0; font-size: 13px; line-height: 1.7; color: var(--pal-text); }
.tpl-guestbook--plaque .gb-empty { color: var(--pal-text-dim); font-size: 13px; letter-spacing: 0.05em; text-align: center; padding: 32px 0; }
.tpl-guestbook--plaque .gb-load-more {
  display: block;
  margin: 20px auto 0;
  padding: 8px 28px;
  border: 1px solid var(--pal-border);
  background: transparent;
  color: var(--pal-text-dim);
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color var(--dur-mid), color var(--dur-mid);
}
.tpl-guestbook--plaque .gb-load-more:hover:not(:disabled) { border-color: var(--pal-text); color: var(--pal-text); }
.tpl-guestbook--plaque .gb-no-more { text-align: center; font-size: 11px; letter-spacing: 0.1em; color: var(--pal-text-dim); margin-top: 16px; }

/* ─── inline：Folio 内联文字块（极简编辑感，无边框，留白分隔） ─── */
.tpl-guestbook--inline { max-width: 560px; }
.tpl-guestbook--inline .gb-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 40px;
}
.tpl-guestbook--inline .gb-input,
.tpl-guestbook--inline .gb-textarea {
  padding: 12px 16px;
  border: 1px solid var(--pal-border);
  border-radius: 2px;
  background: transparent;
  color: var(--pal-text);
  font-size: 15px;
  font-family: inherit;
  resize: vertical;
  transition: border-color var(--dur-mid);
}
.tpl-guestbook--inline .gb-input:focus,
.tpl-guestbook--inline .gb-textarea:focus {
  outline: none;
  border-color: var(--pal-text);
}
.tpl-guestbook--inline .gb-input:focus-visible,
.tpl-guestbook--inline .gb-textarea:focus-visible {
  outline: 2px solid var(--pal-text);
  outline-offset: 2px;
}
.tpl-guestbook--inline .gb-submit {
  align-self: flex-start;
  padding: 12px 36px;
  border: none;
  border-radius: 2px;
  background: var(--pal-text);
  color: var(--pal-bg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--dur-mid);
}
.tpl-guestbook--inline .gb-submit:hover:not(:disabled) { opacity: 0.85; }
.tpl-guestbook--inline .gb-submit:disabled { opacity: 0.4; cursor: default; }
.tpl-guestbook--inline .gb-pending-hint { margin: 0; font-size: 13px; color: var(--pal-text-dim); font-style: italic; }
.tpl-guestbook--inline .gb-item { padding: 24px 0; border-top: 1px solid var(--pal-border); }
.tpl-guestbook--inline .gb-item:first-child { border-top: none; padding-top: 0; }
.tpl-guestbook--inline .gb-item-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.tpl-guestbook--inline .gb-nickname {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  color: var(--pal-text);
}
.tpl-guestbook--inline .gb-time { font-size: 12px; color: var(--pal-text-dim); }
.tpl-guestbook--inline .gb-content { margin: 0; font-size: 15px; line-height: 1.8; color: var(--pal-text-dim); word-break: break-word; }
.tpl-guestbook--inline .gb-reply { margin-top: 14px; padding-left: 18px; border-left: 2px solid var(--pal-border); }
.tpl-guestbook--inline .gb-reply-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--pal-text-dim);
  margin-bottom: 4px;
}
.tpl-guestbook--inline .gb-reply-content { margin: 0; font-size: 14px; line-height: 1.7; color: var(--pal-text); font-style: italic; }
.tpl-guestbook--inline .gb-empty { color: var(--pal-text-dim); font-size: 15px; font-style: italic; padding: 24px 0; }
.tpl-guestbook--inline .gb-load-more {
  display: block;
  margin: 12px 0 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--pal-text-dim);
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
  transition: color var(--dur-mid);
}
.tpl-guestbook--inline .gb-load-more:hover:not(:disabled) { color: var(--pal-text); }
.tpl-guestbook--inline .gb-no-more { font-size: 12px; color: var(--pal-text-dim); margin-top: 12px; }

/* ─── note：Atelier 纸面留言条（宋体、米色卡片、微旋转，手账感） ─── */
.tpl-guestbook--note { max-width: 600px; margin: 0 auto; }
.tpl-guestbook--note .gb-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 36px;
}
.tpl-guestbook--note .gb-input,
.tpl-guestbook--note .gb-textarea {
  padding: 12px 14px;
  border: 1px solid var(--pal-border);
  background: var(--pal-surface);
  color: var(--pal-text);
  font-family: var(--font-display);
  font-size: 14px;
  resize: vertical;
  transition: border-color var(--dur-mid);
}
.tpl-guestbook--note .gb-input:focus,
.tpl-guestbook--note .gb-textarea:focus {
  outline: none;
  border-color: var(--atelier-accent);
}
.tpl-guestbook--note .gb-input:focus-visible,
.tpl-guestbook--note .gb-textarea:focus-visible {
  outline: 2px solid var(--atelier-accent);
  outline-offset: 2px;
}
.tpl-guestbook--note .gb-submit {
  align-self: flex-start;
  padding: 10px 30px;
  border: 1px solid var(--atelier-accent);
  background: transparent;
  color: var(--atelier-accent);
  font-family: var(--font-display);
  font-size: 14px;
  cursor: pointer;
  transition: background var(--dur-mid), color var(--dur-mid);
}
.tpl-guestbook--note .gb-submit:hover:not(:disabled) { background: var(--atelier-accent); color: var(--pal-bg); }
.tpl-guestbook--note .gb-submit:disabled { opacity: 0.4; cursor: default; }
.tpl-guestbook--note .gb-pending-hint { margin: 0; font-size: 13px; color: var(--atelier-accent); }
.tpl-guestbook--note .gb-item {
  padding: 18px 20px;
  background: var(--pal-surface);
  border: 1px solid var(--pal-border);
  border-top: 3px solid var(--atelier-accent);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--pal-text) 10%, transparent);
  margin-bottom: 16px;
  transform: rotate(-0.4deg);
  transition: transform var(--dur-mid) var(--ease-out);
}
.tpl-guestbook--note .gb-item:nth-child(even) { transform: rotate(0.4deg); }
.tpl-guestbook--note .gb-item:hover { transform: rotate(0deg); }
.tpl-guestbook--note .gb-item-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.tpl-guestbook--note .gb-nickname {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  color: var(--pal-text);
}
.tpl-guestbook--note .gb-time { font-size: 11px; color: var(--pal-text-dim); }
.tpl-guestbook--note .gb-content {
  margin: 0;
  font-family: var(--font-display);
  font-size: 14px;
  line-height: 1.9;
  color: var(--pal-text);
  word-break: break-word;
}
.tpl-guestbook--note .gb-reply {
  margin-top: 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--atelier-accent) 8%, transparent);
  border-left: 2px solid var(--atelier-accent);
}
.tpl-guestbook--note .gb-reply-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: var(--atelier-accent);
  margin-bottom: 4px;
}
.tpl-guestbook--note .gb-reply-content {
  margin: 0;
  font-family: var(--font-display);
  font-size: 13px;
  line-height: 1.8;
  color: var(--pal-text);
}
.tpl-guestbook--note .gb-empty {
  color: var(--pal-text-dim);
  font-family: var(--font-display);
  font-size: 14px;
  text-align: center;
  padding: 28px 0;
}
.tpl-guestbook--note .gb-load-more {
  display: block;
  margin: 8px auto 0;
  padding: 8px 26px;
  border: 1px solid var(--pal-border);
  background: transparent;
  color: var(--pal-text-dim);
  font-family: var(--font-display);
  font-size: 13px;
  cursor: pointer;
  transition: border-color var(--dur-mid), color var(--dur-mid);
}
.tpl-guestbook--note .gb-load-more:hover:not(:disabled) { border-color: var(--atelier-accent); color: var(--atelier-accent); }
.tpl-guestbook--note .gb-no-more {
  text-align: center;
  font-size: 12px;
  color: var(--pal-text-dim);
  font-family: var(--font-display);
  margin-top: 8px;
}
</style>
