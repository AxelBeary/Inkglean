<template>
  <ArtistLayout>
    <div class="reply-page">
      <h2 class="od-page-title">{{ $t('reply.title') }}</h2>
      <p class="page-sub">{{ $t('reply.subtitle') }}</p>

      <!-- 分类 tab -->
      <div class="reply-tabs" role="tablist" :aria-label="$t('reply.title')">
        <button
          v-for="cat in REPLY_CATEGORIES" :key="cat" type="button"
          class="reply-tab" :class="{ 'reply-tab--active': currentCat === cat }"
          role="tab" :aria-selected="currentCat === cat"
          @click="selectCategory(cat)"
        >
          {{ $t('reply.cats.' + cat) }}
        </button>
      </div>

      <!-- 话术列表 -->
      <div class="reply-list">
        <div v-for="(item, i) in templates" :key="catKey(item, i)" class="reply-item">
          <div class="reply-item-head">
            <span class="reply-item-name">{{ item.name }}</span>
            <button type="button" class="reply-copy-btn" @click="copyText(item)">
              {{ $t('reply.copy') }}
            </button>
          </div>
          <p class="reply-item-text">{{ item.text }}</p>
        </div>
      </div>
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { REPLY_CATEGORIES, REPLY_TEMPLATES } from '../../utils/reply-templates.js'

const { t } = useI18n()
const currentCat = ref(REPLY_CATEGORIES[0])
const templates = computed(() => REPLY_TEMPLATES[currentCat.value] || [])

function selectCategory(cat) {
  currentCat.value = cat
}

/** v-for key：分类内同名话术少见，但用索引兜底保证唯一 */
function catKey(item, i) {
  return currentCat.value + '_' + item.name + '_' + i
}

/** 复制到剪贴板（优先 navigator.clipboard，失败回退 execCommand） */
async function copyText(item) {
  const text = item.text
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopy(text)
    }
    ElMessage.success(t('reply.copied'))
  } catch {
    fallbackCopy(text)
    ElMessage.success(t('reply.copied'))
  }
}

/** 旧浏览器回退：隐藏 textarea + execCommand */
function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta)
}
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.reply-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; color: var(--ink3, #888); font-size: 13px; }

.reply-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.reply-tab {
  padding: 8px 16px;
  border: 1px solid var(--line2, #dcdcdc);
  border-radius: var(--r-m, 8px);
  background: var(--card, #fff);
  color: var(--ink2, #555);
  font-size: 14px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.35s, transform 0.15s ease-out;
}
.reply-tab:hover { border-color: var(--hq, var(--el-color-primary)); color: var(--ink); }
.reply-tab:active { transform: scale(0.98); }
.reply-tab--active {
  background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 12%, var(--card, #fff));
  border-color: var(--hq, var(--el-color-primary));
  color: var(--hq, var(--el-color-primary));
  font-weight: 600;
}

.reply-list { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
.reply-item {
  padding: 16px 20px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
  box-shadow: var(--sh-1, 0 1px 3px rgba(0, 0, 0, 0.06));
}
.reply-item-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.reply-item-name { font-size: 14px; font-weight: 600; color: var(--ink); }
.reply-copy-btn {
  padding: 5px 14px;
  border: 1px solid var(--hq, var(--el-color-primary));
  border-radius: var(--r-m, 8px);
  background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 8%, var(--card, #fff));
  color: var(--hq, var(--el-color-primary));
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.35s, transform 0.15s ease-out;
}
.reply-copy-btn:hover { background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 18%, var(--card, #fff)); }
.reply-copy-btn:active { transform: scale(0.98); }
.reply-item-text { margin-top: 10px; font-size: 14px; line-height: 1.7; color: var(--ink2, #555); white-space: pre-wrap; }
</style>

