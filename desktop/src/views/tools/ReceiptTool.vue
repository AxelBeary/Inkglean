<script setup lang="ts">
// 小票打印机·桌面宿主壳（工具箱波2 · F4）：@inkglean/shared ReceiptPrinter 哑组件的桌面接线。
// 宿主能力全走 tools/host：zh 词典注入 / 草稿 localStorage（与 web 同键 huiyue_receipt_draft）/
// 剪贴板 / 系统保存对话框导 PNG / 内联纸签 toast。
import { useRouter } from 'vue-router'
import { ReceiptPrinter as ReceiptPrinterCore } from '@inkglean/shared'
import type { ReceiptDraft } from '@inkglean/shared'
import { zhT } from '../../tools/i18n-zh'
import { copyText, savePng, readDraft, writeDraft, useToolToast, useToolT } from '../../tools/host'

const router = useRouter()
const toast = useToolToast()
const toolT = useToolT()

const STORAGE_KEY = 'huiyue_receipt_draft'
const initialDraft = readDraft<ReceiptDraft>(STORAGE_KEY)

function goHome() { void router.push({ name: 'home' }) }

function onDraftChange(draft: ReceiptDraft) {
  writeDraft(STORAGE_KEY, draft)
}

async function onCopyText({ text }: { text: string }) {
  if (await copyText(text)) toast.show(zhT('receipt.copied'))
  else toast.show(zhT('receipt.copyFailed'), 'err')
}

function onNotify({ text }: { kind: string; text: string }) {
  toast.show(text)
}

async function onExportPng({ blob, filename }: { blob: Blob; filename: string }) {
  const r = await savePng(blob, filename)
  if (r === 'saved') toast.show('已保存')
  else if (r === 'failed') toast.show(zhT('receipt.exportFailed'), 'err')
}
</script>

<template>
  <div class="tool-page">
    <header class="tool-bar">
      <button type="button" class="back" @click="goHome">← 回首页</button>
      <span class="badge">工具箱</span>
    </header>
    <ReceiptPrinterCore
      :t="toolT"
      locale="zh-CN"
      :initial-draft="initialDraft"
      @draft-change="onDraftChange"
      @copy-text="onCopyText"
      @notify="onNotify"
      @export-png="onExportPng"
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
