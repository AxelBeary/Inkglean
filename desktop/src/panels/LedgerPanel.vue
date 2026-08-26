<script setup lang="ts">
// ledger 板块「本地记账」（本地核心环波1 · F2）：本地模式卷心主角，替掉今日要办的空态。
// REQ-014 §F2：客户名/委托内容/价格/截稿日/状态，纯本地不联网；状态单向手动推进。
// 数据走 stores/localLedger（SQLite）；本组件只管呈现，不碰持久化细节。
// 单行铁律（826 终验教训）：客户/内容/截稿一律 nowrap 截断，防窄列 CJK 竖叠。
import { computed, onMounted, reactive, ref } from 'vue'
import { useLocalLedgerStore, STATUS_LABEL, nextStatus } from '../stores/localLedger'
import type { LocalOrder } from '../stores/localLedger'

const ledger = useLocalLedgerStore()

onMounted(() => {
  if (!ledger.loaded) void ledger.loadAll()
})

// ─── 概览 ───
const meta = computed(() => {
  const n = ledger.orders.length
  if (n === 0) return '本地模式 · 数据仅存本机'
  const parts = [`${n} 笔在账`]
  if (ledger.inProgressCount > 0) parts.push(`${ledger.inProgressCount} 笔进行中`)
  if (ledger.paidThisMonth > 0) parts.push(`本月已收 ${fmtPrice(ledger.paidThisMonth)}`)
  return parts.join(' · ')
})

function fmtPrice(v: number): string {
  return `¥${v.toFixed(2).replace(/\.00$/, '')}`
}

/** 截稿距今天数（本地日期口径，与网页端排期一致取日差） */
function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  const n = new Date()
  const a = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

function deadlineText(o: LocalOrder): { text: string; cls: string } {
  const dl = daysLeft(o.deadline)
  if (dl === null) return { text: '', cls: '' }
  if (o.status === 'paid' || o.status === 'delivered') return { text: o.deadline ?? '', cls: 'dim' }
  if (dl < 0) return { text: `逾期 ${-dl} 天`, cls: 'zs-d' }
  if (dl === 0) return { text: '今天截稿', cls: 'zs' }
  if (dl === 1) return { text: '明天截稿', cls: 'zs' }
  if (dl <= 3) return { text: `剩 ${dl} 天`, cls: 'hq' }
  return { text: `${o.deadline}`, cls: 'dim' }
}

// ─── 记一笔（内联表单，客户名为唯一必填门槛） ───
const formOpen = ref(false)
const busy = ref(false)
const form = reactive({ client: '', title: '', price: '', deadline: '' })

function toggleForm() {
  formOpen.value = !formOpen.value
}

async function submit() {
  if (busy.value) return
  const price = form.price.trim() === '' ? 0 : Number(form.price)
  const row = await ledger.addOrder({
    client_name: form.client,
    title: form.title,
    price: Number.isFinite(price) ? price : 0,
    deadline: form.deadline || null
  })
  if (row) {
    form.client = ''
    form.title = ''
    form.price = ''
    form.deadline = ''
    formOpen.value = false
  }
}

function advanceLabel(o: LocalOrder): string {
  const next = nextStatus(o.status)
  if (!next) return STATUS_LABEL[o.status]
  return `推进 · ${STATUS_LABEL[next]}`
}
</script>

<template>
  <div class="sec-head">
    <h2>本地记账</h2>
    <span class="meta">{{ meta }}</span>
  </div>

  <!-- 数据层不可用（纯浏览器/打开失败）：一行诚实提示，不装死 -->
  <p v-if="ledger.unavailable" class="ledger-empty">本地数据层仅在桌面壳内可用</p>

  <template v-else>
    <p v-if="ledger.orders.length === 0" class="ledger-empty">
      还没有账目——点下方「记一笔」，把接到的委托记下来
    </p>

    <!-- 账目行：一单一行纸签 -->
    <div v-else class="rows">
      <div v-for="o in ledger.orders" :key="o.id" class="row" :class="{ done: o.status === 'paid' }">
        <span class="who" :title="o.client_name">{{ o.client_name }}</span>
        <span class="ttl" :title="o.title">{{ o.title || '约稿' }}</span>
        <span class="dl" :class="deadlineText(o).cls" v-if="deadlineText(o).text">{{ deadlineText(o).text }}</span>
        <span class="price num">{{ fmtPrice(o.price) }}</span>
        <span class="st" :class="`st--${o.status}`">{{ STATUS_LABEL[o.status] }}</span>
        <button
          v-if="nextStatus(o.status)"
          type="button"
          class="adv"
          :title="`标记为${STATUS_LABEL[nextStatus(o.status) ?? o.status]}`"
          @click="ledger.advanceStatus(o.id)"
        >
          {{ advanceLabel(o) }}
        </button>
      </div>
    </div>

    <!-- 记一笔：内联纸签表单 -->
    <div v-if="formOpen" class="add-form">
      <input v-model.trim="form.client" class="f f-client" type="text" placeholder="客户名（必填）" maxlength="40" aria-label="客户名" />
      <input v-model.trim="form.title" class="f f-title" type="text" placeholder="委托内容（如：头像·半身）" maxlength="60" aria-label="委托内容" />
      <input v-model.trim="form.price" class="f f-price num" type="number" min="0" step="0.01" placeholder="金额" aria-label="金额" />
      <input v-model="form.deadline" class="f f-date num" type="date" aria-label="截稿日" />
      <button type="button" class="ok" @click="submit">落账</button>
      <button type="button" class="no" @click="toggleForm">收笔</button>
    </div>
    <div class="foot">
      <button v-if="!formOpen" type="button" class="add" @click="toggleForm">＋ 记一笔</button>
      <span class="hint">数据仅存本机 · 永不上传</span>
    </div>
  </template>
</template>

<style scoped>
.sec-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.sec-head h2 { font-family: var(--f-d); font-size: 17px; font-weight: 700; letter-spacing: .08em; color: var(--ink); line-height: 1.25; }
.sec-head .meta { font-size: 12px; color: var(--ink4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ledger-empty { margin: 12px 0; font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }

/* 账目行：一单一行纸签，超长截断（单行铁律） */
.rows { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.row {
  display: flex; align-items: center; gap: 10px; height: 42px; padding: 0 12px;
  background: var(--card); border: 1px solid rgba(38, 37, 32, .06); border-radius: 5px 7px 6px 8px;
  transition: background var(--dur-fast) var(--ease-out); min-width: 0;
}
.row:hover { background: var(--paper2); }
.row.done { opacity: .62; }
.who {
  font-size: 13px; font-weight: 600; color: var(--ink2); flex: none;
  max-width: 9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ttl { font-size: 13px; color: var(--ink3); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dl { font-size: 11.5px; flex: none; white-space: nowrap; }
.dl.zs-d { color: var(--zs-d); font-weight: 600; }
.dl.zs { color: var(--zs); font-weight: 600; }
.dl.hq { color: var(--hq); }
.dl.dim { color: var(--ink4); }
.price { font-size: 13px; color: var(--ink2); flex: none; white-space: nowrap; }
.st {
  font-size: 11px; flex: none; padding: 2px 8px; border-radius: var(--r-s-hand);
  border: 1px solid var(--line); background: var(--paper2); color: var(--ink3); white-space: nowrap;
}
.st--in_progress { color: var(--hq-d); border-color: var(--hq-t2); background: var(--hq-t); }
.st--delivered { color: var(--th); border-color: var(--th-t); background: var(--th-t); }
.st--paid { color: var(--sl); border-color: var(--sl-t); background: var(--sl-t); }
.adv {
  font-size: 11.5px; color: var(--ink3); padding: 3px 10px; flex: none; white-space: nowrap;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.adv:hover { color: var(--hq-d); border-color: var(--hq); background: var(--hq-t); }

/* 记一笔：内联表单（一行四格 + 双按钮） */
.add-form {
  display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 10px 12px;
  background: var(--card); border: 1px dashed var(--line2); border-radius: 5px 7px 6px 8px;
}
.f {
  font-size: 12.5px; color: var(--ink2); padding: 6px 10px; min-width: 0;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
}
.f:focus { outline: none; border-color: var(--hq); }
.f-client { flex: none; width: 9em; }
.f-title { flex: 1; }
.f-price { flex: none; width: 6.5em; }
.f-date { flex: none; }
.ok {
  font-size: 12.5px; color: var(--hq-d); font-weight: 500; padding: 6px 14px; flex: none;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.ok:hover { color: var(--hq); background: var(--hq-t2); border-color: var(--hq); }
.no {
  font-size: 12px; color: var(--ink4); padding: 6px 10px; flex: none; border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), background var(--dur-fast);
}
.no:hover { color: var(--ink2); background: rgba(38, 37, 32, .05); }

.foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 10px; }
.add {
  font-size: 12.5px; color: var(--hq-d); font-weight: 500; padding: 5px 12px;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.add:hover { color: var(--hq); background: var(--hq-t2); border-color: var(--hq); }
.hint { font-size: 11px; color: var(--ink4); }
</style>
