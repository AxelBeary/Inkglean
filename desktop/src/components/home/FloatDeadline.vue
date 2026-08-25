<script setup lang="ts">
// 悬浮截稿倒计时卡（撕悬浮三件之一）：云端模式重新 fetch；本地模式不调云端接口，走空态。
// 三色分级照原型口径（剩 3 天/明天截稿/逾期）。
import { computed, onMounted, ref } from 'vue'
import { fetchDeadlineSoon } from '../../api/artist'
import type { DeadlineSoonItem } from '../../api/types'
import { deadlineLevel } from './deadline'

const props = defineProps<{ mode: 'cloud' | 'local' }>()

const items = ref<DeadlineSoonItem[]>([])
const failed = ref(false)

const rows = computed(() => items.value.map(it => ({ it, lv: deadlineLevel(it.daysLeft) })))

onMounted(async () => {
  if (props.mode !== 'cloud') return
  try {
    items.value = (await fetchDeadlineSoon(14, 6)).items
  } catch {
    failed.value = true // 静默降级：轻量提示一行，不弹错误框
  }
})
</script>

<template>
  <div class="fdl-body">
    <p v-if="mode === 'local'" class="fdl-empty">登录同步后显示截稿倒计时</p>
    <p v-else-if="failed" class="fdl-empty">暂时取不到截稿</p>
    <p v-else-if="items.length === 0" class="fdl-empty">近期无截稿，从容落笔</p>
    <ul v-else class="fdl-list">
      <li v-for="r in rows" :key="r.it.id" class="fdl-row">
        <span class="fdl-what">{{ r.it.clientName ?? r.it.orderNo }}</span>
        <span class="fdl-due" :class="r.lv.cls">{{ r.lv.text }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.fdl-body { padding: 6px 2px 2px; min-width: 0; }
.fdl-empty { margin: 6px 0; font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }
.fdl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.fdl-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  height: 34px; padding: 0 4px;
  border-bottom: 1px solid rgba(38, 37, 32, .08);
  min-width: 0;
}
.fdl-row:last-child { border-bottom: none; }
.fdl-what { font-size: 12.5px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fdl-due { flex: none; font-size: 12px; font-weight: 600; }
.fdl-due.zs-d { color: var(--zs-d); }
.fdl-due.zs { color: var(--zs); }
.fdl-due.hq { color: var(--hq-d); }
.fdl-due.buf { color: var(--ink4); font-weight: 500; }
</style>
