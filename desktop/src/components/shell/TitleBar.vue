<script setup lang="ts">
// 自绘标题栏（827 起与卷面一张纸融合，无独立杆形装饰）：系统标题栏退役（decorations:false）后，窗口所有权归壳层。
// 左 = 朱砂小印「拾」+ 产品名；右 = 最小化 / 最大化切换 / 关闭。
// 全部动作经冻结契约件 ../../bridge/window.ts，不直接 invoke；props 零依赖，由 Home.vue 槽位挂载。
// 纸墨气质：纸底、墨字、克制，不要系统标题栏味（样式只消费 paper-ink.css token）。
import { onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isDesktop } from '../../bridge/env'
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from '../../bridge/window'

// 重载数据：标题栏常驻入口，页面自己接住重拉（826：取数只在进首页一刻，补个随时可点的重载）
// 点按动画：图标转一圈即静（克制动效品味：一次性、不循环）
const emit = defineEmits<{ (_e: 'refresh'): void }>()
const spinning = ref(false)
function onRefresh(): void {
  emit('refresh')
  spinning.value = true
}
function onSpinEnd(): void {
  spinning.value = false
}

/** 当前是否最大化（最大化按钮图标换态依据；toggle 返回 boolean 直接用） */
const maximized = ref(false)
let unlistenResize: (() => void) | undefined

onMounted(async () => {
  // 纯浏览器预览环境无壳层可查，跳过状态同步（按钮点击会经 bridge 抛 BridgeUnavailableError）
  if (!isDesktop()) return
  const win = getCurrentWindow()
  maximized.value = await win.isMaximized()
  // 窗口被系统快捷键（Win+↑/↓）改变最大化时也保持图标同步
  unlistenResize = await win.onResized(async () => {
    maximized.value = await win.isMaximized()
  })
})

onUnmounted(() => {
  unlistenResize?.()
})

// 壳层按钮失败不许拖垮页面：静默吞错（Rust 侧已是 Result 静默语义）
async function quietly(action: () => Promise<unknown>): Promise<void> {
  try {
    await action()
  } catch {
    /* 静默：自绘标题栏按钮失败不产生页面级错误 */
  }
}

function onMinimize(): void {
  void quietly(minimizeWindow)
}

function onToggleMaximize(): void {
  void quietly(async () => {
    maximized.value = await toggleMaximizeWindow()
  })
}

function onClose(): void {
  void quietly(closeWindow)
}
</script>

<template>
  <header class="title-bar" data-tauri-drag-region>
    <div class="title-bar__brand" data-tauri-drag-region>
      <span class="title-bar__seal" aria-hidden="true">拾</span>
      <span class="title-bar__name">拾绘</span>
    </div>
    <div class="title-bar__controls">
      <button
        type="button"
        class="title-bar__ctrl title-bar__ctrl--ghost"
        aria-label="重载数据"
        title="重载数据"
        @click="onRefresh"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" :class="{ spin: spinning }" @animationend="onSpinEnd">
          <path d="M10 6a4 4 0 1 1-1.2-2.85" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          <path d="M10 1.6v2h-2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        class="title-bar__ctrl"
        aria-label="最小化"
        @click="onMinimize"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 6h7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </button>
      <button
        type="button"
        class="title-bar__ctrl"
        :aria-label="maximized ? '还原' : '最大化'"
        @click="onToggleMaximize"
      >
        <svg
          v-if="maximized"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <path d="M4.2 2.2h5.6v5.6M2.2 4.2h5.6v5.6H2.2z" fill="none" stroke="currentColor" stroke-width="1.1" />
        </svg>
        <svg
          v-else
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <rect x="2.4" y="2.4" width="7.2" height="7.2" fill="none" stroke="currentColor" stroke-width="1.1" />
        </svg>
      </button>
      <button
        type="button"
        class="title-bar__ctrl title-bar__ctrl--close"
        aria-label="关闭"
        @click="onClose"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
/* 长卷天杆（827 用户终验整改：去掉墨杆与绫边线，整条与卷面一张纸融在一起，只留功能） */
.title-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding-left: 12px;
  background-color: var(--paper);
  color: var(--ink);
  font-family: var(--f-b);
  user-select: none;
  cursor: default;
}

.title-bar__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 朱砂小印「拾」 */
.title-bar__seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background-color: var(--zs);
  color: var(--paper2);
  font-family: var(--f-d);
  font-size: 13px;
  line-height: 1;
  border-radius: var(--r-s-hand);
}

.title-bar__name {
  font-family: var(--f-d);
  font-size: 15px;
  letter-spacing: 0.08em;
  color: var(--ink);
}

.title-bar__controls {
  display: flex;
  height: 100%;
}

.title-bar__ctrl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 100%;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--ink2);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    background-color var(--dur-fast) var(--ease-out);
}

/* hover 墨色加深 */
.title-bar__ctrl:hover {
  color: var(--ink);
  background-color: var(--paper2);
}

.title-bar__ctrl:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: -2px;
}

/* 重载按钮：窄一号、不抢控制钮的位 */
.title-bar__ctrl--ghost {
  width: 36px;
  color: var(--ink3);
}
/* 点按转一圈：一次性演完即静，转中连点不重置（动画未终不重复触发） */
.title-bar__ctrl--ghost svg.spin {
  animation: tb-spin 0.6s var(--ease-out);
}
@keyframes tb-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .title-bar__ctrl--ghost svg.spin { animation: none; }
}

/* 关闭按钮 hover 淡朱砂底 */
.title-bar__ctrl--close:hover {
  color: var(--zs-d);
  background-color: var(--zs-t);
}
</style>
