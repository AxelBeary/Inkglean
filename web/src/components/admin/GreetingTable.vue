<template>
  <div class="greeting-table">
    <!-- 作用域提示 -->
    <p class="scope-hint">
      {{ artistId ? $t('admin.greetingArtistHint') : $t('admin.greetingGlobalHint') }}
    </p>

    <!-- 819-I：一行一事——说明在左、添加控件在右（7 档时段下拉结构不动） -->
    <div class="row add-row">
      <div class="greeting-add-text">
        <div class="lab">{{ $t('admin.greetingAddLabel') }}</div>
        <div class="desc">{{ $t('admin.greetingAddDesc') }}</div>
      </div>
      <div class="greeting-add-controls">
        <el-input
          v-model="newText" :placeholder="$t('admin.greetingPlaceholder')" size="small"
          @keyup.enter="addGreeting" class="greeting-text-input"
        />
        <el-select v-model="newSlot" size="small" style="width: 100px">
          <el-option v-for="s in slots" :key="s.value" :value="s.value" :label="s.label" />
        </el-select>
        <el-button
          type="primary" size="small" @click="addGreeting" :loading="saving"
          :disabled="!newText.trim()"
        >
          ＋ {{ $t('common.add') }}
        </el-button>
      </div>
    </div>

    <!-- 实时预览 -->
    <p class="preview-hint" v-if="newText.trim()">
      {{ $t('admin.greetingPreview') }}：{{ previewText }}
    </p>

    <!-- 列表（T 波：el-table 行由 EP 内部渲染、无法挂 Vue 过渡，改等价 CSS 网格列表 +
         TransitionGroup 行级淡出 var(--dur-mid)——删除/停用不再瞬变） -->
    <div class="greeting-table-head">
      <span class="g-col g-col--text">{{ $t('admin.greetingColText') }}</span>
      <span class="g-col g-col--slot">{{ $t('admin.greetingColSlot') }}</span>
      <span class="g-col g-col--enabled">{{ $t('admin.greetingColEnabled') }}</span>
      <span class="g-col g-col--actions">{{ $t('common.actions') }}</span>
    </div>
    <TransitionGroup tag="div" name="greeting-row" class="greeting-table-list" v-loading="loading">
      <div v-for="row in greetings" :key="row.id" class="greeting-row">
        <span class="g-col g-col--text" :class="{ 'g-col--disabled': !row.is_enabled }" :data-label="$t('admin.greetingColText')">{{ row.text }}</span>
        <span class="g-col g-col--slot" :data-label="$t('admin.greetingColSlot')">
          <el-tag :type="SLOT_TAG[row.time_slot] || 'info'" size="small">{{ slotLabel(row.time_slot) }}</el-tag>
        </span>
        <span class="g-col g-col--enabled" :data-label="$t('admin.greetingColEnabled')">
          <el-switch
            v-model="row.is_enabled" :active-value="1" :inactive-value="0" size="small"
            :loading="togglingId === row.id" :disabled="togglingId === row.id || removingId != null"
            @change="(val: number) => toggleEnabled(row, val)"
          />
        </span>
        <span class="g-col g-col--actions">
          <el-button
            size="small" type="danger" text
            :aria-label="$t('common.delete')"
            :loading="removingId === row.id" :disabled="removingId != null"
            @click="remove(row)"
          >✕</el-button>
        </span>
      </div>
    </TransitionGroup>
    <!-- b3 清扫：空列表不再只剩表头；文案键 admin.greetingEmpty 由 D 波补齐 -->
    <el-empty v-if="!loading && greetings.length === 0" :description="$t('admin.greetingEmpty')" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '../../api/index'
import type { GreetingTemplate, GreetingInput } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  /** null = 通用库；数字 = 该画师专属库 */
  artistId: { type: [Number, null], default: null },
  /** 预览时替换 {name} 的名字 */
  previewName: { type: String, default: 'Alice' }
})

const { t } = useI18n()
const greetings = ref<GreetingTemplate[]>([])
const loading = ref(false)
const saving = ref(false)
// b3 清扫：行级操作挂起 id（删除/启停期间禁用该行控件，防连续触发）
const removingId = ref<number | null>(null)
const togglingId = ref<number | null>(null)
const newText = ref('')
const newSlot = ref('any')

// 817 问候重构：7 档时段（清晨/上午/午后/下午/夜晚/深夜/全天）
const SLOT_TAG: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = { early: 'success', morning: 'success', noon: 'warning', afternoon: 'warning', evening: '', midnight: 'danger', any: 'info' }

const slots = computed(() => [
  { value: 'any', label: t('admin.slotAny') },
  { value: 'early', label: t('admin.slotEarly') },
  { value: 'morning', label: t('admin.slotMorning') },
  { value: 'noon', label: t('admin.slotNoon') },
  { value: 'afternoon', label: t('admin.slotAfternoon') },
  { value: 'evening', label: t('admin.slotEvening') },
  { value: 'midnight', label: t('admin.slotMidnight') },
])

const slotLabel = (s: string) => slots.value.find(o => o.value === s)?.label || s

const previewText = computed(() => newText.value.replace(/\{name\}/g, props.previewName))

// API 分发：通用库 vs 专属库
const api = computed(() => props.artistId
  ? {
      list: () => adminApi.getArtistGreetings(props.artistId as number),
      create: (d: GreetingInput) => adminApi.createArtistGreeting(props.artistId as number, d),
      update: (id: number, d: Partial<GreetingInput> & { isEnabled?: boolean }) => adminApi.updateArtistGreeting(props.artistId as number, id, d),
      remove: (id: number) => adminApi.deleteArtistGreeting(props.artistId as number, id)
    }
  : {
      list: () => adminApi.getGreetings(),
      create: (d: GreetingInput) => adminApi.createGreeting(d),
      update: (id: number, d: Partial<GreetingInput> & { isEnabled?: boolean }) => adminApi.updateGreeting(id, d),
      remove: (id: number) => adminApi.deleteGreeting(id)
    }
)

async function load() {
  loading.value = true
  try { greetings.value = await api.value.list() }
  catch (err) { ElMessage.error((err as Error).message) }
  finally { loading.value = false }
}

async function addGreeting() {
  if (!newText.value.trim()) return
  saving.value = true
  try {
    await api.value.create({ text: newText.value.trim(), timeSlot: newSlot.value as NonNullable<GreetingInput['timeSlot']> })
    newText.value = ''
    await load()
  } catch (err) { ElMessage.error((err as Error).message) }
  finally { saving.value = false }
}

async function toggleEnabled(row: GreetingTemplate, val: unknown) {
  if (togglingId.value === row.id) return
  togglingId.value = row.id
  try { await api.value.update(row.id, { isEnabled: !!val }) }
  catch (err) {
    ElMessage.error((err as Error).message)
    await load()
  } finally {
    togglingId.value = null
  }
}

async function remove(row: GreetingTemplate) {
  // b3 清扫：删除加确认（防误删）+ 行级 loading
  try {
    await ElMessageBox.confirm(
      t('admin.greetingDeleteConfirm'),
      t('common.confirmDeleteTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  if (removingId.value === row.id) return
  removingId.value = row.id
  try { await api.value.remove(row.id); await load() }
  catch (err) { ElMessage.error((err as Error).message) }
  finally { removingId.value = null }
}

onMounted(load)
</script>

<style scoped>
.scope-hint { font-size: 12px; color: var(--ink2); margin-bottom: 12px; }

/* 819-I：一行一事（说明在左、控件在右，对齐 QuickNote 基准） */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.greeting-add-text { min-width: 0; }
.greeting-add-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.greeting-text-input { width: 320px; flex: none; }
.add-row { margin-bottom: 4px; }
.preview-hint { font-size: 12px; color: var(--ink2); margin: 8px 0 12px; }

/* ─── T 波：el-table → 等价网格列表（列宽对齐原 small/stripe 视觉），TransitionGroup 行级淡出 ─── */
.greeting-table-head,
.greeting-row {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) 90px 70px 70px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  box-sizing: border-box;
}
.greeting-table-head {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink2);
  background: var(--paper2);
  border: 1px solid var(--line);
  border-bottom: none;
  border-radius: var(--r-m) var(--r-m) 0 0;
}
.greeting-table-list {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 0 0 var(--r-m) var(--r-m);
  overflow: hidden;
}
.greeting-row {
  background: var(--card);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink);
}
.greeting-row:nth-child(even) { background: var(--paper2); }
.greeting-row:last-child { border-bottom: none; }
.g-col--text { min-width: 0; word-break: break-word; }
/* 暂停态透明度淡入淡出（原内联 opacity 瞬变 → --dur-mid 过渡） */
.g-col--disabled { opacity: 0.4; transition: opacity var(--dur-mid); }
.g-col--actions { text-align: right; }
.greeting-row-enter-active,
.greeting-row-leave-active { transition: opacity var(--dur-mid); }
.greeting-row-enter-from,
.greeting-row-leave-to { opacity: 0; }
.greeting-row-leave-active { position: absolute; width: 100%; }

/* P1-B：≤600px 单列布局（文本行 + 操作行），操作列不再被裁；
   桌面端（≥901px）零变 */
@media (max-width: 600px) {
  .greeting-table-head { display: none; }
  .greeting-row {
    grid-template-columns: 1fr auto auto;
    gap: 8px 12px;
    padding: 12px;
    align-items: center;
  }
  .g-col--text { grid-column: 1 / -1; }
  .g-col--slot { grid-column: 1; }
  .g-col--enabled { grid-column: 2; }
  .g-col--actions { grid-column: 3; text-align: right; }
  .g-col--slot::before,
  .g-col--enabled::before {
    content: attr(data-label);
    display: block;
    font-size: 11px;
    color: var(--ink3);
    margin-bottom: 4px;
  }
  .row { grid-template-columns: 1fr; }
  .greeting-add-controls { justify-content: flex-start; }
  .greeting-text-input { width: 100%; }
}
</style>
