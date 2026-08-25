<script setup lang="ts">
// orders 板块「订单速览」（方向 A 长卷·卷尾 tail 区）：订单状态 chips + 截稿倒计时。
// 数据由 Home 统一取（fetchOrders / fetchDeadlineSoon）、失败静默降级为一行提示。
// 等高纪律（fixed-rows）：chips 定行截断，不撑高卷尾；截稿倒计时可撕悬浮（deadline）。
// 本地模式：整行只留「登录同步后显示」，不调云端（双模式纪律 §4.3）。
import { computed } from 'vue'
import type { ArtistOrderItem, DeadlineSoonItem, OrderStatus } from '../api/types'
import { deadlineLevel } from '../components/home/deadline'
import TornPlaceholder from '../components/home/TornPlaceholder.vue'

const props = defineProps<{
  mode: 'cloud' | 'local'
  /** null=未取到；[]=取到但为空（服务端分页对象 {items}，Home 已取 items 下发） */
  orders: ArtistOrderItem[] | null
  deadlines: DeadlineSoonItem[] | null
  failed: boolean
  /** 截稿倒计时已撕成悬浮小窗 */
  tornDeadline: boolean
}>()

/** 速览行：状态→点色/措辞映射（与网页端订单状态口径同源） */
const STATUS_TEXT: Record<OrderStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  wip: '进行中',
  revision: '修改中',
  delivered: '待交付',
  done: '已完稿',
  cancelled: '已取消'
}
const STATUS_DOT: Record<OrderStatus, 'hq' | 'th' | 'sl' | 'buf'> = {
  pending: 'th',
  confirmed: 'th',
  wip: 'hq',
  revision: 'th',
  delivered: 'th',
  done: 'sl',
  cancelled: 'buf'
}

/** 等高纪律：卷尾一行，最多展示 5 枚订单签，多出收进「+N」 */
const MAX_CHIPS = 5
const chips = computed(() => (props.orders ?? []).slice(0, MAX_CHIPS))
const moreCount = computed(() => Math.max(0, (props.orders?.length ?? 0) - MAX_CHIPS))

function ordTitle(o: ArtistOrderItem): string {
  const name = o.client_name ?? o.order_no
  const style = o.tier_name ? ` · ${o.tier_name}` : ''
  return `${name}${style} · ${STATUS_TEXT[o.status] ?? o.status}`
}

/** 截稿倒计时最多 3 枚（按截稿日升序由数据源保证） */
const deadlineChips = computed(() => (props.deadlines ?? []).slice(0, 3))
</script>

<template>
  <span class="lbl">订单速览</span>

  <template v-if="mode === 'local'">
    <span class="tail-empty">登录同步后显示订单速览</span>
  </template>
  <template v-else-if="failed">
    <span class="tail-empty">暂时取不到订单</span>
  </template>
  <template v-else>
    <div v-if="chips.length > 0" class="orders">
      <span
        v-for="o in chips"
        :key="o.id"
        class="ord"
        :class="STATUS_DOT[o.status] ?? 'th'"
        :title="ordTitle(o)"
      >
        <i aria-hidden="true"></i>{{ o.client_name ?? o.order_no }}
        <span class="st">{{ STATUS_TEXT[o.status] ?? o.status }}</span>
      </span>
      <span v-if="moreCount > 0" class="ord ord--more" title="其余订单">+{{ moreCount }}</span>
    </div>
    <span v-else class="tail-empty">暂无在案订单</span>

    <!-- 截稿倒计时：可撕悬浮件；已撕出留淡墨占位 -->
    <TornPlaceholder v-if="tornDeadline" kind="deadline" label="截稿倒计时" class="torn-tail" />
    <div v-else-if="deadlineChips.length > 0" class="deads">
      <span
        v-for="d in deadlineChips"
        :key="d.id"
        class="dead"
        :class="deadlineLevel(d.daysLeft).cls"
        :title="`${d.clientName ?? d.orderNo} · 截稿 ${d.deadline}`"
      >{{ d.clientName ?? d.orderNo }} {{ deadlineLevel(d.daysLeft).text }}</span>
    </div>
  </template>
</template>

<style scoped>
.lbl { font-size: 12px; color: var(--ink4); letter-spacing: .1em; flex: none; white-space: nowrap; }
.tail-empty { font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }

/* 订单签（照原型 .orders/.ord 移植） */
.orders { display: flex; gap: var(--gap); flex-wrap: wrap; min-width: 0; }
.ord {
  display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink2);
  padding: 4px 8px; border-radius: var(--r-s-hand); transition: background var(--dur-fast);
  max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ord:hover { background: rgba(38, 37, 32, .05); color: var(--ink); }
.ord i { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.ord .st { font-size: 12px; color: var(--ink4); flex: none; }
.ord.hq i { background: var(--hq); }
.ord.th i { background: var(--th); }
.ord.sl i { background: var(--sl); }
.ord.buf i { background: var(--buf); }
.ord--more { color: var(--ink4); font-size: 12px; }

/* 截稿倒计时签：三色分级（deadline.ts 口径） */
.deads { display: flex; gap: var(--gap); flex-wrap: wrap; min-width: 0; }
.dead {
  font-size: 12px; padding: 4px 8px; border-radius: var(--r-s-hand);
  background: var(--paper2); white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis;
}
.dead.zs-d { color: var(--zs-d); font-weight: 600; }
.dead.zs { color: var(--zs-d); }
.dead.hq { color: var(--hq-d); }
.dead.buf { color: var(--ink4); }
.torn-tail { flex: none; }
</style>
