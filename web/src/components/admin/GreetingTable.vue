<template>
  <div class="greeting-table">
    <!-- 作用域提示 -->
    <p class="scope-hint">
      {{ artistId ? $t('admin.greetingArtistHint') : $t('admin.greetingGlobalHint') }}
    </p>

    <!-- 添加行 -->
    <div class="add-row">
      <el-input
        v-model="newText" :placeholder="$t('admin.greetingPlaceholder')" size="small"
        @keyup.enter="addGreeting" style="flex: 1; min-width: 160px"
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
        <span class="g-col g-col--text" :class="{ 'g-col--disabled': !row.is_enabled }">{{ row.text }}</span>
        <span class="g-col g-col--slot">
          <el-tag :type="SLOT_TAG[row.time_slot] || 'info'" size="small">{{ slotLabel(row.time_slot) }}</el-tag>
        </span>
        <span class="g-col g-col--enabled">
          <el-switch
            v-model="row.is_enabled" :active-value="1" :inactive-value="0" size="small"
            @change="(val) => toggleEnabled(row, val)"
          />
        </span>
        <span class="g-col g-col--actions">
          <el-button size="small" type="danger" text :aria-label="$t('common.delete')" @click="remove(row)">✕</el-button>
        </span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  /** null = 通用库；数字 = 该画师专属库 */
  artistId: { type: [Number, null], default: null },
  /** 预览时替换 {name} 的名字 */
  previewName: { type: String, default: 'Alice' }
})

const { t } = useI18n()
const greetings = ref([])
const loading = ref(false)
const saving = ref(false)
const newText = ref('')
const newSlot = ref('any')

const SLOT_TAG = { morning: 'success', afternoon: 'warning', evening: '', night: 'info', any: 'info' }

const slots = computed(() => [
  { value: 'any', label: t('admin.slotAny') },
  { value: 'morning', label: t('admin.slotMorning') },
  { value: 'afternoon', label: t('admin.slotAfternoon') },
  { value: 'evening', label: t('admin.slotEvening') },
  { value: 'night', label: t('admin.slotNight') },
])

const slotLabel = (s) => slots.value.find(o => o.value === s)?.label || s

const previewText = computed(() => newText.value.replace(/\{name\}/g, props.previewName))

// API 分发：通用库 vs 专属库
const api = computed(() => props.artistId
  ? {
      list: () => adminApi.getArtistGreetings(props.artistId),
      create: (d) => adminApi.createArtistGreeting(props.artistId, d),
      update: (id, d) => adminApi.updateArtistGreeting(props.artistId, id, d),
      remove: (id) => adminApi.deleteArtistGreeting(props.artistId, id)
    }
  : {
      list: () => adminApi.getGreetings(),
      create: (d) => adminApi.createGreeting(d),
      update: (id, d) => adminApi.updateGreeting(id, d),
      remove: (id) => adminApi.deleteGreeting(id)
    }
)

async function load() {
  loading.value = true
  try { greetings.value = await api.value.list() }
  catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
}

async function addGreeting() {
  if (!newText.value.trim()) return
  saving.value = true
  try {
    await api.value.create({ text: newText.value.trim(), timeSlot: newSlot.value })
    newText.value = ''
    await load()
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

async function toggleEnabled(row, val) {
  try { await api.value.update(row.id, { isEnabled: !!val }) }
  catch (err) { ElMessage.error(err.message); await load() }
}

async function remove(row) {
  try { await api.value.remove(row.id); await load() }
  catch (err) { ElMessage.error(err.message) }
}

onMounted(load)
</script>

<style scoped>
.scope-hint { font-size: 12px; color: var(--ink2); margin-bottom: 12px; }
.add-row { display: flex; gap: 8px; margin-bottom: 4px; }
.preview-hint { font-size: 12px; color: var(--ink2); margin: 6px 0 10px; }

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
</style>
