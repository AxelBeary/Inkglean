<script setup lang="ts">
// 桌面版撤销条（9/13 波2 拖拽改期 · 路B）：行为照网页端 web/src/components/artist/UndoToast.vue
// （一次性撤销 + 到点自动收），样式重写为纸墨口径——网页端那是 Element 深色气泡血统（自带一套写死的
// 半透明墨底、纯白文字与一套蓝色高亮，都进不了我们的 token 表），桌面端暗色主题靠 --ink-rgb 翻转，照搬等于埋两颗雷。
// 为什么不用 desktop/src/tools/host.ts 的现成 toast：纯文本 2.4s 自动消失、没有 action 位，
// 承载不了「撤销」这颗按钮（施工图 P5）。
// 与宿主 .sched-toast 是同一视觉语言且互斥显示（成功那次写由本件承担文案），
// 所以形状/圆角/边框/阴影全部照 .sched-toast 那套 token 走，不留两套打架。
import { onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** 显隐（父组件掌握生命周期：新写、重拉、点了撤销都立即作废） */
  visible: boolean
  /** 提示文案（走文本插值，绝不 v-html——文案里含客户名与后端返回串） */
  message: string
  /** 撤销按钮文案（由宿主传入已定稿的中文串，本件不依赖 i18n） */
  label?: string
  /** 自动消失时长（ms） */
  duration?: number
}>(), {
  label: '撤销',
  duration: 5000
})

const emit = defineEmits<{
  /** 元组写法（不用 `(e): void` 函数签名：那会被 eslint 判成未使用形参） */
  undo: []
  timeout: []
}>()

const undoing = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (timer) { clearTimeout(timer); timer = null }
}

/** 撤销是一次性的：点下去立刻上锁再通知父组件执行恢复。
 *  为什么要锁：撤销＝把旧值再两步 PUT 写回去，连点两下就是同一份旧值写两遍，
 *  第二遍必因 version 已变吃 409，画师会看到一句莫名其妙的「冲突已刷新」——
 *  按钮禁用比事后解释便宜，也让「已撤销」这句话只说一次。 */
function onUndo(): void {
  if (undoing.value) return
  undoing.value = true
  clearTimer()
  emit('undo')
}

// 弹出才起倒计时；收起（到点 / 父组件作废目标）解锁，下一次操作又能重新点。
// 为什么 message 变化也要重置：宿主连续拖两条时会原地换文案而不闪断 visible，
// 不重起倒计时的话第二条会被上一条剩余的时钟提前吞掉，锁也解不开。
watch([() => props.visible, () => props.message], ([v]) => {
  clearTimer()
  undoing.value = false
  if (v) timer = setTimeout(() => emit('timeout'), props.duration)
}, { immediate: true })

onBeforeUnmount(clearTimer)
</script>

<template>
  <Teleport to="body">
    <Transition name="undo">
      <div v-if="visible" class="undo-toast" role="status">
        <span class="ut-msg">{{ message }}</span>
        <button type="button" class="ut-btn" :disabled="undoing" @click="onUndo">{{ label }}</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 底部居中，几何与 z-index 一律跟工具箱既有 .toast 同口径（bottom 32 / padding 8 16 / z-index 60）；
   它与宿主的普通一句 toast 靠 v-if 互斥（同屏只留一条），所以同位同层不会打叠 */
.undo-toast {
  position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%);
  z-index: 60;
  display: flex; align-items: center; gap: 12px;
  max-width: min(72vw, 520px);
  padding: 8px 16px;
  font-size: 12.5px; color: var(--ink2); background: var(--card);
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  box-shadow: 0 10px 24px -16px rgba(var(--ink-rgb), .45);
}
.ut-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ut-btn {
  flex: none; font-size: 12px; padding: 4px 12px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  color: var(--hq-d); background: var(--hq-t);
  /* hover 只换边色不位移（动效克制红线）；禁用态靠透明度弱下去，不另配色 */
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
}
.ut-btn:hover:not(:disabled) { border-color: var(--hq); }
.ut-btn:disabled { opacity: .55; cursor: default; }

.undo-enter-active, .undo-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.undo-enter-from, .undo-leave-to { opacity: 0; transform: translate(-50%, 6px); }
</style>
