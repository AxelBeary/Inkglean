<template>
  <ReceiptPrinterCore
    :t="t"
    :locale="localeText"
    :initial-draft="initialDraft"
    @draft-change="onDraftChange"
    @copy-text="onCopyText"
    @notify="onNotify"
    @export-png="onExportPng"
  />
</template>

<script setup lang="ts">
// shared-824 路 B：小票打印机改写为 @inkglean/shared 哑组件的薄宿主壳——
// 渲染/表单/计算/画布全在共享组件内；宿主只保留宿主能力：
// i18n 注入（t/locale 直传）、草稿 localStorage 持久化（STORAGE_KEY 不变，老草稿兼容）、
// 剪贴板（公共 clipboard.copyText + 成败 toast）、ElMessage 提示、anchor 下载。
// 壳保持原路径原名（路由懒加载依赖），零样式（@container page 上下文由 ArtistLayout 提供）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ReceiptPrinter as ReceiptPrinterCore } from '@inkglean/shared'
import type { ReceiptDraft } from '@inkglean/shared'
import { safeGetItem, safeSetItem } from '../../utils/storage'
import { copyText as copyToClipboard } from '../../utils/clipboard'

const { t, locale } = useI18n()

// locale 字符串化：生产 useI18n 返 ref（模板自动解包），测试桩为 { value } 普通对象，统一取串后再传哑组件（prop 只收 string）
const localeText = computed(() => {
  const raw = locale as unknown as string | { value?: string } | undefined
  if (typeof raw === 'string') return raw
  return raw?.value ?? 'zh-CN'
})

const STORAGE_KEY = 'huiyue_receipt_draft'

// ─── 草稿持久化：挂载前读入（损坏 JSON 静默丢弃传 null），draft-change 回写 ───
function readDraft(): ReceiptDraft | null {
  const raw = safeGetItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw)
    return d && typeof d === 'object' ? (d as ReceiptDraft) : null
  } catch {
    return null // 损坏 JSON 丢弃，按默认草稿继续
  }
}

const initialDraft = readDraft()

function onDraftChange(draft: ReceiptDraft) {
  safeSetItem(STORAGE_KEY, JSON.stringify(draft))
}

// ─── 复制：组件只产文本，剪贴板与成败提示归宿主 ───
async function onCopyText({ text }: { text: string }) {
  if (await copyToClipboard(text)) ElMessage.success(t('receipt.copied'))
  else ElMessage.error(t('receipt.copyFailed'))
}

// ─── 提示：text 已翻好，直接落 ElMessage ───
function onNotify({ kind, text }: { kind: 'success' | 'warning' | 'error' | 'info'; text: string }) {
  ElMessage[kind](text)
}

// ─── 导出：原 anchor 下载逻辑（URL.createObjectURL + a.click + revoke） ───
function onExportPng({ blob, filename }: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>
