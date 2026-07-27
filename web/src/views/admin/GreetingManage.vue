<template>
  <div class="admin-page">
    <el-page-header @back="$router.push('/admin')" :title="$t('admin.backToPanel')" :content="$t('admin.greetingManage')" />

    <!-- 添加 -->
    <div style="display: flex; gap: 12px; margin: 16px 0; align-items: center">
      <el-input v-model="newText" :placeholder="$t('admin.greetingPlaceholder')" style="max-width: 400px"
        @keyup.enter="addGreeting" />
      <el-select v-model="newSlot" style="width: 120px">
        <el-option v-for="s in slots" :key="s.value" :value="s.value" :label="s.label" />
      </el-select>
      <el-button type="primary" @click="addGreeting" :loading="saving">{{ $t('common.add') }}</el-button>
    </div>

    <!-- 预览提示 -->
    <p class="preview-hint" v-if="newText">
      {{ $t('admin.greetingPreview') }}：{{ newText.replace(/\{name\}/g, 'Alice') }}
    </p>

    <!-- 列表 -->
    <el-table :data="greetings" v-loading="loading" stripe>
      <el-table-column prop="text" :label="$t('admin.greetingColText')" min-width="250">
        <template #default="{ row }">
          <span :style="{ opacity: row.is_enabled ? 1 : 0.4 }">{{ row.text }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.greetingColSlot')" width="120">
        <template #default="{ row }">
          <el-tag :type="slotTagType(row.time_slot)" size="small">{{ slotLabel(row.time_slot) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.greetingColEnabled')" width="80">
        <template #default="{ row }">
          <el-switch v-model="row.is_enabled" :active-value="1" :inactive-value="0"
            @change="(val) => toggleEnabled(row, val)" />
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="danger" text @click="remove(row)">{{ $t('common.remove') }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const greetings = ref([])
const loading = ref(true)
const saving = ref(false)
const newText = ref('')
const newSlot = ref('any')

const slots = computed(() => [
  { value: 'any', label: t('admin.slotAny') },
  { value: 'morning', label: t('admin.slotMorning') },
  { value: 'afternoon', label: t('admin.slotAfternoon') },
  { value: 'evening', label: t('admin.slotEvening') },
  { value: 'night', label: t('admin.slotNight') },
])

const SLOT_TAG = { morning: 'success', afternoon: 'warning', evening: '', night: 'info', any: 'info' }
const slotTagType = (s) => SLOT_TAG[s] || 'info'
const slotLabel = (s) => {
  const map = { morning: t('admin.slotMorning'), afternoon: t('admin.slotAfternoon'), evening: t('admin.slotEvening'), night: t('admin.slotNight'), any: t('admin.slotAny') }
  return map[s] || s
}

async function load() {
  loading.value = true
  try { greetings.value = await adminApi.getGreetings() }
  catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
}

async function addGreeting() {
  if (!newText.value.trim()) return ElMessage.warning(t('admin.greetingEmpty'))
  saving.value = true
  try {
    await adminApi.createGreeting({ text: newText.value.trim(), timeSlot: newSlot.value })
    ElMessage.success(t('common.added'))
    newText.value = ''
    await load()
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

async function toggleEnabled(row, val) {
  try { await adminApi.updateGreeting(row.id, { isEnabled: !!val }) }
  catch (err) { ElMessage.error(err.message); await load() }
}

async function remove(row) {
  try {
    await adminApi.deleteGreeting(row.id)
    ElMessage.success(t('common.removed'))
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

onMounted(load)
</script>

<style scoped>
.admin-page { max-width: 900px; margin: 0 auto; padding: 16px; }
.preview-hint { font-size: 12px; color: var(--text-secondary); margin: -8px 0 12px; }
</style>
