<template>
  <div class="revision-page">
    <h2 class="od-page-title">{{ $t('revisionCount.title') }}</h2>
    <p class="page-sub">{{ $t('revisionCount.subtitle') }}</p>

    <div class="rc-panel">
      <!-- 新增条目：名称 + 上限（默认 3，可逐条改） -->
      <div class="rc-add-row">
        <el-input
          v-model="newName"
          :placeholder="$t('revisionCount.namePlaceholder')"
          maxlength="60"
          class="rc-name-input"
          @keyup.enter="addEntry"
        />
        <el-input-number v-model="newLimit" :min="1" :max="99" :aria-label="$t('revisionCount.limitLabel')" class="rc-limit-input" />
        <el-button type="primary" :disabled="!newName.trim()" @click="addEntry">{{ $t('revisionCount.add') }}</el-button>
      </div>
      <p class="rc-hint">{{ $t('revisionCount.addHint') }}</p>

      <div v-if="entries.length === 0" class="rc-empty">{{ $t('revisionCount.empty') }}</div>
      <div v-else class="rc-list">
        <div v-for="e in entries" :key="e.id" class="rc-card" :class="{ 'rc-card--over': isOver(e) }">
          <div class="rc-card-head">
            <span class="rc-card-name">{{ e.name }}</span>
            <span class="rc-card-limit">{{ $t('revisionCount.limitLabel') }} {{ e.limit }}{{ $t('revisionCount.countUnit') }}</span>
            <el-input-number v-model="e.limit" :min="1" :max="99" size="small" class="rc-limit-edit" @change="saveEntries" />
            <button type="button" class="rc-mini-btn" :aria-label="$t('revisionCount.delete')" @click="removeEntry(e.id)">
              {{ $t('revisionCount.delete') }}
            </button>
          </div>
          <div class="rc-card-body">
            <div class="rc-count" :class="{ 'rc-count--over': isOver(e) }">
              {{ e.count }}<span class="rc-count-unit">{{ $t('revisionCount.countUnit') }}</span>
            </div>
            <div class="rc-buttons">
              <el-button type="primary" size="large" class="rc-plus" @click="increment(e)">{{ $t('revisionCount.plus') }}</el-button>
              <div class="rc-small-actions">
                <button type="button" class="rc-mini-btn" :disabled="!canUndo(e)" @click="undo(e)">{{ $t('revisionCount.undo') }}</button>
                <button type="button" class="rc-mini-btn" :disabled="e.count === 0" @click="resetEntry(e)">{{ $t('revisionCount.reset') }}</button>
              </div>
            </div>
          </div>
          <p v-if="isOver(e)" class="rc-over-hint">{{ $t('revisionCount.overLimit') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { safeGetItem, safeSetItem } from '../../utils/storage.js'

/** 键名带 huiyue_ 前缀防冲突（对齐 huiyue_quick_notes 等既有惯例） */
const STORAGE_KEY = 'huiyue_revision_counters'
const DEFAULT_LIMIT = 3

const newName = ref('')
const newLimit = ref(DEFAULT_LIMIT)
const entries = ref([])

/** 安全读取（G-5: safeGetItem 静默降级；损坏 JSON 丢弃） */
function loadEntries() {
  const raw = safeGetItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e) => e && typeof e.name === 'string' && e.name.trim())
      .map((e) => ({
        id: e.id,
        name: e.name,
        count: Number.isFinite(Number(e.count)) ? Number(e.count) : 0,
        limit: Number.isFinite(Number(e.limit)) && Number(e.limit) >= 1 ? Number(e.limit) : DEFAULT_LIMIT,
        // null/undefined 表示无撤销记录；注意 Number(null)=0，不能把 null 误判为可撤销
        prevCount: e.prevCount === null || e.prevCount === undefined
          ? null
          : (Number.isFinite(Number(e.prevCount)) ? Number(e.prevCount) : null)
      }))
  } catch {
    return []
  }
}

function saveEntries() {
  safeSetItem(STORAGE_KEY, JSON.stringify(entries.value))
}

function addEntry() {
  const name = newName.value.trim()
  if (!name) return
  entries.value.push({
    id: Date.now() + Math.random(),
    name,
    count: 0,
    limit: newLimit.value,
    prevCount: null
  })
  newName.value = ''
  saveEntries()
}

function removeEntry(id) {
  entries.value = entries.value.filter((e) => e.id !== id)
  saveEntries()
}

function isOver(e) {
  return e.count >= e.limit
}

function canUndo(e) {
  return e.prevCount !== null
}

/** +1：记住旧值供撤销一次 */
function increment(e) {
  e.prevCount = e.count
  e.count += 1
  saveEntries()
}

function undo(e) {
  if (!canUndo(e)) return
  e.count = e.prevCount
  e.prevCount = null
  saveEntries()
}

function resetEntry(e) {
  e.count = 0
  e.prevCount = null
  saveEntries()
}

onMounted(() => {
  entries.value = loadEntries()
})
</script>

<style scoped>
/* 纸墨 token（--card/--line/--ink/--zs），亮暗双主题自动适配 */
.revision-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; color: var(--ink3); font-size: 13px; }

.rc-panel {
  margin-top: 20px;
  padding: 20px 24px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.rc-add-row { display: flex; align-items: center; gap: 12px; }
.rc-name-input { flex: 1; }
.rc-limit-input { width: 120px; flex: none; }
.rc-hint { margin: 8px 0 0; font-size: 12px; color: var(--ink3); }

.rc-empty {
  margin-top: 20px;
  padding: 28px;
  text-align: center;
  color: var(--ink3);
  border: 1px dashed var(--line);
  border-radius: var(--r-m);
}

.rc-list { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
.rc-card {
  padding: 16px 20px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}
.rc-card--over { border-color: var(--zs); box-shadow: var(--sh-1); }

.rc-card-head { display: flex; align-items: center; gap: 12px; }
.rc-card-name { flex: 1; font-size: 15px; font-weight: 600; color: var(--ink); }
.rc-card-limit { font-size: 12px; color: var(--ink3); }
.rc-limit-edit { width: 88px; flex: none; }

.rc-card-body { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 16px; }
.rc-count { font-size: 40px; font-weight: 700; line-height: 1; color: var(--ink); }
.rc-count-unit { margin-left: 4px; font-size: 13px; font-weight: 400; color: var(--ink3); }
.rc-count--over { color: var(--zs); }

.rc-buttons { display: flex; align-items: center; gap: 16px; }
.rc-plus { min-width: 96px; }
.rc-small-actions { display: flex; gap: 8px; }
.rc-mini-btn {
  padding: 8px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper);
  color: var(--ink2);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.35s, transform 0.15s ease-out;
}
.rc-mini-btn:hover:not(:disabled) { border-color: var(--hq); color: var(--hq); }
.rc-mini-btn:active:not(:disabled) { transform: scale(0.98); }
.rc-mini-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.rc-over-hint { margin: 12px 0 0; font-size: 12px; color: var(--zs); }
</style>
