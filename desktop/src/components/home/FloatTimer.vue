<script setup lang="ts">
// 悬浮计时卡（撕悬浮三件之一）：数据走本地计时 store（localStorage 天然跨窗口共享）。
// F8 纪律：数据仅存本机，永不上传；自动识别软件窗口是二期，本批手动开始/暂停/停止。
import { computed } from 'vue'
import { useTimerStore, formatSeconds } from '../../stores/timer'

const timer = useTimerStore()
const text = computed(() => formatSeconds(timer.todaySeconds))
</script>

<template>
  <div class="ft-body">
    <b class="ft-num num">{{ text }}</b>
    <span class="ft-cap">今日在画 · 数据仅存本机</span>
    <div class="ft-btns">
      <button v-if="!timer.running" type="button" class="ft-btn ft-btn--main" @click="timer.start()">开始</button>
      <button v-else type="button" class="ft-btn" @click="timer.pause()">暂停</button>
      <button type="button" class="ft-btn" :disabled="!timer.running" @click="timer.stop()">停止</button>
    </div>
  </div>
</template>

<style scoped>
.ft-body { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px 4px; }
.ft-num { font-family: var(--f-d); font-size: 26px; font-weight: 700; color: var(--ink); line-height: 1.2; }
.ft-cap { font-size: 11px; color: var(--ink4); }
.ft-btns { display: flex; gap: 8px; margin-top: 6px; }
.ft-btn {
  padding: 6px 16px; border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  background: var(--card); color: var(--ink2); font-size: 12.5px;
  transition: color var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.ft-btn:hover:not(:disabled) { color: var(--ink); border-color: var(--ink4); }
.ft-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ft-btn--main { background: var(--hq); border-color: var(--hq); color: var(--card); }
.ft-btn--main:hover { background: var(--hq-d); }
</style>
