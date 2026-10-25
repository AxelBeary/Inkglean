<template>
  <!-- issue-51 拆分批：自 PriceCard.vue 抽出的「挑作品」弹窗（oimimo 吸纳批三 / shared-824 自绘遮罩弹窗） -->
  <!-- issue 51-5 可达性：aria-modal + tabindex=-1 + Escape 关闭 + Tab 焦点陷阱 + 开弹窗聚焦首项/关弹窗焦点归还 -->
  <div class="pc-modal-mask" @click.self="emit('close')">
    <div
      ref="dialogEl"
      class="pc-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="t('priceCard.pickTitle')"
      @keydown="onKeydown"
    >
      <div class="pc-modal-head">{{ t('priceCard.pickTitle') }}</div>
      <div class="pc-picker-grid">
        <p v-if="loading" class="pc-picker-loading">{{ t('priceCard.importLoading') }}</p>
        <p v-else-if="!artworks || artworks.length === 0" class="pc-picker-empty">{{ t('priceCard.pickEmpty') }}</p>
        <button
          v-for="art in artworks" :key="art.id" type="button"
          class="pc-picker-item" :class="{ 'pc-picker-item--on': pickedIds.has(art.id) }"
          :aria-label="art.title || String(art.id)"
          @click="emit('toggle', art)"
        >
          <img :src="art.src" alt="" class="pc-picker-img" />
          <span v-if="art.title" class="pc-picker-name">{{ art.title }}</span>
        </button>
      </div>
      <div class="pc-modal-foot">
        <button type="button" class="pc-btn" @click="emit('close')">{{ t('common.confirm') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 哑组件纪律同 PriceCard：不发请求、不碰存储；勾选/关闭一律 emit 归父组件
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { PriceCardArtwork, TFn } from './types'

defineProps<{
  t: TFn
  /** 作品库条目（父组件已做 ?? [] 归一） */
  artworks: PriceCardArtwork[]
  loading: boolean
  /** 已勾选作品 id 集（勾选态纸签描边 + 角标） */
  pickedIds: Set<number>
}>()

const emit = defineEmits<{
  /** 关闭请求：遮罩空白点击 / 确定钮 / Escape 一律走这里，v-if 收放归父组件 */
  close: []
  /** 勾选/取消勾选一张作品 */
  toggle: [art: PriceCardArtwork]
}>()

const dialogEl = ref<HTMLElement | null>(null)

// 焦点陷阱可聚焦元素口径（disabled 控件不进环）
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 打开时的触发元素（关闭/卸载时焦点归还它） */
let restoreEl: HTMLElement | null = null

function focusables(): HTMLElement[] {
  return Array.from(dialogEl.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
}

onMounted(() => {
  const active = document.activeElement
  restoreEl = active instanceof HTMLElement ? active : null
  // 打开即聚焦弹窗内首个可聚焦元素；无可聚焦元素时回落弹窗本体（tabindex=-1）
  const nodes = focusables()
  const target = nodes[0] ?? dialogEl.value
  target?.focus()
})

onBeforeUnmount(() => {
  // 关闭时焦点归还触发元素（仍在文档中才归还，防宿主已卸载触发钮）
  if (restoreEl && document.contains(restoreEl)) restoreEl.focus()
  restoreEl = null
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
    return
  }
  if (e.key !== 'Tab') return
  // Tab 焦点陷阱：首尾循环，焦点不出弹窗
  const nodes = focusables()
  if (!nodes.length) {
    e.preventDefault()
    dialogEl.value?.focus()
    return
  }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !dialogEl.value?.contains(active)) {
    e.preventDefault()
    first.focus()
    return
  }
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<style scoped>
/* 样式纯拆搬自 PriceCard.vue（scoped 不跨组件，弹窗所需条目随组件走）；色值全走宿主注入 token */
.pc-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ink) 45%, transparent);
}
.pc-modal {
  width: min(92vw, 640px);
  max-height: 84vh;
  overflow: auto;
  padding: 16px 20px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
}
.pc-modal-head {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  padding-bottom: 12px;
}
.pc-modal-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

.pc-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  min-height: 120px;
}
.pc-picker-empty { grid-column: 1 / -1; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }
/* shared-824：加载态文本节点（文案走 props.t） */
.pc-picker-loading { grid-column: 1 / -1; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }
.pc-picker-item {
  position: relative;
  padding: 0;
  border: 2px solid var(--line);
  border-radius: var(--r-s);
  background: var(--paper2);
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--dur-fast);
}
.pc-picker-item--on { border-color: var(--zs); }
.pc-picker-item--on::after {
  content: "✓";
  position: absolute; top: 4px; right: 4px;
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  background: var(--zs); color: var(--white, #fff);
  border-radius: var(--r-paper);
  font-size: 12px;
}
.pc-picker-img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
.pc-picker-name {
  display: block;
  padding: 4px 8px;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* 弹窗底部确定钮（.pc-btn 基态随弹窗迁入；主表单侧仍由 PriceCard.vue 自持一份） */
.pc-btn {
  padding: 8px 16px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast), background-color var(--dur-fast), transform var(--dur-fast) ease-out;
}
.pc-btn:hover:not(:disabled) { border-color: var(--hq); color: var(--hq); }
.pc-btn:active:not(:disabled) { transform: scale(0.98); }
.pc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
