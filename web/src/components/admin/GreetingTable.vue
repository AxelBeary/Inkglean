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

    <!-- 列表 -->
    <el-table :data="greetings" v-loading="loading" stripe size="small">
      <el-table-column prop="text" :label="$t('admin.greetingColText')" min-width="200">
        <template #default="{ row }">
          <span :style="{ opacity: row.is_enabled ? 1 : 0.4 }">{{ row.text }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.greetingColSlot')" width="90">
        <template #default="{ row }">
          <el-tag :type="SLOT_TAG[row.time_slot] || 'info'" size="small">{{ slotLabel(row.time_slot) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.greetingColEnabled')" width="70">
        <template #default="{ row }">
          <el-switch
            v-model="row.is_enabled" :active-value="1" :inactive-value="0" size="small"
            @change="(val) => toggleEnabled(row, val)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="70" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="danger" text @click="remove(row)">✕</el-button>
        </template>
      </el-table-column>
    </el-table>
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
.scope-hint { font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; }
.add-row { display: flex; gap: 8px; margin-bottom: 4px; }
.preview-hint { font-size: 12px; color: var(--text-secondary); margin: 6px 0 10px; }
</style>
