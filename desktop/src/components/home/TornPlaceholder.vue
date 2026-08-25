<script setup lang="ts">
// 撕出后的主窗淡墨占位（方向 A 落码批·撕悬浮框架行为）：
// 对应件已撕成悬浮小窗，原位留一块淡墨空位；点我贴回 = closeFloatingWindow + setTorn(false)。
// 壳层命令负责销毁窗口，这里只调贴回命令并更新本地撕出状态。
import { usePrefsStore } from '../../stores/prefs'
import { closeFloatingWindow } from '../../bridge/window'
import type { TearableId } from '../../panels/contract'

const props = defineProps<{
  kind: TearableId
  /** 被撕走那件的名字（如「计时器」） */
  label: string
}>()

const prefs = usePrefsStore()

async function pasteBack() {
  prefs.setTorn(props.kind, false)
  try {
    await closeFloatingWindow(props.kind)
  } catch {
    // 纯浏览器环境/窗口已不在：静默降级（贴回语义本地已生效）
  }
}
</script>

<template>
  <button type="button" class="torn-slot" :aria-label="`${label}已撕出，点击贴回主窗`" @click="pasteBack">
    <span class="torn-mark" aria-hidden="true">✂</span>
    <span class="torn-text">已撕出 · 点我贴回</span>
  </button>
</template>

<style scoped>
.torn-slot {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 10px 14px;
  border: 1px dashed var(--line2); border-radius: var(--r-s-hand);
  background: rgba(38, 37, 32, 0.025);
  color: var(--ink4); font-size: 12.5px;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.torn-slot:hover { color: var(--ink2); border-color: var(--ink4); background: rgba(38, 37, 32, 0.045); }
.torn-mark { font-size: 11px; opacity: 0.7; }
</style>
