<script lang="ts">
// DSK-11 修复：把「导入我的价格」的档位聚合抽成纯函数导出，便于回归单测直接断言
// 「price=0 的草稿不进均价分母」。命名导出住普通 <script> 块（与 shared/PriceCard.vue 同款做法），
// <script setup> 内直接调用（编译后同处模块作用域）。
import type { ImportedTier } from '@inkglean/shared'
import type { LocalOrder } from '../../stores/localLedger'

/**
 * 从本地记账聚合真实档位：按 title 分组取均价，上限 12 档、名称截 24 字。
 * 统计口径（DSK-11）：剔除 `price<=0` 的账目——草稿金额留空即 0，若算进分母会系统性
 * 拉低档位报价（还标注成「N 笔均价」误导画师）。故只统计有实价的账目。
 */
export function aggregateImportTiers(orders: LocalOrder[]): ImportedTier[] {
  const byTitle = new Map<string, { sum: number; n: number }>()
  for (const o of orders) {
    const key = o.title.trim()
    if (!key) continue
    if (!(o.price > 0)) continue // 0 元/负值/NaN 一律不进均价分母（DSK-11）
    const cur = byTitle.get(key) ?? { sum: 0, n: 0 }
    cur.sum += o.price
    cur.n += 1
    byTitle.set(key, cur)
  }
  return [...byTitle.entries()].slice(0, 12).map(([name, v]) => ({
    name: name.slice(0, 24),
    priceYuan: Math.round((v.sum / v.n) * 100) / 100,
    note: `本地记账 ${v.n} 笔均价`,
    group: '本地记账'
  }))
}
</script>

<script setup lang="ts">
// 价目分享卡·桌面宿主壳（工具箱波2 · F3 约稿条）：@inkglean/shared PriceCard 哑组件的桌面接线。
// 宿主能力全走 tools/host：zh 词典注入 / 草稿 localStorage（与 web 同键口径）/ 剪贴板 /
// 系统保存对话框导 PNG / 内联纸签 toast（桌面无 ElMessage）。
// 桌面特色接线：「导入我的价格」从本地记账（F2）聚合真实档位——本地模式的真数据源；
// 作品库例图本波不接：picker-enabled=false 直接不渲染入口（哑组件预留开关，不留死按钮）。
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { PriceCard as PriceCardCore } from '@inkglean/shared'
import type { PriceCardDraft } from '@inkglean/shared'
import { zhT } from '../../tools/i18n-zh'
import { copyText, savePng, readDraft, writeDraft, useToolToast, useToolT } from '../../tools/host'
import { useLocalLedgerStore } from '../../stores/localLedger'

const router = useRouter()
const toast = useToolToast()
const toolT = useToolT()
const ledger = useLocalLedgerStore()

const STORAGE_KEY = 'huiyue_price_card_draft'
const initialDraft = readDraft<PriceCardDraft>(STORAGE_KEY)

const coreRef = ref<InstanceType<typeof PriceCardCore> | null>(null)
const importing = ref(false)

function goHome() { void router.push({ name: 'home' }) }

// ─── 哑组件事件接线 ───
function onDraftChange(draft: PriceCardDraft) {
  writeDraft(STORAGE_KEY, draft)
}

async function onCopyText({ text }: { text: string }) {
  if (await copyText(text)) toast.show(zhT('priceCard.copied'))
  else toast.show(zhT('priceCard.copyFailed'), 'err')
}

function onNotify({ text }: { kind: string; text: string }) {
  toast.show(text)
}

async function onExportPng({ blob, filename }: { blob: Blob; filename: string }) {
  const r = await savePng(blob, filename)
  if (r === 'saved') toast.show('已保存')
  else if (r === 'failed') toast.show(zhT('priceCard.exportFailed'), 'err')
  // cancelled：用户收手，不提示
}

/** 作品库例图：桌面端本波不接作品库，picker-enabled=false 已不渲染入口 */

// ─── 导入真实档位：桌面口径＝从本地记账聚合（title 去重取均价，剔除 0 元草稿） ───
async function onRequestImport({ hasContent }: { hasContent: boolean }) {
  if (importing.value) return
  if (!ledger.loaded) await ledger.loadAll()
  // DSK-11：聚合口径见 aggregateImportTiers——price<=0 的草稿不进均价分母
  const tiers = aggregateImportTiers(ledger.orders)
  if (tiers.length === 0) {
    toast.show('本地记账里还没有带金额的账目，先去记几笔', 'err')
    return
  }
  if (hasContent && !window.confirm(zhT('priceCard.importConfirm'))) return
  importing.value = true
  try {
    coreRef.value?.applyImportedTiers(tiers)
    toast.show(zhT('priceCard.importOk', { n: tiers.length }))
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="tool-page">
    <header class="tool-bar">
      <button type="button" class="back" @click="goHome">← 回首页</button>
      <span class="badge">工具箱</span>
    </header>
    <PriceCardCore
      ref="coreRef"
      :t="toolT"
      locale="zh-CN"
      :initial-draft="initialDraft"
      :picker-enabled="false"
      :artworks="null"
      :artworks-loading="false"
      :importing="importing"
      @draft-change="onDraftChange"
      @copy-text="onCopyText"
      @notify="onNotify"
      @export-png="onExportPng"
      @request-import="onRequestImport"
    />
    <transition name="toast">
      <div v-if="toast.visible.value" class="toast" :class="`toast--${toast.kind.value}`" role="status">
        {{ toast.text.value }}
      </div>
    </transition>
  </div>
</template>

<style scoped>
.tool-page { min-height: var(--app-h); background: var(--paper); padding: 18px clamp(16px, 6vw, 72px) 48px; } /* 827：--app-h 不写 100vh（字号 zoom 超窗） */
.tool-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.back {
  font-size: 12.5px; color: var(--ink3); padding: 5px 12px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.back:hover { color: var(--ink); border-color: var(--ink4); }
.badge {
  font-size: 11px; color: var(--hq-d); padding: 3px 9px;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
}
/* 纸签 toast（宿主自持，替网页端 ElMessage） */
.toast {
  position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 60;
  font-size: 12.5px; color: var(--ink2); padding: 8px 18px; white-space: nowrap;
  background: var(--card); border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  box-shadow: 0 2px 4px rgba(var(--ink-rgb), .08), 0 14px 28px -18px rgba(var(--ink-rgb), .5);
}
.toast--err { color: var(--zs-d); border-color: var(--zs-t); }
.toast-enter-active, .toast-leave-active { transition: opacity var(--dur-mid) var(--ease-out), transform var(--dur-mid) var(--ease-out); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }
</style>
