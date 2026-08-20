<template>
  <div class="platform-manage">
    <!-- 页头 -->
    <div class="admin-page-head admin-page-head--actions">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.platformManage') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.platformManageSubtitle') }}</p>
      </div>
      <el-button type="primary" @click="openDialog()">{{ $t('admin.platform.add') }}</el-button>
    </div>

    <el-card shadow="never" class="admin-section-card" v-loading="loading">
      <el-table :data="platforms" style="width: 100%">
        <el-table-column :label="$t('admin.platform.colName')" min-width="140">
          <template #default="{ row }">
            <div class="pm-name-cell">
              <span class="pm-icon"><TplPlatformIcon :icon-key="row.iconKey" :fallback-char="row.fallbackChar" /></span>
              <span class="pm-name">{{ row.name }}</span>
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
        <el-table-column :label="$t('admin.platform.colOrder')" width="80" prop="sortOrder" align="center" />
        <el-table-column :label="$t('admin.platform.colEnabled')" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="!!row.enabled"
              :disabled="togglingId === row.id"
              @change="(val: boolean | string | number) => toggleEnabled(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" width="150" fixed="right" align="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button size="small" @click="openDialog(row)">{{ $t('admin.platform.edit') }}</el-button>
              <el-button
                size="small" type="danger" plain
                :loading="deletingId === row.id" :disabled="deletingId !== null"
                @click="remove(row)"
              >
                {{ $t('admin.platform.delete') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <!-- b3 清扫：空态误用「平台名」列名键；admin.platform.empty 键由 D 波补齐 -->
      <el-empty v-if="!loading && !platforms.length" :description="$t('admin.platform.empty')" />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing ? $t('admin.platform.edit') : $t('admin.platform.add')" width="680px">
      <!-- 819-I：一行一事——说明在左、控件在右 -->
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.platform.nameLabel') }}</div>
          <div class="desc">{{ $t('admin.platform.nameHint') }}</div>
        </div>
        <el-input v-model="form.name" :placeholder="$t('admin.platform.namePlaceholder')" maxlength="30" show-word-limit class="pm-name-input" />
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.platform.iconLabel') }}</div>
          <div class="desc">{{ $t('admin.platform.iconHint') }}</div>
        </div>
        <el-select v-model="form.iconKey" clearable :placeholder="$t('admin.platform.iconNone')" class="pm-icon-select">
          <el-option v-for="(label, key) in ICON_OPTIONS" :key="key" :value="key" :label="label" />
        </el-select>
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.platform.fallbackLabel') }}</div>
          <div class="desc">{{ $t('admin.platform.iconFallbackHint') }}</div>
        </div>
        <el-input v-model="form.fallbackChar" :placeholder="$t('admin.platform.fallbackPlaceholder')" maxlength="4" class="pm-fallback-input" />
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.platform.domainsLabel') }}</div>
          <div class="desc">{{ $t('admin.platform.domainsHint') }}</div>
        </div>
        <el-input
          v-model="domainsText"
          type="textarea" :rows="4"
          :placeholder="$t('admin.platform.domainsPlaceholder')"
          class="pm-domains-input"
        />
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.platform.orderLabel') }}</div>
          <div class="desc">{{ $t('admin.platform.orderHint') }}</div>
        </div>
        <el-input-number v-model="form.sortOrder" :min="0" :max="9999" controls-position="right" class="pm-order-input" />
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.platform.enabledLabel') }}</div>
          <div class="desc">{{ $t('admin.platform.enabledHint') }}</div>
        </div>
        <el-switch v-model="form.enabled" />
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('admin.platform.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" :disabled="!form.name.trim()" @click="submit">
          {{ $t('admin.platform.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '../../api/index'
import type { PlatformDTO } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import TplPlatformIcon from '../../components/shared/TplPlatformIcon.vue'
import { PLATFORM_ICON_NAMES } from '../../utils/simpleIcons'

const { t } = useI18n()

// 图标白名单下拉（simple-icons slug → 中文名）
const ICON_OPTIONS = PLATFORM_ICON_NAMES

const platforms = ref<PlatformDTO[]>([])
const loading = ref(false)
const saving = ref(false)
// b3 清扫：启用开关切换期间禁用，防连续触发
const togglingId = ref<number | null>(null)
/** 删除请求在途锁（确认后行级 loading，防重复触发） */
const deletingId = ref<number | null>(null)
const dialogVisible = ref(false)
const editing = ref(false)
const editId = ref<number | null>(null)

const form = reactive({
  name: '', iconKey: null as string | null, fallbackChar: '', sortOrder: 0, enabled: true
})
const domainsText = ref('')

async function load() {
  loading.value = true
  try {
    platforms.value = await adminApi.getPlatforms()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

function openDialog(row?: PlatformDTO | null) {
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

async function toggleEnabled(row: PlatformDTO, val: boolean | string | number) {
  if (togglingId.value === row.id) return
  togglingId.value = row.id
  try {
    await adminApi.updatePlatform(row.id, { enabled: !!val })
    row.enabled = !!val
    ElMessage.success(t('admin.platform.saved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
    row.enabled = !val
  } finally {
    togglingId.value = null
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
      await adminApi.updatePlatform(editId.value!, payload)
    } else {
      await adminApi.createPlatform(payload)
    }
    dialogVisible.value = false
    ElMessage.success(t('admin.platform.saved'))
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

async function remove(row: PlatformDTO) {
  try {
    await ElMessageBox.confirm(
      t('admin.platform.deleteConfirm', { name: row.name }),
      t('admin.platform.delete'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  if (deletingId.value !== null) return
  deletingId.value = row.id
  try {
    const res = await adminApi.deletePlatform(row.id)
    ElMessage.success(t('admin.platform.deleted', { n: res?.reattributed ?? 0 }))
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    deletingId.value = null
  }
}

onMounted(load)
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807） ═══ */
.platform-manage { }

.pm-name-cell { display: inline-flex; align-items: center; gap: 8px; }
.pm-name { font-weight: 600; color: var(--ink); }
.pm-icon { display: inline-flex; align-items: center; color: var(--ink); font-size: 16px; }
.pm-code { font-size: 12px; color: var(--ink2); }
.pm-fallback { margin-left: 8px; font-size: 12px; color: var(--ink3); }
.pm-domains { font-size: 12px; color: var(--ink2); }
.row-actions { display: flex; gap: var(--sp-1, 4px); }

/* 819-I：一行一事（说明在左、控件在右，对齐 QuickNote 基准） */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 480px; }
.form-text { min-width: 0; }
.pm-name-input { width: 320px; flex: none; }
.pm-icon-select { width: 320px; flex: none; }
.pm-fallback-input { width: 160px; flex: none; }
.pm-domains-input { width: 380px; flex: none; }
.pm-order-input { width: 160px; flex: none; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .pm-name-input, .pm-icon-select, .pm-domains-input { width: 100%; }
}
</style>
