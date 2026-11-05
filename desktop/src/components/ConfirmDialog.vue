<script setup lang="ts">
// 纸墨风确认框（issue #83）：桌面端渲染层原先四处走 window.confirm——WebView2 里那是浏览器模态，
// 脱离纸墨体系、遮罩与 Esc 口径不可控。本组件只承载交互与样式，文案由调用方逐字传入，一字不改。
// 无障碍：role="dialog" + aria-modal；Esc／点遮罩＝取消；打开焦点落「确定」，关闭由控制器还原到触发元素。
// 挂载方：tools/confirm.ts（每次调用临时 createApp 到 body，不污染 App 层）。
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(defineProps<{
  message: string
  title?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>(), {
  title: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false
})

const emit = defineEmits<{ (_e: 'confirm'): void; (_e: 'cancel'): void }>()

const cardRef = ref<HTMLElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)
const okRef = ref<HTMLButtonElement | null>(null)

// 连点／Esc 与点击同帧竞态：只认第一次落定，防双 emit 双 unmount
let settled = false

function settle(kind: 'confirm' | 'cancel'): void {
  if (settled) return
  settled = true
  if (kind === 'confirm') emit('confirm')
  else emit('cancel')
}

function onOverlayClick(e: MouseEvent): void {
  // 模态期间不让点击穿透到 document 上的全局监听（墨笔菜单/关于浮层的点外关闭会误触发）
  e.stopPropagation()
  if (e.target === e.currentTarget) settle('cancel')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    // 捕获阶段拦下：墨笔菜单也监听 document 的 Esc，两者不能同一次按键一起关
    e.preventDefault()
    e.stopPropagation()
    settle('cancel')
    return
  }
  if (e.key !== 'Tab') return
  const first = cancelRef.value
  const last = okRef.value
  if (!first || !last || !cardRef.value) return
  const active = document.activeElement
  if (!cardRef.value.contains(active)) {
    e.preventDefault()
    last.focus()
    return
  }
  // 两个可聚焦元素首尾互接，Tab 不跑出卡片
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown, true)
  // 挂载即落焦（mounted 时 DOM 已就位，refs 已可用）
  okRef.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div class="cd-overlay" @click="onOverlayClick">
    <div
      ref="cardRef"
      class="cd-card"
      role="dialog"
      aria-modal="true"
      :aria-label="title || '确认'"
    >
      <p v-if="title" class="cd-title">{{ title }}</p>
      <p class="cd-msg">{{ message }}</p>
      <div class="cd-actions">
        <button ref="cancelRef" type="button" class="cd-btn cd-cancel" @click="settle('cancel')">{{ cancelText }}</button>
        <button ref="okRef" type="button" class="cd-btn cd-ok" :class="{ 'cd-ok--danger': danger }" @click="settle('confirm')">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 遮罩 32% 墨色：与 MoreDrawer 同口径（rgba(var(--ink-rgb), .28) 之上略压，模态优先） */
.cd-overlay {
  position: fixed; inset: 0; z-index: 70;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: rgba(var(--ink-rgb), .32);
}
/* 卡片：纸面 + 手剪角；限高吃 --app-h 不写 100vh（字号 zoom 下 100vh 超窗） */
.cd-card {
  width: min(420px, 100%);
  max-height: calc(var(--app-h, 100vh) - 48px);
  overflow-y: auto;
  padding: 20px 24px 16px;
  background: var(--card);
  border-radius: var(--r-paper);
  box-shadow: 0 0 0 1px rgba(var(--ink-rgb), .06), 0 2px 4px rgba(var(--ink-rgb), .08), 0 18px 36px -18px rgba(var(--ink-rgb), .5);
}
.cd-title { font-family: var(--f-d); font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 8px; }
/* pre-line：ExportTool 的冲突提醒带换行，原生 confirm 能分段，这里逐字保住 */
.cd-msg { font-size: 13.5px; line-height: 1.85; color: var(--ink2); white-space: pre-line; overflow-wrap: anywhere; }
.cd-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
.cd-btn {
  padding: 8px 20px; font-size: 12.5px; border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast);
}
.cd-btn:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
.cd-cancel { color: var(--ink2); background: var(--paper2); border: 1px solid var(--line2); }
.cd-cancel:hover { color: var(--ink); border-color: var(--ink4); }
.cd-ok { color: var(--card); background: var(--hq); border: 1px solid var(--hq); }
.cd-ok:hover { background: var(--hq-d); border-color: var(--hq-d); }
/* 危险确认（整库替换一类）：换朱砂，纸墨语义里就是警示 */
.cd-ok--danger { background: var(--zs); border-color: var(--zs); }
.cd-ok--danger:hover { background: var(--zs-d); border-color: var(--zs-d); }
</style>
