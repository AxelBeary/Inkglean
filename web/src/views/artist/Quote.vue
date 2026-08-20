<template>
  <div class="quote-page">
    <h2 class="od-page-title">{{ $t('quote.title') }}</h2>
    <p class="page-sub">{{ $t('quote.subtitle') }}</p>

    <!-- 818-B：同类成组 + 一行一事（说明在左，控件在右） -->
    <div class="group">
      <div class="group-head">{{ $t('quote.groupContent') }}</div>

      <!-- 客户称呼 -->
      <div class="row">
        <div class="quote-field-text">
          <div class="lab">{{ $t('quote.clientLabel') }}</div>
          <div class="desc">{{ $t('quote.clientDesc') }}</div>
        </div>
        <el-input id="quote-client" v-model="clientName" :placeholder="$t('quote.clientPlaceholder')" maxlength="50" clearable class="quote-client-input" />
      </div>

      <!-- 条目列表（单模板填空：名称 + 金额，金额内部以分计） -->
      <div class="row">
        <div class="quote-field-text">
          <div class="lab">{{ $t('quote.itemsLabel') }}</div>
          <div class="desc">{{ $t('quote.itemsDesc') }}</div>
        </div>
        <div class="quote-items">
          <div v-if="items.length === 0" class="quote-empty">{{ $t('quote.emptyItems') }}</div>
          <div v-for="(item, idx) in items" :key="item.id" class="quote-item-row">
            <el-input v-model="item.name" :placeholder="$t('quote.itemNamePlaceholder')" maxlength="60" class="quote-item-name" />
            <el-input v-model="item.amountText" :placeholder="$t('quote.itemAmountPlaceholder')" class="quote-item-amount" />
            <button type="button" class="quote-mini-btn" :aria-label="$t('quote.removeItem')" @click="removeItem(idx)">
              {{ $t('quote.removeItem') }}
            </button>
          </div>
          <el-button text type="primary" class="quote-add" @click="addItem">＋ {{ $t('quote.addItem') }}</el-button>
        </div>
      </div>

      <!-- 备注 -->
      <div class="row">
        <div class="quote-field-text">
          <div class="lab">{{ $t('quote.noteLabel') }}</div>
          <div class="desc">{{ $t('quote.noteDesc') }}</div>
        </div>
        <el-input id="quote-note" v-model="note" type="textarea" :rows="2" :placeholder="$t('quote.notePlaceholder')" maxlength="200" class="quote-note-input" />
      </div>
    </div>

    <div class="group">
      <div class="group-head">{{ $t('quote.groupExport') }}</div>
      <div class="row">
        <div class="quote-field-text">
          <div class="lab">{{ $t('quote.total') }}</div>
          <div class="desc">{{ $t('quote.totalDesc') }}</div>
        </div>
        <span class="quote-total-value">{{ totalText }}</span>
      </div>

      <p v-if="items.length > 0 && !hasValidItems" class="quote-hint">{{ $t('quote.needItems') }}</p>
      <div class="quote-actions">
        <el-button type="primary" :disabled="!hasValidItems" @click="exportPng">{{ $t('quote.exportPng') }}</el-button>
        <el-button :disabled="!hasValidItems" @click="copyText">{{ $t('quote.copyText') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { formatYuan, yuanToCents } from '../../utils/money'
import { todayStr } from '../../utils/datetime'
import { quoteTotalCents, buildQuoteText, renderQuoteCanvas } from '../../utils/quote'
// 波3-2: 剪贴板抽公共（clipboard 优先 + execCommand 回退，失败返回 false 不抛）
import { copyText as copyToClipboard } from '../../utils/clipboard'

const { t } = useI18n()

/** 报价条目草稿（金额输入态为文本；内部整数分另计） */
interface QuoteDraftItem {
  id: number
  name: string
  amountText: string
  cents: number
}
/** utils/quote.js 纯函数接受的条目形状（金额为分） */
type QuoteItemShape = { name: string; cents: number }

const clientName = ref('')
const note = ref('')
const items = ref<QuoteDraftItem[]>([newItem()])

function newItem(): QuoteDraftItem {
  return { id: Date.now() + Math.random(), name: '', amountText: '', cents: 0 }
}

function addItem() {
  items.value.push(newItem())
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
}

/** 金额输入 → 内部整数分（非法返回 null） */
function centsOf(text: string): number | null {
  const v = Number(String(text ?? '').trim())
  if (!Number.isFinite(v) || v <= 0) return null
  return yuanToCents(v)
}

/** 有效条目 = 名称非空 + 金额合法为正 */
const validItems = computed(() =>
  items.value.map((it) => ({ ...it, cents: centsOf(it.amountText) }))
)

const hasValidItems = computed(() =>
  validItems.value.length > 0 && validItems.value.every((it) => it.name.trim() && it.cents && it.cents > 0)
)

const totalCents = computed(() => quoteTotalCents(validItems.value as QuoteItemShape[]))
const totalText = computed(() => formatYuan(totalCents.value))

function canvasLabels() {
  return {
    title: t('quote.canvasTitle'),
    date: todayStr(),
    clientLabel: t('quote.canvasClient'),
    totalLabel: t('quote.canvasTotal'),
    noteLabel: t('quote.canvasNote'),
    footer: t('quote.canvasFooter')
  }
}

function textLabels() {
  return {
    title: t('quote.canvasTitle'),
    clientLine: t('quote.clientLine'),
    totalLine: t('quote.totalLine'),
    noteLine: t('quote.noteLine'),
    footer: t('quote.canvasFooter')
  }
}

/** PNG 导出（纸墨风简版，canvas 单模板绘制） */
function exportPng() {
  if (!hasValidItems.value) return
  try {
    const canvas = document.createElement('canvas')
    renderQuoteCanvas(canvas, {
      ...canvasLabels(),
      clientName: clientName.value,
      items: validItems.value as QuoteItemShape[],
      note: note.value
    })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `quote-${todayStr()}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    ElMessage.success(t('quote.imageGenerated'))
  } catch {
    ElMessage.error(t('quote.imageFailed'))
  }
}

/** 纯文字版一键复制（公共 clipboard.copyText；成功提示 / 失败提示） */
async function copyText() {
  if (!hasValidItems.value) return
  const text = buildQuoteText({
    clientName: clientName.value,
    items: validItems.value as QuoteItemShape[],
    note: note.value,
    labels: textLabels()
  })
  if (await copyToClipboard(text)) {
    ElMessage.success(t('quote.copied'))
  } else {
    ElMessage.error(t('quote.copyFailed'))
  }
}
</script>

<style scoped>
/* 纸墨 token（--card/--line/--ink/--zs），亮暗双主题自动适配 */
/* 页宽归一批：移除页级限宽 860px，交给 ArtistLayout 内容容器统一管（--page-max-w） */
.quote-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; }

/* 818-B 三原则：分组卡片收纳，组头带朱砂小印点（对齐原型 .group-head） */
.group {
  margin-top: 16px;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}

/* 818-B 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }

.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

.quote-client-input { width: 320px; }
.quote-items { width: 460px; min-width: 0; }
.quote-empty {
  padding: 16px;
  text-align: center;
  color: var(--ink3); background: var(--paper2);
  border: 1px dashed var(--line);
  border-radius: var(--r-m);
}
.quote-item-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.quote-item-name { flex: 1; }
.quote-item-amount { width: 180px; flex: none; }
.quote-mini-btn {
  flex: none;
  padding: 8px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper);
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  /* 818-B 克制动效：过渡只动颜色/边框，按压不位移 */
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.quote-mini-btn:hover { border-color: var(--zs); color: var(--zs); }
.quote-add { padding: 0; margin-top: 4px; }
.quote-note-input { width: 360px; }

.quote-total-value { font-size: 22px; font-weight: 700; color: var(--zs); }
.quote-hint { margin: 4px 0 0; font-size: 12px; color: var(--zs); }
.quote-actions { display: flex; justify-content: flex-end; gap: 12px; padding-top: 12px; }

/* 页宽容器查询收尾批：@media 改 @container 认容器宽（.row 为页内双列字段行，非视口语义） */
@container (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .quote-client-input, .quote-note-input { width: 100%; }
  .quote-items { width: 100%; }
}
</style>
