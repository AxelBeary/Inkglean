<script setup lang="ts">
// 悬浮今日待办卡（撕悬浮三件之一）：云端模式重新 fetch；本地模式不调云端接口，走空态。
import { onMounted, ref } from 'vue'
import { fetchTodos } from '../../api/artist'
import type { TodoItem } from '../../api/types'

const props = defineProps<{ mode: 'cloud' | 'local' }>()

const items = ref<TodoItem[]>([])
const failed = ref(false)

onMounted(async () => {
  if (props.mode !== 'cloud') return
  try {
    items.value = (await fetchTodos()).items
  } catch {
    failed.value = true // 静默降级：轻量提示一行，不弹错误框
  }
})
</script>

<template>
  <div class="fd-body">
    <p v-if="mode === 'local'" class="fd-empty">今日无事，不如去画画</p>
    <p v-else-if="failed" class="fd-empty">暂时取不到待办</p>
    <p v-else-if="items.length === 0" class="fd-empty">今日无事，不如去画画</p>
    <ul v-else class="fd-list">
      <li v-for="t in items" :key="t.id" class="fd-row">
        <span class="fd-dot" aria-hidden="true"></span>
        <span class="fd-what">{{ t.clientName ?? t.orderNo }} · {{ t.stageName ?? t.tag }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.fd-body { padding: 6px 2px 2px; min-width: 0; }
.fd-empty { margin: 6px 0; font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }
.fd-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.fd-row {
  display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 4px;
  border-bottom: 1px solid rgba(var(--ink-rgb), .08);
  min-width: 0;
}
.fd-row:last-child { border-bottom: none; }
.fd-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--hq); }
.fd-what { font-size: 12.5px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
