<template>
  <div class="quote-page">
    <h2 class="od-page-title">{{ $t('quote.title') }}</h2>
    <p class="page-sub">{{ $t('quote.subtitle') }}</p>

    <div class="quote-panel">
      <!-- 客户称呼 -->
      <div class="quote-field">
        <label class="quote-label" for="quote-client">{{ $t('quote.clientLabel') }}</label>
        <el-input id="quote-client" v-model="clientName" :placeholder="$t('quote.clientPlaceholder')" maxlength="50" clearable />
      </div>

      <!-- 条目列表（单模板填空：名称 + 金额，金额内部以分计） -->
      <div class="quote-field">
        <span class="quote-label">{{ $t('quote.itemsLabel') }}</span>
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

      <!-- 备注 -->
      <div class="quote-field">
        <label class="quote-label" for="quote-note">{{ $t('quote.noteLabel') }}</label>
        <el-input id="quote-note" v-model="note" type="textarea" :rows="2" :placeholder="$t('quote.notePlaceholder')" maxlength="200" />
      </div>

      <div class="quote-total-row">
        <span class="quote-total-label">{{ $t('quote.total') }}</span>
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

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { formatYuan } from '../../utils/money.js'
import { quoteTotalCents, buildQuoteText, renderQuoteCanvas } from '../../utils/quote.js'
// 波3-2: 剪贴板抽公共（clipboard 优先 + execCommand 回退，失败返回 false 不抛）
import { copyText as copyToClipboard } from '../../utils/clipboard.js'

const { t } = useI18n()

const clientName = ref('')
const note = ref('')
const items = ref([newItem()])

function newItem() {
  return { id: Date.now() + Math.random(), name: '', amountText: '', cents: 0 }
}

function addItem() {
  items.value.push(newItem())
}

function removeItem(idx) {
  items.value.splice(idx, 1)
}

/** 金额输入 → 内部整数分（非法返回 null） */
function centsOf(text) {
  const v = Number(String(text ?? '').trim())
  if (!Number.isFinite(v) || v <= 0) return null
  return Math.round(v * 100)
}

/** 有效条目 = 名称非空 + 金额合法为正 */
const validItems = computed(() =>
  items.value.map((it) => ({ ...it, cents: centsOf(it.amountText) }))
)

const hasValidItems = computed(() =>
  validItems.value.length > 0 && validItems.value.every((it) => it.name.trim() && it.cents && it.cents > 0)
)

const totalCents = computed(() => quoteTotalCents(validItems.value))
const totalText = computed(() => formatYuan(totalCents.value))

function today() {
  // b1 猎杀修复：本地日期——toISOString 是 UTC，东八区 0~8 点必差一天（报价单日期错一天）
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function canvasLabels() {
  return {
    title: t('quote.canvasTitle'),
    date: today(),
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
      items: validItems.value,
      note: note.value
    })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `quote-${today()}.png`
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
    items: validItems.value,
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
.quote-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; color: var(--ink3); font-size: 13px; }

.quote-panel {
  margin-top: 20px;
  padding: 20px 24px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.quote-field { margin-bottom: 20px; }
.quote-label { display: block; font-size: 13px; color: var(--ink2); margin-bottom: 8px; }
.quote-empty {
  padding: 16px;
  text-align: center;
  color: var(--ink3);
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
  font-size: 13px;
  cursor: pointer;
  /* K1（波2，灰沼教训）：背景随主题即时切换，不插值（hover/按压只动边框/文字/位移） */
  transition: color var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast) ease-out;
}
.quote-mini-btn:hover { border-color: var(--zs); color: var(--zs); }
.quote-mini-btn:active { transform: scale(0.98); }
.quote-add { padding: 0; margin-top: 4px; }

.quote-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.quote-total-label { font-size: 14px; color: var(--ink2); }
.quote-total-value { font-size: 22px; font-weight: 700; color: var(--zs); }
.quote-hint { margin: 0 0 12px; font-size: 12px; color: var(--zs); }
.quote-actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
