<template>
  <div class="platform-manage">
    <div class="pm-head">
      <h2 class="pm-title">{{ $t('admin.platformManage') }}</h2>
      <el-button type="primary" @click="openDialog()">{{ $t('admin.platform.add') }}</el-button>
    </div>

    <el-card v-loading="loading">
      <el-table :data="platforms" style="width: 100%">
        <el-table-column :label="$t('admin.platform.colName')" min-width="140">
          <template #default="{ row }">
            <div class="pm-name-cell">
              <span class="pm-icon"><TplPlatformIcon :icon-key="row.iconKey" :fallback-char="row.fallbackChar" /></span>
              {{ row.name }}
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.platform.colIcon')" min-width="160">
          <template #default="{ row }">
            <code class="pm-code">{{ row.iconKey || '—' }}</code>
            <span v-if="row.fallbackChar" class="pm-fallback">{{ row.fallbackChar }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.platform.colDomains')" min-width="220">
          <template #default="{ row }">
            <span class="pm-domains">{{ (row.matchDomains || []).join('、') || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.platform.colOrder')" width="80" prop="sortOrder" />
        <el-table-column :label="$t('admin.platform.colEnabled')" width="90">
          <template #default="{ row }">
            <el-switch
              :model-value="!!row.enabled"
              @change="(val) => toggleEnabled(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDialog(row)">{{ $t('admin.platform.edit') }}</el-button>
            <el-button size="small" type="danger" @click="remove(row)">{{ $t('admin.platform.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !platforms.length" :description="$t('admin.platform.colName')" />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing ? $t('admin.platform.edit') : $t('admin.platform.add')" width="520px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="$t('admin.platform.nameLabel')" required>
          <el-input v-model="form.name" :placeholder="$t('admin.platform.namePlaceholder')" maxlength="30" show-word-limit />
        </el-form-item>
        <el-form-item :label="$t('admin.platform.iconLabel')">
          <el-select v-model="form.iconKey" clearable :placeholder="$t('admin.platform.iconNone')" style="width: 100%">
            <el-option v-for="(label, key) in ICON_OPTIONS" :key="key" :value="key" :label="label" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('admin.platform.fallbackLabel')">
          <el-input v-model="form.fallbackChar" :placeholder="$t('admin.platform.fallbackPlaceholder')" maxlength="4" style="width: 160px" />
          <div class="form-hint">{{ $t('admin.platform.iconFallbackHint') }}</div>
        </el-form-item>
        <el-form-item :label="$t('admin.platform.domainsLabel')">
          <el-input
            v-model="domainsText"
            type="textarea" :rows="4"
            :placeholder="$t('admin.platform.domainsPlaceholder')"
          />
          <div class="form-hint">{{ $t('admin.platform.domainsHint') }}</div>
        </el-form-item>
        <el-form-item :label="$t('admin.platform.orderLabel')">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" controls-position="right" style="width: 160px" />
        </el-form-item>
        <el-form-item :label="$t('admin.platform.enabledLabel')">
          <el-switch v-model="form.enabled" />
          <div class="form-hint">{{ $t('admin.platform.enabledHint') }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('admin.platform.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" :disabled="!form.name.trim()" @click="submit">
          {{ $t('admin.platform.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import TplPlatformIcon from '../../components/shared/TplPlatformIcon.vue'
import { PLATFORM_ICON_NAMES } from '../../utils/simpleIcons.js'

const { t } = useI18n()

// 图标白名单下拉（simple-icons slug → 中文名）
const ICON_OPTIONS = PLATFORM_ICON_NAMES

const platforms = ref([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref(false)
const editId = ref(null)

const form = reactive({
  name: '', iconKey: null, fallbackChar: '', sortOrder: 0, enabled: true
})
const domainsText = ref('')

async function load() {
  loading.value = true
  try {
    platforms.value = await adminApi.getPlatforms()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

function openDialog(row) {
  editing.value = !!row
  editId.value = row?.id ?? null
  form.name = row?.name || ''
  form.iconKey = row?.iconKey || null
  form.fallbackChar = row?.fallbackChar || ''
  form.sortOrder = row?.sortOrder ?? 0
  form.enabled = row ? !!row.enabled : true
  domainsText.value = (row?.matchDomains || []).join('\n')
  dialogVisible.value = true
}

async function toggleEnabled(row, val) {
  try {
    await adminApi.updatePlatform(row.id, { enabled: !!val })
    row.enabled = !!val
    ElMessage.success(t('admin.platform.saved'))
  } catch (err) {
    ElMessage.error(err.message)
    row.enabled = !val
  }
}

function parseDomains() {
  return domainsText.value
    .split('\n')
    .map(s => s.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^\.+/, ''))
    .filter(Boolean)
}

async function submit() {
  if (!form.name.trim()) return
  const domains = parseDomains()
  if (domains.some(d => !/^[a-z0-9.-]+$/i.test(d) || d.includes(' '))) {
    ElMessage.error(t('admin.platform.domainFormatError'))
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      icon_key: form.iconKey || null,
      fallback_char: form.fallbackChar.trim() || null,
      match_domains: domains,
      sort_order: form.sortOrder || 0,
      enabled: !!form.enabled
    }
    if (editing.value) {
      await adminApi.updatePlatform(editId.value, payload)
    } else {
      await adminApi.createPlatform(payload)
    }
    dialogVisible.value = false
    ElMessage.success(t('admin.platform.saved'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      t('admin.platform.deleteConfirm', { name: row.name }),
      t('admin.platform.delete'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    const res = await adminApi.deletePlatform(row.id)
    ElMessage.success(t('admin.platform.deleted', { n: res?.reattributed ?? 0 }))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(load)
</script>

<style scoped>
.pm-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.pm-title { font-size: 18px; font-weight: 600; color: var(--ink); margin: 0; }
.pm-name-cell { display: inline-flex; align-items: center; gap: 8px; }
.pm-icon { display: inline-flex; align-items: center; color: var(--ink); font-size: 16px; }
.pm-code { font-size: 12px; color: var(--ink2); }
.pm-fallback { margin-left: 6px; font-size: 12px; color: var(--ink3); }
.pm-domains { font-size: 12px; color: var(--ink2); }
.form-hint { color: var(--ink2); font-size: 12px; margin-top: 4px; }
</style>
