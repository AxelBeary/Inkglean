<template>
  <div class="reply-page">
    <h2 class="od-page-title">{{ $t('reply.title') }}</h2>
    <p class="page-sub">{{ $t('reply.subtitle') }}</p>

    <!-- 分类 tab -->
    <div class="reply-tabs" role="tablist" :aria-label="$t('reply.title')" @keydown="onReplyTabKeydown">
      <button
        v-for="cat in REPLY_CATEGORIES" :key="cat" type="button"
        class="reply-tab" :class="{ 'reply-tab--active': currentCat === cat }"
        role="tab" :aria-selected="currentCat === cat" :tabindex="currentCat === cat ? 0 : -1"
        :ref="(el) => { if (el) replyTabEls[cat] = el }"
        @click="selectCategory(cat)"
      >
        {{ $t('reply.cats.' + cat) }}
      </button>
    </div>

    <!-- 话术列表 -->
    <div class="reply-list">
      <div v-for="(item, i) in templates" :key="catKey(item, i)" class="page-card reply-item">
        <div class="reply-item-head">
          <span class="reply-item-name">{{ item.name }}</span>
          <button type="button" class="reply-copy-btn" @click="copyText(item)">
            {{ $t('reply.copy') }}
          </button>
        </div>
        <p class="reply-item-text">{{ displayText(item) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { REPLY_CATEGORIES, REPLY_TEMPLATES } from '../../utils/reply-templates.js'
// 波3-2: 剪贴板抽公共（clipboard 优先 + execCommand 回退，失败返回 false 不抛）
import { copyText as copyToClipboard } from '../../utils/clipboard.js'

const { t, locale } = useI18n()
const currentCat = ref(REPLY_CATEGORIES[0])
const templates = computed(() => REPLY_TEMPLATES[currentCat.value] || [])
/** b5: 分类 tab roving tabindex + 方向键（ARIA APG Tabs） */
const replyTabEls = {}
function onReplyTabKeydown(e) {
  const idx = REPLY_CATEGORIES.indexOf(currentCat.value)
  let next = null
  if (e.key === 'ArrowRight') next = REPLY_CATEGORIES[(idx + 1) % REPLY_CATEGORIES.length]
  else if (e.key === 'ArrowLeft') next = REPLY_CATEGORIES[(idx - 1 + REPLY_CATEGORIES.length) % REPLY_CATEGORIES.length]
  else if (e.key === 'Home') next = REPLY_CATEGORIES[0]
  else if (e.key === 'End') next = REPLY_CATEGORIES[REPLY_CATEGORIES.length - 1]
  if (next == null) return
  e.preventDefault()
  selectCategory(next)
  replyTabEls[next]?.focus()
}
/** b4-5: 按 locale 取话术（中文走 text，英文走 textEn，缺英文时回退中文） */
function displayText(item) {
  return locale.value === 'en' ? (item.textEn || item.text) : item.text
}

function selectCategory(cat) {
  currentCat.value = cat
}

/** v-for key：分类内同名话术少见，但用索引兜底保证唯一 */
function catKey(item, i) {
  return currentCat.value + '_' + item.name + '_' + i
}

/** 复制到剪贴板（公共 clipboard.copyText；成功提示 / 失败提示） */
async function copyText(item) {
  if (await copyToClipboard(displayText(item))) {
    ElMessage.success(t('reply.copied'))
  } else {
    ElMessage.error(t('reply.copyFailed'))
  }
}
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.reply-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; }

.reply-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.reply-tab {
  padding: 8px 16px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m, 8px);
  background: var(--card);
  color: var(--ink2);
  font-size: 14px;
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast), background-color var(--dur-slow), transform var(--dur-fast) ease-out;
}
.reply-tab:hover { border-color: var(--hq, var(--el-color-primary)); color: var(--ink); }
.reply-tab:active { transform: scale(0.98); }
.reply-tab--active {
  background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 12%, var(--card));
  border-color: var(--hq, var(--el-color-primary));
  color: var(--hq, var(--el-color-primary));
  font-weight: 600;
}

.reply-list { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
.reply-item {
  padding: 16px 20px;
}
.reply-item-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.reply-item-name { font-size: 14px; font-weight: 600; color: var(--ink); }
.reply-copy-btn {
  padding: 5px 14px;
  border: 1px solid var(--hq, var(--el-color-primary));
  border-radius: var(--r-m, 8px);
  background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 8%, var(--card));
  color: var(--hq, var(--el-color-primary));
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast), background-color var(--dur-slow), transform var(--dur-fast) ease-out;
}
.reply-copy-btn:hover { background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 18%, var(--card)); }
.reply-copy-btn:active { transform: scale(0.98); }
.reply-item-text { margin-top: 10px; font-size: 14px; line-height: 1.7; color: var(--ink2); white-space: pre-wrap; }
</style>
