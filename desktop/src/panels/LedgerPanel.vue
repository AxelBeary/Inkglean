<script setup lang="ts">
// ledger 板块「本地记账」（本地核心环波1 · F2 + 波3 · F1）：本地模式卷心主角，替掉今日要办的空态。
// REQ-014 §F2：客户名/委托内容/价格/截稿日/状态，纯本地不联网；状态单向手动推进。
// REQ-014 §F1：每笔可挂工程文件（只记路径不搬迁），行内展开文件区：调起/丢失重指/解除。
// 数据走 stores/localLedger + stores/localFiles（SQLite）；本组件只管呈现，不碰持久化细节。
// 单行铁律（826 终验教训）：客户/内容/截稿/文件名一律 nowrap 截断，防窄列 CJK 竖叠。
import { computed, onMounted, reactive, ref } from 'vue'
import { useLocalLedgerStore, STATUS_LABEL, nextStatus } from '../stores/localLedger'
import type { LocalOrder } from '../stores/localLedger'
import { useLocalFilesStore } from '../stores/localFiles'
import type { LocalFile } from '../stores/localFiles'
import { openWithSystem, isDesktop } from '../bridge'

const ledger = useLocalLedgerStore()
const filesStore = useLocalFilesStore()

onMounted(() => {
  if (!ledger.loaded) void ledger.loadAll()
  if (!filesStore.loaded) void filesStore.loadAll()
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

// ─── 文件区（F1）：行内展开，只记路径不搬迁 ───
const expandedId = ref<number | null>(null)

function toggleFiles(o: LocalOrder) {
  expandedId.value = expandedId.value === o.id ? null : o.id
}

/** 挂文件：系统多选对话框，路径交 store 落库 */
async function pickFiles(o: LocalOrder) {
  if (!isDesktop()) return
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ multiple: true, title: '选择要挂到这笔委托的文件' })
    const paths = Array.isArray(picked) ? picked.filter((p): p is string => typeof p === 'string') : []
    if (paths.length) await filesStore.addFiles(o.id, paths)
  } catch {
    // 取消/失败静默，界面态不变
  }
}

/** 调起系统关联程序打开工程文件（丢失的不调，诚实提示） */
async function openFile(f: LocalFile): Promise<void> {
  if (filesStore.missing.has(f.id)) return
  try {
    await openWithSystem(f.file_path)
  } catch {
    // 调起失败静默：下次面板重开存在性校验会自愉
  }
}

/** 丢失补救：重新指路（单选对话框） */
async function repoint(f: LocalFile) {
  if (!isDesktop()) return
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ multiple: false, title: `重新指路：${f.file_name}` })
    if (typeof picked === 'string' && picked) await filesStore.repointFile(f.id, picked)
  } catch {
    // 取消/失败静默
  }
}

/** 解除关联：只删记录，磁盘文件保持原样（F1 铁律） */
function unhook(f: LocalFile) {
  void filesStore.removeFile(f.id)
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

    <!-- 账目行：一单一行纸签；展开后跟一块文件区（F1） -->
    <div v-else class="rows">
      <template v-for="o in ledger.orders" :key="o.id">
        <div class="row" :class="{ done: o.status === 'paid' }">
          <span class="who" :title="o.client_name">{{ o.client_name }}</span>
          <span class="ttl" :title="o.title">{{ o.title || '约稿' }}</span>
          <span class="dl" :class="deadlineText(o).cls" v-if="deadlineText(o).text">{{ deadlineText(o).text }}</span>
          <span class="price num">{{ fmtPrice(o.price) }}</span>
          <span class="st" :class="`st--${o.status}`">{{ STATUS_LABEL[o.status] }}</span>
          <button
            type="button"
            class="files-tag"
            :class="{ 'files-tag--on': expandedId === o.id, 'files-tag--lost': (filesStore.files[o.id] ?? []).some(f => filesStore.missing.has(f.id)) }"
            :title="filesStore.countFor(o.id) > 0 ? '展开/收起文件' : '挂工程文件'"
            @click="toggleFiles(o)"
          >
            {{ filesStore.countFor(o.id) > 0 ? `文件 ${filesStore.countFor(o.id)}` : '挂文件' }}
          </button>
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

        <!-- 文件区：只记路径不搬迁；丢失标深朱可重指路 -->
        <div v-if="expandedId === o.id" class="files-box">
          <p v-if="(filesStore.files[o.id] ?? []).length === 0" class="files-empty">
            还没挂文件——选工程文件（CSP/PSD/PNG 等），拾绘只记位置，不动文件本体
          </p>
          <div v-for="f in filesStore.files[o.id] ?? []" :key="f.id" class="frow" :class="{ lost: filesStore.missing.has(f.id) }">
            <span class="fname" :title="f.file_path">{{ f.file_name }}</span>
            <span v-if="filesStore.missing.has(f.id)" class="flost">找不到了</span>
            <button v-if="!filesStore.missing.has(f.id)" type="button" class="fact" @click="openFile(f)">打开</button>
            <button v-else type="button" class="fact" @click="repoint(f)">重新指路</button>
            <button type="button" class="fact fact--dim" title="仅解除关联，不删文件" @click="unhook(f)">解除</button>
          </div>
          <button type="button" class="fadd" @click="pickFiles(o)">＋ 挂文件</button>
        </div>
      </template>
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

/* 文件区（F1）：账目行下的展开块，纸签行列文件 */
.files-tag {
  font-size: 11px; flex: none; padding: 2px 8px; white-space: nowrap;
  border: 1px dashed var(--line2); border-radius: var(--r-s-hand); color: var(--ink4);
  transition: color var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.files-tag:hover { color: var(--hq-d); border-color: var(--hq); }
.files-tag--on { border-style: solid; color: var(--hq-d); border-color: var(--hq); background: var(--hq-t); }
.files-tag--lost { color: var(--zs-d); border-color: var(--zs-t); }
.files-box {
  margin: -2px 0 6px; padding: 8px 12px 10px;
  background: var(--paper2); border: 1px solid rgba(38, 37, 32, .06); border-radius: 4px 6px 5px 7px;
}
.files-empty { font-size: 12px; color: var(--ink4); font-family: var(--f-d); margin: 2px 0 6px; }
.frow {
  display: flex; align-items: center; gap: 10px; height: 32px; min-width: 0;
}
.frow + .frow { border-top: 1px solid rgba(38, 37, 32, .06); }
.fname {
  font-size: 12.5px; color: var(--ink2); flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.frow.lost .fname { color: var(--ink4); text-decoration: line-through; }
.flost { font-size: 11px; color: var(--zs-d); flex: none; white-space: nowrap; }
.fact {
  font-size: 11.5px; color: var(--ink3); padding: 2px 10px; flex: none; white-space: nowrap;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.fact:hover { color: var(--hq-d); border-color: var(--hq); background: var(--hq-t); }
.fact--dim { color: var(--ink4); }
.fact--dim:hover { color: var(--zs-d); border-color: var(--zs-t); background: var(--zs-t); }
.fadd {
  margin-top: 6px; font-size: 11.5px; color: var(--ink3); padding: 3px 10px;
  border: 1px dashed var(--line2); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.fadd:hover { color: var(--ink); border-color: var(--ink4); }
</style>
