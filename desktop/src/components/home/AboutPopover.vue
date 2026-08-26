<script setup lang="ts">
// 关于弹层：版本号 + 「F8 画画时间数据永不上传」承诺一句。
// 墨笔菜单「关于拾绘」与卷尾「关于拾绘」两个入口共用（Home 持有开关态）。
import { onMounted, onUnmounted, ref } from 'vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (_e: 'close'): void }>()

const VERSION = '0.1.0'
const popRef = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent) {
  if (popRef.value && !popRef.value.contains(e.target as Node)) emit('close')
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div v-if="open" ref="popRef" class="about-pop" role="dialog" aria-label="关于拾绘">
    <div class="ap-head">
      <span class="ap-seal" aria-hidden="true">拾</span>
      <div class="ap-title">
        <b>拾绘桌面版</b>
        <span class="num">v{{ VERSION }}</span>
      </div>
    </div>
    <p class="ap-promise">画画时间数据仅存本机，永不上传。</p>
    <button type="button" class="ap-close" @click="$emit('close')">合上</button>
  </div>
</template>

<style scoped>
.about-pop {
  position: fixed; right: 34px; bottom: 18px; z-index: 40; width: 240px;
  padding: 14px 16px;
  background: var(--card); border-radius: var(--r-paper);
  box-shadow: 0 0 0 1px rgba(var(--ink-rgb), .06), 0 2px 4px rgba(var(--ink-rgb), .08), 0 18px 36px -18px rgba(var(--ink-rgb), .5);
}
.ap-head { display: flex; align-items: center; gap: 10px; }
.ap-seal {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  background: var(--zs); color: var(--card); font-family: var(--f-d); font-size: 15px;
  border-radius: var(--r-paper); transform: rotate(-4deg); flex: none;
}
.ap-title { display: flex; flex-direction: column; }
.ap-title b { font-family: var(--f-d); font-size: 14px; color: var(--ink); }
.ap-title .num { font-size: 11.5px; color: var(--ink4); }
.ap-promise { margin: 10px 0 8px; font-size: 12.5px; color: var(--ink2); display: flex; align-items: center; gap: 6px; }
.ap-promise::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--sl); flex: none; }
.ap-close {
  font-size: 12px; color: var(--ink3); padding: 4px 10px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.ap-close:hover { color: var(--ink); border-color: var(--ink4); }
</style>
