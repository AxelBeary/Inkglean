<template>
  <div class="deposit-page">
    <h2 class="od-page-title">{{ $t('deposit.title') }}</h2>
    <p class="page-sub">{{ $t('deposit.subtitle') }}</p>

    <!-- 顶部两数：待收 / 已收（formatYuan 展示，切换状态即重算） -->
    <div class="dp-summary">
      <div class="page-card dp-stat">
        <span class="dp-stat-label">{{ $t('deposit.pendingTotal') }}</span>
        <strong class="dp-stat-value">{{ formatYuan(pendingCents) }}</strong>
      </div>
      <div class="page-card dp-stat dp-stat--received">
        <span class="dp-stat-label">{{ $t('deposit.receivedTotal') }}</span>
        <strong class="dp-stat-value">{{ formatYuan(receivedCents) }}</strong>
      </div>
    </div>

    <!-- 记一笔：单名 / 金额（元→分）/ 状态 / 日期（默认今天） -->
    <form class="page-card dp-form" @submit.prevent="submit">
      <div class="dp-form-grid">
        <label class="dp-field">
          <span class="dp-label">{{ $t('deposit.nameLabel') }}</span>
          <input
            v-model="form.name" type="text" class="field dp-input"
            :placeholder="$t('deposit.namePlaceholder')" maxlength="50"
          />
        </label>
        <label class="dp-field">
          <span class="dp-label">{{ $t('deposit.amountLabel') }}</span>
          <input
            v-model.number="form.amountYuan" type="number" min="0" step="0.01" class="field dp-input"
            :placeholder="$t('deposit.amountPlaceholder')"
          />
        </label>
        <label class="dp-field">
          <span class="dp-label">{{ $t('deposit.statusLabel') }}</span>
          <span class="dp-status-toggle">
            <input
              id="dp-status" type="checkbox" class="dp-switch"
              :checked="form.status === 'received'"
              :aria-label="$t('deposit.statusReceived')"
              @change="form.status = $event.target.checked ? 'received' : 'pending'"
            />
            <label for="dp-status" class="dp-switch-label">
              {{ form.status === 'received' ? $t('deposit.statusReceived') : $t('deposit.statusPending') }}
            </label>
          </span>
        </label>
        <label class="dp-field">
          <span class="dp-label">{{ $t('deposit.dateLabel') }}</span>
          <input v-model="form.date" type="date" class="field dp-input" :aria-label="$t('deposit.dateLabel')" />
        </label>
        <div class="dp-field dp-field--action">
          <button type="submit" class="btn-primary dp-btn" :disabled="submitting">{{ $t('deposit.addBtn') }}</button>
        </div>
      </div>
    </form>

    <!-- 台账明细：状态可切换，切换即重算 -->
    <section class="page-card dp-list">
      <h3 class="dp-list-title">{{ $t('deposit.listTitle') }}</h3>
      <p v-if="items.length === 0" class="dp-empty">{{ $t('deposit.empty') }}</p>
      <div v-for="item in items" :key="item.id" class="dp-row">
        <span class="dp-row-date">{{ item.date }}</span>
        <span class="dp-row-name">{{ item.name }}</span>
        <span class="dp-row-status">
          <label class="dp-switch-label dp-switch-label--row">
            <input
              type="checkbox" class="dp-switch"
              :checked="item.status === 'received'"
              :aria-label="$t('deposit.statusReceived')"
              @change="toggleStatus(item, $event)"
            />
            <span>{{ item.status === 'received' ? $t('deposit.statusReceived') : $t('deposit.statusPending') }}</span>
          </label>
        </span>
        <span class="dp-row-amount" :class="{ 'dp-row-amount--received': item.status === 'received' }">
          {{ formatYuan(item.amountCents) }}
        </span>
        <button type="button" class="dp-mini-btn" @click="remove(item)">
          {{ $t('deposit.delete') }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatYuan, yuanToCents } from '../../utils/money.js'
import { todayStr } from '../../utils/datetime.js'
import { safeGetItem, safeSetItem } from '../../utils/storage.js'

const { t } = useI18n()

const STORAGE_KEY = 'huiyue_deposit_ledger'

const form = reactive({
  name: '',
  amountYuan: null,
  status: 'pending',
  date: todayStr()
})

const items = ref([])
// 围剿 a1-17: 记账提交在途守卫——双击/连点不得重复插入（对齐 StandaloneIncome saving）
const submitting = ref(false)

// ─── 顶部两数：待收 / 已收（分口径求和，formatYuan 展示） ───
const pendingCents = computed(() =>
  items.value.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amountCents, 0)
)
const receivedCents = computed(() =>
  items.value.filter((item) => item.status === 'received').reduce((sum, item) => sum + item.amountCents, 0)
)

// ─── localStorage 持久化（G-5: safe 封装静默降级；损坏 JSON 丢弃） ───
function loadItems() {
  const raw = safeGetItem(STORAGE_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      items.value = parsed
        .filter((item) => item && typeof item.name === 'string')
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : 'deposit-' + Date.now(),
          name: item.name.slice(0, 50),
          amountCents: Number.isInteger(item.amountCents) ? item.amountCents : Math.round(Number(item.amountCents) || 0),
          status: item.status === 'received' ? 'received' : 'pending',
          date: typeof item.date === 'string' ? item.date : ''
        }))
        .filter((item) => item.amountCents > 0)
    }
  } catch {
    // 损坏 JSON 丢弃，按空台账继续
  }
}

function saveItems() {
  safeSetItem(STORAGE_KEY, JSON.stringify(items.value))
}

function validate() {
  if (!form.name.trim()) {
    ElMessage.warning(t('deposit.nameRequired'))
    return false
  }
  if (form.amountYuan == null || form.amountYuan === '' || !Number.isFinite(form.amountYuan)) {
    ElMessage.warning(t('deposit.amountRequired'))
    return false
  }
  if (form.amountYuan <= 0) {
    ElMessage.warning(t('deposit.amountPositive'))
    return false
  }
  if (!form.date) {
    ElMessage.warning(t('deposit.dateRequired'))
    return false
  }
  return true
}

function submit() {
  if (submitting.value) return
  if (!validate()) return
  submitting.value = true
  try {
    items.value.unshift({
      id: 'deposit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: form.name.trim(),
      // 元 → 整数分（口径：整数分）
      amountCents: yuanToCents(form.amountYuan),
      status: form.status,
      date: form.date
    })
    saveItems()
    ElMessage.success(t('deposit.addSuccess'))
    form.name = ''
    form.amountYuan = null
    form.status = 'pending'
    form.date = todayStr()
  } finally {
    submitting.value = false
  }
}

function toggleStatus(item, e) {
  item.status = e.target.checked ? 'received' : 'pending'
  saveItems()
}

async function remove(item) {
  try {
    await ElMessageBox.confirm(t('deposit.deleteConfirm'), t('common.confirmDeleteTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return // 用户取消
  }
  items.value = items.value.filter((it) => it.id !== item.id)
  saveItems()
  ElMessage.success(t('deposit.deleteSuccess'))
}

onMounted(loadItems)
</script>

<style scoped>
/* 纸墨 token 体系（--paper/--ink/--hq/--sl/--card/--line），亮暗双主题自动适配 */
.deposit-page { padding: 24px; max-width: 960px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; }

.dp-summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 20px; }
.dp-stat {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dp-stat--received { border-color: var(--sl); }
.dp-stat-label { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.dp-stat-value { font-size: calc(var(--font-scale, 1) * 24px); font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.dp-stat--received .dp-stat-value { color: var(--sl); }

.dp-form {
  margin-top: 16px;
  padding: 20px;
}
.dp-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 132px 104px 156px auto;
  gap: 16px;
  align-items: end;
}
@media (max-width: 900px) {
  .dp-form-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .dp-form-grid { grid-template-columns: 1fr; }
}
.dp-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dp-field--action { justify-content: end; }
.dp-label { font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600; color: var(--ink2); }
.dp-status-toggle { display: flex; align-items: center; min-height: 36px; }
.dp-switch-label { display: inline-flex; align-items: center; gap: 8px; font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink2); cursor: pointer; }
.dp-switch { width: 16px; height: 16px; accent-color: var(--sl); cursor: pointer; }

.dp-btn {
  white-space: nowrap;
}

.dp-list {
  margin-top: 16px;
  padding: 16px 0 8px;
}
.dp-list-title { margin: 0 20px 8px; font-size: calc(var(--font-scale, 1) * 15px); font-weight: 700; color: var(--ink); }
.dp-empty { margin: 0; padding: 24px 20px; text-align: center; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }

.dp-row {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  padding: 12px 20px;
}
.dp-row + .dp-row { border-top: 1px dashed var(--line2); }
.dp-row-date { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); font-variant-numeric: tabular-nums; }
.dp-row-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.dp-row-status { display: flex; align-items: center; }
.dp-switch-label--row { white-space: nowrap; }
.dp-row-amount { font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700; color: var(--th); font-variant-numeric: tabular-nums; text-align: right; }
.dp-row-amount--received { color: var(--sl); }
.dp-mini-btn {
  padding: 4px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper2);
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 12px);
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast) ease-out;
}
.dp-mini-btn:hover { border-color: var(--zs); color: var(--zs); }
.dp-mini-btn:active { transform: scale(0.98); }

@media (max-width: 720px) {
  .dp-summary { grid-template-columns: 1fr; }
  .dp-row { grid-template-columns: minmax(0, 1fr) auto auto; }
  .dp-row-date { grid-column: 1 / -1; }
}
</style>
