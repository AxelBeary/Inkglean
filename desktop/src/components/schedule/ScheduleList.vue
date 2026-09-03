<script setup lang="ts">
// 排期列表 pane（9/4 主页重设计落码波1 · 路A）：分区＝正式区/缓冲区（有货才渲染）。
// 波1 只读：不渲染拖柄 ⠿、不接任何拖拽/drop 事件（原型里的 grip 属波2）。
// 状态文案/色调映射走 statusLabel.ts（与哨兵测试同源，不在本文件里另立副本）。
import { computed } from 'vue'
import { bandTone, daysLeft } from '../../schedule/band'
import type { SchedOrder } from '../../schedule/types'
import { deadlineLevel } from '../home/deadline'
import { statusLabel, statusTone } from './statusLabel'

const props = defineProps<{
  orders: SchedOrder[]
  /** 名额文案（云端非空时附在区头；本地空串不渲染） */
  slotText: string
}>()

/** 点色：over→朱砂 / soon→藤黄 / done→石绿 / 其余→花青 */
function dotClass(o: SchedOrder): string {
  const tone = bandTone(o)
  if (tone === 'over') return 'zs'
  if (tone === 'soon') return 'th'
  if (tone === 'done') return 'sl'
  return 'hq'
}

interface DueInfo { cls: string; text: string }
function dueInfo(o: SchedOrder): DueInfo {
  const dl = daysLeft(o.deadline)
  if (dl === null) return { cls: 'buf', text: '未排期' }
  const level = deadlineLevel(dl)
  return { cls: level.cls, text: level.text }
}

const formalOrders = computed(() => props.orders.filter(o => o.zone === 'formal'))
const bufferOrders = computed(() => props.orders.filter(o => o.zone === 'buffer'))

/** 正式区在途数（不含已完成） */
const formalActive = computed(() => formalOrders.value.filter(o => !o.done).length)
/** 缓冲区在途数 */
const bufferActive = computed(() => bufferOrders.value.filter(o => !o.done).length)
</script>

<template>
  <div class="list-pane">
    <!-- 正式区（有货才渲染） -->
    <div v-if="formalOrders.length > 0" class="list-zone">
      <div class="zh">
        正式区
        <span class="cnt">
          {{ formalActive }} 笔在途<template v-if="slotText"> · {{ slotText }}</template>
        </span>
      </div>
      <div v-for="o in formalOrders" :key="o.key" class="q-item">
        <span class="dot" :class="dotClass(o)" />
        <span class="q-who"><strong>{{ o.who }}</strong> · {{ o.what }}</span>
        <span class="q-st" :class="statusTone(o.status)">{{ statusLabel(o.status) }}</span>
        <span class="q-due" :class="dueInfo(o).cls">{{ dueInfo(o).text }}</span>
      </div>
    </div>

    <!-- 缓冲区（有货才渲染） -->
    <div v-if="bufferOrders.length > 0" class="list-zone">
      <div class="zh">
        缓冲区
        <span class="cnt">{{ bufferActive }} 笔候补</span>
      </div>
      <div v-for="o in bufferOrders" :key="o.key" class="q-item">
        <span class="dot" :class="dotClass(o)" />
        <span class="q-who"><strong>{{ o.who }}</strong> · {{ o.what }}</span>
        <span class="q-st" :class="statusTone(o.status)">{{ statusLabel(o.status) }}</span>
        <span class="q-due" :class="dueInfo(o).cls">{{ dueInfo(o).text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-pane { min-width: 0; }

.list-zone { margin-bottom: 14px; }
.list-zone .zh {
  font-family: var(--f-d); font-size: 14px; color: var(--ink2);
  margin-bottom: 6px; display: flex; align-items: center; gap: 8px;
  min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.list-zone .zh .cnt { font-size: 11.5px; color: var(--ink4); font-family: var(--f-b); }

/* 波1 只读：grid 四列（无 grip 列）＝ dot + who + status + due */
.q-item {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto auto;
  align-items: center; gap: 10px;
  height: var(--row, 52px); padding: 0 10px;
  border-radius: var(--r-s-hand);
  border-bottom: 1px solid rgba(var(--ink-rgb), .08);
  transition: background var(--dur-fast) var(--ease-out);
}
.q-item:hover { background: rgba(var(--ink-rgb), .045); }

.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot.zs { background: var(--zs); }
.dot.th { background: var(--th); }
.dot.sl { background: var(--sl); }
.dot.hq { background: var(--hq); }

.q-who {
  min-width: 0; font-size: 14px; color: var(--ink2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.q-who strong { color: var(--ink); font-weight: 600; }

.q-st {
  font-size: 11.5px; padding: 1px 8px; border-radius: var(--r-s-hand); white-space: nowrap;
}
.q-st.hq { background: var(--hq-t); color: var(--hq-d); }
.q-st.th { background: var(--th-t); color: var(--th); }
.q-st.sl { background: var(--sl-t); color: var(--sl); }
.q-st.buf { background: rgba(var(--ink-rgb), .06); color: var(--ink4); }

.q-due { font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.q-due.zs-d { color: var(--zs-d); }
.q-due.zs { color: var(--zs); }
.q-due.hq { color: var(--hq-d); }
.q-due.buf { color: var(--ink4); font-weight: 500; }
</style>
