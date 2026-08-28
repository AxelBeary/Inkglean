<script setup lang="ts">
// 撕悬浮窗内容视图（/float/timer · /float/today-todo · /float/deadline 三路由共用壳）
// 纸墨小卡：自带迷你题跋条（可拖动区 + 贴回按钮）。窗口由壳层创建/销毁，
// 贴回＝setTorn(false) + closeFloatingWindow（壳层命令销毁窗口）。
import { computed } from 'vue'
import { usePrefsStore } from '../../stores/prefs'
import { useAuthStore } from '../../stores/auth'
import { closeFloatingWindow } from '../../bridge/window'
import type { TearableId } from '../../panels/contract'
import FloatTimer from './FloatTimer.vue'
import FloatTodayTodo from './FloatTodayTodo.vue'
import FloatDeadline from './FloatDeadline.vue'

const props = defineProps<{ kind: TearableId }>()

const TITLE: Record<TearableId, string> = {
  timer: '计时器',
  'today-todo': '今日待办',
  deadline: '截稿倒计时'
}

const prefs = usePrefsStore()
const auth = useAuthStore()
const title = computed(() => TITLE[props.kind])

async function pasteBack() {
  prefs.setTorn(props.kind, false)
  try {
    await closeFloatingWindow(props.kind)
  } catch {
    // 纯浏览器环境无壳层窗口：兜底自关标签（桌面壳下此分支不会走到）
    window.close()
  }
}
</script>

<template>
  <div class="float-card">
    <div class="mini-tail" data-tauri-drag-region>
      <span class="mt-title" data-tauri-drag-region>{{ title }}</span>
      <button type="button" class="mt-back" @click="pasteBack">贴回</button>
    </div>
    <FloatTimer v-if="kind === 'timer'" />
    <FloatTodayTodo v-else-if="kind === 'today-todo'" :mode="auth.mode" />
    <FloatDeadline v-else :mode="auth.mode" />
  </div>
</template>

<style scoped>
/* 悬浮小窗独立成页：纸底铺满，卡片居中贴顶（827：窗高吃 --app-h 不写 100vh，字号 zoom 下 100vh 超窗） */
.float-card {
  min-height: var(--app-h); box-sizing: border-box;
  padding: 0 12px 12px;
  background-color: var(--paper);
  font-family: var(--f-b); color: var(--ink); font-size: 14px;
}
.mini-tail {
  display: flex; align-items: center; justify-content: space-between;
  height: 34px; padding: 0 2px;
  border-bottom: 1px solid rgba(var(--ink-rgb), .10);
}
.mt-title {
  font-family: var(--f-d); font-size: 13px; letter-spacing: .08em; color: var(--ink3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mt-back {
  flex: none; font-size: 11.5px; color: var(--ink3); padding: 3px 10px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--card);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.mt-back:hover { color: var(--hq-d); border-color: var(--hq); }
</style>
