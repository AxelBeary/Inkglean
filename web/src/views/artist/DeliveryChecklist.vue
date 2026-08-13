<template>
  <div class="checklist-page">
    <h2 class="od-page-title">{{ $t('deliveryChecklist.title') }}</h2>
    <p class="page-sub">{{ $t('deliveryChecklist.subtitle') }}</p>

    <section class="cl-card">
      <header class="cl-head">
        <span class="cl-progress">
          {{ $t('deliveryChecklist.progress', { done: doneCount, total: totalCount }) }}
        </span>
        <div class="cl-bar" role="progressbar" :aria-valuenow="doneCount" :aria-valuemax="totalCount">
          <div class="cl-bar-fill" :style="{ width: percent + '%' }"></div>
        </div>
      </header>

      <p v-if="allDone" class="cl-done">{{ $t('deliveryChecklist.allDone') }}</p>

      <ul class="cl-list">
        <li v-for="item in items" :key="item.id" class="cl-item" :class="{ 'cl-item--done': item.done }">
          <label class="cl-check">
            <input
              type="checkbox" class="cl-checkbox"
              :checked="item.done" @change="toggle(item, $event)"
            />
            <span class="cl-text">{{ itemText(item) }}</span>
          </label>
          <button
            v-if="item.kind === 'custom'" type="button" class="cl-mini-btn"
            :aria-label="$t('deliveryChecklist.remove')" @click="removeItem(item.id)"
          >
            {{ $t('deliveryChecklist.remove') }}
          </button>
        </li>
      </ul>

      <div class="cl-add">
        <input
          v-model="newText" type="text" class="cl-input"
          :placeholder="$t('deliveryChecklist.addPlaceholder')" maxlength="80"
          @keyup.enter="addItem"
        />
        <button type="button" class="cl-btn" :disabled="!newText.trim()" @click="addItem">
          {{ $t('deliveryChecklist.add') }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { safeGetItem, safeSetItem } from '../../utils/storage.js'

const { t } = useI18n()

const STORAGE_KEY = 'huiyue_delivery_checklist'
const DEFAULT_KEYS = ['finishWatermark', 'sourceExport', 'signatureConfirmed', 'finalPayment', 'deliveryScript']

// 默认自查项固定（kind=default，文案走 i18n），自定义项可增删（kind=custom）
const defaults = reactive({})
DEFAULT_KEYS.forEach((key) => {
  defaults[key] = false
})
const customs = ref([])
const newText = ref('')

const items = computed(() => [
  ...DEFAULT_KEYS.map((key) => ({ id: 'default-' + key, kind: 'default', key, done: !!defaults[key] })),
  ...customs.value
])

const totalCount = computed(() => items.value.length)
const doneCount = computed(() => items.value.filter((item) => item.done).length)
const percent = computed(() => (totalCount.value === 0 ? 0 : Math.round((doneCount.value / totalCount.value) * 100)))
const allDone = computed(() => totalCount.value > 0 && doneCount.value === totalCount.value)

function itemText(item) {
  return item.kind === 'default' ? t('deliveryChecklist.defaults.' + item.key) : item.text
}

function toggle(item, e) {
  const done = e.target.checked
  if (item.kind === 'default') {
    defaults[item.key] = done
  } else {
    const target = customs.value.find((c) => c.id === item.id)
    if (target) target.done = done
  }
}

// ─── localStorage 持久化（G-5: safe 封装静默降级；损坏 JSON 丢弃） ───
function loadState() {
  const raw = safeGetItem(STORAGE_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      if (parsed.defaults && typeof parsed.defaults === 'object') {
        DEFAULT_KEYS.forEach((key) => {
          if (typeof parsed.defaults[key] === 'boolean') defaults[key] = parsed.defaults[key]
        })
      }
      if (Array.isArray(parsed.customs)) {
        customs.value = parsed.customs
          .filter((c) => c && typeof c.text === 'string')
          .map((c) => ({
            id: typeof c.id === 'string' ? c.id : 'custom-' + Date.now(),
            kind: 'custom',
            text: c.text.slice(0, 80),
            done: !!c.done
          }))
      }
    }
  } catch {
    // 损坏 JSON 丢弃，按默认清单继续
  }
}

function saveState() {
  const state = {
    defaults: Object.fromEntries(DEFAULT_KEYS.map((key) => [key, !!defaults[key]])),
    customs: customs.value.map((c) => ({ id: c.id, text: c.text, done: c.done }))
  }
  safeSetItem(STORAGE_KEY, JSON.stringify(state))
}

watch([defaults, customs], saveState, { deep: true })

function addItem() {
  const text = newText.value.trim()
  if (!text) return
  customs.value.push({
    id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    kind: 'custom',
    text,
    done: false
  })
  newText.value = ''
}

function removeItem(id) {
  customs.value = customs.value.filter((c) => c.id !== id)
}

onMounted(loadState)
</script>

<style scoped>
/* 纸墨 token 体系（--paper/--ink/--hq/--sl/--card/--line），亮暗双主题自动适配 */
.checklist-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }

.cl-card {
  margin-top: 20px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  box-shadow: var(--sh-1);
}

.cl-head { display: flex; align-items: center; gap: 12px; }
.cl-progress { flex: none; font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink2); font-variant-numeric: tabular-nums; }
.cl-bar {
  flex: 1;
  height: 8px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  overflow: hidden;
}
.cl-bar-fill {
  height: 100%;
  background: var(--sl);
  border-radius: var(--r-pill);
  transition: width var(--dur-mid) ease-out;
}

.cl-done {
  margin: 12px 0 0;
  padding: 8px 12px;
  background: var(--sl-t);
  border: 1px solid var(--sl);
  border-radius: var(--r-m);
  color: var(--sl);
  font-size: calc(var(--font-scale, 1) * 14px);
  font-weight: 600;
}

.cl-list { margin: 16px 0 0; padding: 0; list-style: none; }
.cl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 4px;
}
.cl-item + .cl-item { border-top: 1px dashed var(--line2); }
.cl-check { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; cursor: pointer; }
.cl-checkbox { width: 16px; height: 16px; flex: none; accent-color: var(--hq); cursor: pointer; }
.cl-text {
  font-size: calc(var(--font-scale, 1) * 14px);
  color: var(--ink);
  overflow-wrap: anywhere;
  transition: color var(--dur-fast);
}
.cl-item--done .cl-text { color: var(--ink3); text-decoration: line-through; }

.cl-mini-btn {
  flex: none;
  padding: 4px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper2);
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 12px);
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast) ease-out;
}
.cl-mini-btn:hover { border-color: var(--zs); color: var(--zs); }
.cl-mini-btn:active { transform: scale(0.98); }

.cl-add { display: flex; gap: 8px; margin-top: 16px; }
.cl-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper2);
  color: var(--ink);
  font-size: calc(var(--font-scale, 1) * 14px);
  transition: border-color var(--dur-fast);
}
.cl-input:focus { border-color: var(--hq); outline: none; }
.cl-btn {
  flex: none;
  padding: 8px 16px;
  border: 1px solid var(--hq);
  border-radius: var(--r-m);
  background: var(--hq);
  color: #fff;
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: background-color var(--dur-fast), transform var(--dur-fast) ease-out;
}
.cl-btn:hover:not(:disabled) { background: var(--hq-d); border-color: var(--hq-d); }
.cl-btn:active:not(:disabled) { transform: scale(0.98); }
.cl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
