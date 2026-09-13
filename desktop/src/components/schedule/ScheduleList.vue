<script setup lang="ts">
// 排期列表 pane（9/4 波1 · 路A 只读 → 9/13 波2 · 路A 加拖排）：分区＝正式区/缓冲区（有货才渲染）。
// 波2 口径：整行可拖（原生 HTML5 dnd，不引第三方拖拽库），并另给 Alt+↑/↓ 键盘等价路径（无障碍不许只有鼠标）。
// 组件保持"哑"：只递「界面上全部正式区行按新序排一遍」这一个意图，写、重拉、回滚全在宿主 + store，
// 本文件不 import api、不 import store、不自己改 props.orders（那是两套真相的老坑）。
// 状态文案/色调映射走 statusLabel.ts（与哨兵测试同源，不在本文件里另立副本）。
import { computed, ref } from 'vue'
import { bandTone, daysLeft } from '../../schedule/band'
import type { SchedOrder } from '../../schedule/types'
import { canReorderRow, reorderIds } from '../../schedule/drag'
import { deadlineLevel } from '../home/deadline'
import { statusLabel, statusTone } from './statusLabel'

const props = withDefaults(defineProps<{
  orders: SchedOrder[]
  /** 名额文案（云端非空时附在区头；本地空串不渲染） */
  slotText: string
  /** 列表拖排是否开放（宿主传 sched.canWriteList：云端 + 无在途写 + 正式区 ≥2 行）。
   *  缺省按 false 处理＝一行都不给可供性——漏传等于关闭，不会误开写路径。 */
  reorderable?: boolean
}>(), { reorderable: false })

/** 拖排意图：orderedIds＝界面上全部正式区行按新序排一遍（后端只认整段，见 emitReorder 注释）；
 *  oldIndex/newIndex 是正式区内部下标（0 基），与 orderedIds 出自同一次 reorderIds() 计算。 */
const emit = defineEmits<{
  /** payload 命名保留在元组里（不用 `(e, payload)` 函数签名：那会被 eslint 判成未使用形参） */
  reorder: [payload: { orderedIds: number[]; oldIndex: number; newIndex: number }]
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

// ─── 波2 拖排：整段正式区一把交，缓冲区一行都不许混进去 ───────────────
/** 正式区 id 序列（拖排的唯一种子）：emit 出去的 orderedIds 只能是它的一个排列。
 *  为什么必须整段：后端按「整段正式区顺序」落位，长度/重复/归属任一条不符就 400，
 *  只交被拖那一两条等于发一条注定被拒的半成品请求（store 侧同口径再挡一道）。 */
const formalIds = computed<number[]>(() => formalOrders.value.map(o => o.id))

/** 本段正式区是否开放拖排。闸有两道：
 *  ① 宿主给的 reorderable（本地模式 / 有写在途 / 不足两行时为 false）——不开就一点可供性都不画；
 *  ② 区里每一行都过得 canReorderRow（云端行才有 version）。第二道是为"整段可辨识"服务的：
 *     只要有一行认不出身份，就交不出后端认得的完整序列，于是整段禁拖——宁可拖不动，
 *     也不给画师"拖了没反应"的假手感，更不发半成品请求。 */
const listMovable = computed(
  () => props.reorderable && formalOrders.value.length > 1 && formalOrders.value.every(canReorderRow)
)

/** 单行能否拖：整段闸 + 行闸。缓冲区行永远走不到这儿（它不在 formalOrders 里） */
function rowMovable(o: SchedOrder): boolean {
  return listMovable.value && canReorderRow(o)
}

const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

function clearDrag(): void {
  dragIndex.value = null
  overIndex.value = null
}

/** 落点线是否画在第 i 行：拖到自己头上不画（那是一次不动） */
function isOver(index: number): boolean {
  return dragIndex.value !== null && overIndex.value === index && dragIndex.value !== index
}

function onDragStart(index: number, o: SchedOrder, e: DragEvent): void {
  if (!rowMovable(o)) return
  dragIndex.value = index
  overIndex.value = null
  // 8/25 实测坑：WebView2 下不 setData / 不标 effectAllowed 就起不了拖（光有 draggable="true" 拖不动）。
  // 串里放 id 只为内核认账，落点一律用 dragover 记的下标，不回头读这个串。
  const dt = e.dataTransfer
  if (dt) {
    dt.effectAllowed = 'move'
    try { dt.setData('text/plain', String(o.id)) } catch { /* 受限内核不认就算了，不因此打断拖拽 */ }
  }
}

function onDragOver(index: number, o: SchedOrder, e: DragEvent): void {
  if (!rowMovable(o) || dragIndex.value === null) return
  // dragover 默认是"这儿不许放"，不 preventDefault 浏览器根本不会给 drop 事件
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (overIndex.value !== index) overIndex.value = index
}

function onDrop(index: number, o: SchedOrder, e: DragEvent): void {
  if (!rowMovable(o) || dragIndex.value === null) { clearDrag(); return }
  e.preventDefault()
  e.stopPropagation() // 落点已被这行接管，别再往区容器冒（一次 drop 只写一遍）
  emitReorder(dragIndex.value, index)
  clearDrag()
}

function onDragEnd(): void {
  clearDrag()
}

/** 键盘等价路径：Alt + ↑/↓ 把带焦点那行上移/下移一格，与鼠标共用 emitReorder 这一条腿。
 *  为什么选 Alt 不选 Shift：Shift+↑/↓ 在长列表里是"选区/滚动"的既有习惯（本页可滚动），
 *  组合键让给 Alt，方向键本身留给正常翻行；两端都不越界时靠 emitReorder 自己吞掉。 */
function onRowKeydown(index: number, o: SchedOrder, e: KeyboardEvent): void {
  if (!rowMovable(o) || !e.altKey || e.ctrlKey || e.metaKey) return
  if (e.key === 'ArrowUp') {
    e.preventDefault() // 拦住，否则按 Alt+↑ 会顺手滚页
    emitReorder(index, index - 1)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    emitReorder(index, index + 1)
  }
}

/** 唯一的出口（鼠标 drop 与键盘改序都走这儿）：先算新序，再一起 emit 三个字段，
 *  保证 oldIndex/newIndex 与 orderedIds 出自同一次 reorderIds()，不会各算各的打架。
 *  序没变（首行 Alt+↑、末行 Alt+↓、拖回自己头上）直接吞掉——不发白写的请求，也不弹假反馈。 */
function emitReorder(oldIndex: number, newIndex: number): void {
  const ids = formalIds.value
  const orderedIds = reorderIds(ids, oldIndex, newIndex)
  const unchanged =
    orderedIds.length === ids.length && orderedIds.every((id, i) => id === ids[i])
  if (unchanged) return
  emit('reorder', { orderedIds, oldIndex, newIndex })
}

/** 读屏口径：位置 + 是谁那一单 + 截稿 + 怎么用键盘改序（不可拖的行不说按键，免骗人） */
function rowAria(o: SchedOrder, pos: number, movable: boolean): string {
  const due = o.deadline ? `截稿 ${o.deadline}` : '未排期'
  const base = `第 ${pos + 1} 位，${o.who}·${o.what}，${due}`
  return movable ? `${base}，按住 Alt 加上下方向键改顺序` : base
}
</script>

<template>
  <div class="list-pane">
    <!-- 正式区（有货才渲染）-->
    <div v-if="formalOrders.length > 0" class="list-zone">
      <div class="zh">
        正式区
        <span class="cnt">
          {{ formalActive }} 笔在途<template v-if="slotText"> · {{ slotText }}</template>
        </span>
      </div>
      <!-- 整行 draggable：不加 grip 列（版式理由见 style 段注释）-->
      <div
        v-for="(o, i) in formalOrders"
        :key="o.key"
        class="q-item"
        :class="{ 'q-item--movable': rowMovable(o), 'q-item--dragging': dragIndex === i, 'q-item--over': isOver(i) }"
        :draggable="rowMovable(o) ? 'true' : 'false'"
        :tabindex="rowMovable(o) ? 0 : undefined"
        :aria-label="rowAria(o, i, rowMovable(o))"
        @dragstart="onDragStart(i, o, $event)"
        @dragover="onDragOver(i, o, $event)"
        @drop="onDrop(i, o, $event)"
        @dragend="onDragEnd"
        @keydown="onRowKeydown(i, o, $event)"
      >
        <span class="dot" :class="dotClass(o)" />
        <span class="q-who"><strong>{{ o.who }}</strong> · {{ o.what }}</span>
        <span class="q-st" :class="statusTone(o.status)">{{ statusLabel(o.status) }}</span>
        <span class="q-due" :class="dueInfo(o).cls">{{ dueInfo(o).text }}</span>
      </div>
    </div>

    <!-- 缓冲区（有货才渲染）：候补位不参与拖排——后端只认正式区那一段，混进来就是坏序列 -->
    <div v-if="bufferOrders.length > 0" class="list-zone">
      <div class="zh">
        缓冲区
        <span class="cnt">{{ bufferActive }} 笔候补</span>
      </div>
      <div
        v-for="(o, i) in bufferOrders"
        :key="o.key"
        class="q-item"
        draggable="false"
        :aria-label="rowAria(o, i, false)"
      >
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

/* 只读期就是这四列（无 grip 列）＝ dot + who + status + due，波2 照旧一列不加：
   这套列宽与行高（--row）是 827/828 批「单行铁律」用户终验过的，加一列等于把已验收的版式推翻。
   position: relative 只为 ⠿ 与落点线提供定位参照，网格本身零变化；
   --q-pad-x 把行内衬收成一处，⠿ 与 padding 共用同一个值，不会各写各的漂移。 */
.q-item {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto auto;
  align-items: center; gap: 10px;
  position: relative;
  --q-pad-x: 10px;
  height: var(--row, 52px); padding: 0 var(--q-pad-x);
  border-radius: var(--r-s-hand);
  border-bottom: 1px solid rgba(var(--ink-rgb), .08);
  transition: background var(--dur-fast) var(--ease-out);
}
.q-item:hover { background: rgba(var(--ink-rgb), .045); }

/* ── 拖拽可供性：⠿ 绝对定位压在那块 14px 点色列上（零布局位移的唯一做法）──
   默认 opacity:0 不露脸，hover / 键盘聚焦 / 拖中才显形；同时把原来的墨点降到 .35 让位——
   两套共用同一块 14px，谁都不挤谁。墨点与点位只吃 opacity，hover 不位移、不循环动画。 */
.q-item--movable { cursor: grab; }
.q-item--movable::before {
  content: '⠿';
  position: absolute; left: var(--q-pad-x); top: 50%;
  width: 14px;                       /* ＝ grid 第一列（点色列）宽度，不另开列 */
  transform: translateY(-50%);
  font-size: 13px; line-height: 1; text-align: center;
  color: var(--ink4); opacity: 0; pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.q-item--movable:hover::before,
.q-item--movable:focus-visible::before,
.q-item--movable.q-item--dragging::before { opacity: 1; }
.q-item--movable:hover .dot,
.q-item--movable:focus-visible .dot,
.q-item--movable.q-item--dragging .dot { opacity: .35; }
/* 键盘路径可见：焦点环走既有花青口径（与 TitleBar 控件同款） */
.q-item--movable:focus-visible { outline: 2px solid var(--hq); outline-offset: -2px; }

/* 拖中本行半透、光标 grabbing；落点行顶部一条花青细线＝"这单要排到这条线上"
   （用 ::after 绝对定位画，不用 border，免得把行高顶开一像素）*/
.q-item--dragging { opacity: .45; cursor: grabbing; }
.q-item--over::after {
  content: '';
  position: absolute; left: var(--q-pad-x); right: var(--q-pad-x); top: 0;
  height: 2px; background: var(--hq); border-radius: var(--r-pill);
}

.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; transition: opacity var(--dur-fast) var(--ease-out); }
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
