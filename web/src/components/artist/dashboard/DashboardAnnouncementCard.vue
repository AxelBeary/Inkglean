<template>
  <!-- 公告独立板块（自定义首页批一；用户拍板：不再与问候卡合二为一）。
       「看过即消」逻辑自 GreetingNote.vue 公告行原样迁入：
       拉 /artist/announcement → 标题一行 + 展开看全文 → 点开即按 updatedAt 记已读（localStorage），
       下次进入本页不再渲染（computed 只读一次 localStorage，展开态内不打断，行为与旧公告行一致）。
       无公告数据时整卡不渲染（Dashboard 据此做系统控制优先过滤）。 -->
  <section v-if="visible" class="ann-card" :aria-label="t('dashboard.annPrefix')">
    <div class="ann-head">
      <span class="ann-prefix">{{ t('dashboard.annPrefix') }}</span>
      <span v-if="announcement?.updatedAt" class="ann-date">{{ formatDateTime(announcement.updatedAt) }}</span>
    </div>
    <button
      class="ann-title"
      type="button"
      :aria-expanded="expanded"
      :aria-label="expanded ? t('dashboard.annCollapse') : t('dashboard.annExpand')"
      @click="toggle"
    >
      <span class="ann-title-text">{{ announcement?.title }}</span>
      <span v-if="announcement?.content" class="ann-caret" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
    </button>
    <p v-if="expanded && announcement?.content" class="ann-content">{{ announcement.content }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../../api/index'
import { formatDateTime } from '../../../utils/datetime'
import { safeGetItem, safeSetItem } from '../../../utils/storage'
import type { PlatformAnnouncement } from '../../../api/types'

const { t } = useI18n()

// ─── 看过即消（按 updatedAt 记已读；键名与 GreetingNote 旧逻辑一致，存量已读标记无缝延续） ───
const ANN_READ_KEY = 'inkglean-ann-read'

const announcement = ref<PlatformAnnouncement | null>(null)
const expanded = ref(false)

/**
 * 可见性：有公告 + 有标题 + 未读过。
 * safeGetItem 非响应式 → 点开记已读后本会话内不消失，下次挂载才不渲染（与旧公告行行为一致）。
 */
const visible = computed(() =>
  announcement.value != null
  && !!announcement.value.title
  && safeGetItem(ANN_READ_KEY) !== announcement.value.updatedAt
)

async function loadAnnouncement(): Promise<void> {
  try {
    announcement.value = await artistApi.getAnnouncement()
  } catch { /* 公告非关键路径，静默降级 */ }
}

function toggle() {
  expanded.value = !expanded.value
  // 点开即视为看过；合上后（下次进入）整卡消失（零打扰）
  if (expanded.value && announcement.value) {
    safeSetItem(ANN_READ_KEY, announcement.value.updatedAt ?? '')
  }
}

onMounted(() => loadAnnouncement())

// Dashboard 系统控制优先用：无公告数据时整个板块不渲染（不管用户怎么排）
defineExpose({ hasContent: visible })
</script>

<style scoped>
/* ─── 公告卡：纸墨卡片（圆角手法/阴影档位对齐 LedgerTodo .ledger-card） ─── */
.ann-card {
  background: var(--card);
  padding: calc(var(--font-scale, 1) * 16px) calc(var(--font-scale, 1) * 24px) calc(var(--font-scale, 1) * 16px);
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-2);
}
.ann-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  margin-bottom: 8px;
}
.ann-prefix {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); letter-spacing: .22em;
}
.ann-date { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); flex: none; }
/* 标题一行：整行可点，展开看全文（自旧 g-ann-line 手法放大一档） */
.ann-title {
  font: inherit; display: flex; align-items: center; gap: 8px; width: 100%;
  font-size: calc(var(--font-scale, 1) * 14.5px); font-weight: 600; color: var(--ink);
  background: none; border: none; padding: 4px 0; cursor: pointer; text-align: left;
  transition: color var(--dur-fast) var(--ease-out);
}
.ann-title:hover { color: var(--hq); }
.ann-title-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ann-caret { flex: none; color: var(--ink4); }
/* 全文：纸底衬块，向上生长 */
.ann-content {
  margin: 8px 0 0; padding: 8px 12px; max-height: 220px; overflow: auto;
  font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); line-height: 1.8;
  white-space: pre-line; word-break: break-word;
  background: color-mix(in srgb, var(--paper2) 70%, transparent);
  border-radius: 4px;
  animation: ann-open var(--dur-mid) var(--ease-out) both;
}
@keyframes ann-open {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
/* 窄屏：内边距收一档 */
@media (max-width: 600px) {
  .ann-card { padding-left: calc(var(--font-scale, 1) * 16px); padding-right: calc(var(--font-scale, 1) * 16px); }
}
@media (prefers-reduced-motion: reduce) {
  .ann-content { animation: none; }
}
</style>
