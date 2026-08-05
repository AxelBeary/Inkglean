<template>
  <div class="tpl-manager" v-loading="loading">
    <!-- 增项库表格 -->
    <el-table :data="templates" stripe style="width: 100%">
      <el-table-column prop="name" :label="$t('styleManage.tplName')" min-width="120" />
      <el-table-column :label="$t('styleManage.tplControl')" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="controlTagType(row.control_type)">{{ controlLabel(row.control_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('styleManage.tplPricing')" width="110">
        <template #default="{ row }">{{ pricingLabel(row.pricing_mode) }}</template>
      </el-table-column>
      <el-table-column :label="$t('styleManage.tplDefaultPrice')" min-width="160">
        <template #default="{ row }">
          <span class="tpl-price">{{ formatDefaultPrice(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('styleManage.tplActions')" width="140" align="right">
        <template #default="{ row }">
          <el-button text size="small" @click="openEdit(row)">{{ $t('common.edit') }}</el-button>
          <el-button text size="small" type="danger" @click="confirmDelete(row)">{{ $t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && templates.length === 0" :description="$t('styleManage.tplEmpty')" :image-size="60" />

    <el-button type="primary" size="small" style="margin-top: 12px" @click="openCreate">{{ $t('styleManage.tplAdd') }}</el-button>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? $t('styleManage.tplEditTitle') : $t('styleManage.tplAddTitle')" width="460px" destroy-on-close>
      <el-form :model="form" label-position="top">
        <el-form-item :label="$t('styleManage.tplNameLabel')" required>
          <el-input v-model="form.name" :placeholder="$t('styleManage.tplNamePlaceholder')" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item :label="$t('styleManage.tplControlLabel')">
          <el-select v-model="form.control_type" style="width: 100%">
            <el-option v-for="c in controlTypes" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('styleManage.tplPricingLabel')">
          <el-select v-model="form.pricing_mode" style="width: 100%">
            <el-option v-for="p in pricingModes" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('styleManage.tplPriceLabel')">
          <el-input-number v-model="form.default_price" :min="0" :max="999999" :step="10" style="width: 200px" />
        </el-form-item>
        <!-- quantity 时显示单位标签 -->
        <el-form-item v-if="form.control_type === 'quantity'" :label="$t('styleManage.tplUnitLabel')">
          <el-input v-model="form.unit_label" :placeholder="$t('styleManage.tplUnitPlaceholder')" maxlength="20" style="width: 200px" />
        </el-form-item>
        <!-- radio 时显示选项列表（结构化编辑，产出 [{label, price}] JSON） -->
        <el-form-item v-if="form.control_type === 'radio'" :label="$t('styleManage.tplOptionsLabel')">
          <div class="options-editor">
            <div v-for="(opt, idx) in form.optionsRows" :key="idx" class="option-row">
              <el-input v-model="opt.label" :placeholder="$t('styleManage.tplOptionLabel')" size="small" style="flex: 1" maxlength="20" />
              <el-input-number v-model="opt.price" :min="0" :max="999999" :step="10" size="small" style="width: 130px" />
              <el-button text size="small" type="danger" @click="form.optionsRows.splice(idx, 1)">✕</el-button>
            </div>
            <el-button size="small" text type="primary" @click="form.optionsRows.push({ label: '', price: 0 })">
              {{ $t('styleManage.tplAddOption') }}
            </el-button>
            <p class="options-hint">{{ $t('styleManage.tplOptionsHint') }}</p>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const templates = ref([])
const loading = ref(true)
const saving = ref(false)
const dialogVisible = ref(false)
const editingId = ref(null)

const form = ref({
  name: '',
  control_type: 'switch',
  pricing_mode: 'fixed',
  default_price: 0,
  unit_label: '',
  optionsRows: [] // radio 选项 [{label, price}]
})

// ─── 控件类型 / 计价模式（i18n 标签，computed 保证语言切换后更新） ───
const controlTypes = computed(() => [
  { value: 'switch', label: t('styleManage.tplControlSwitch') },
  { value: 'quantity', label: t('styleManage.tplControlQuantity') },
  { value: 'radio', label: t('styleManage.tplControlRadio') }
])
const pricingModes = computed(() => [
  { value: 'fixed', label: t('styleManage.tplPricingFixed') },
  { value: 'per_unit', label: t('styleManage.tplPricingPerUnit') },
  { value: 'per_option', label: t('styleManage.tplPricingPerOption') }
])

function controlLabel(type) {
  return controlTypes.value.find(c => c.value === type)?.label || type
}
function pricingLabel(mode) {
  return pricingModes.value.find(p => p.value === mode)?.label || mode
}
function controlTagType(type) {
  return { switch: 'info', quantity: 'primary', radio: 'warning' }[type] || 'info'
}

/** 默认价展示：radio 显示选项摘要，quantity 显示单价/单位，其余显示固定价 */
function formatDefaultPrice(row) {
  if (row.control_type === 'radio' && row.options) {
    try {
      const opts = JSON.parse(row.options)
      if (Array.isArray(opts) && opts.length) {
        return opts.map(o => `${o.label}¥${o.price}`).join(' / ')
      }
    } catch { /* 损坏的 options 回退到固定价展示 */ }
  }
  if (row.pricing_mode === 'per_unit') {
    return t('styleManage.pricePerUnit', { price: row.default_price, unit: row.unit_label || t('styleManage.unitDefault') })
  }
  return `¥${row.default_price}`
}

// ─── CRUD ───
function openCreate() {
  editingId.value = null
  form.value = { name: '', control_type: 'switch', pricing_mode: 'fixed', default_price: 0, unit_label: '', optionsRows: [] }
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  let optionsRows = []
  if (row.control_type === 'radio' && row.options) {
    try {
      const parsed = JSON.parse(row.options)
      if (Array.isArray(parsed)) optionsRows = parsed.map(o => ({ label: o.label || '', price: o.price ?? 0 }))
    } catch { /* 损坏的 options 从空编辑 */ }
  }
  form.value = {
    name: row.name,
    control_type: row.control_type,
    pricing_mode: row.pricing_mode,
    default_price: row.default_price,
    unit_label: row.unit_label || '',
    optionsRows
  }
  dialogVisible.value = true
}

async function save() {
  if (!form.value.name.trim()) {
    ElMessage.warning(t('styleManage.tplNameRequired'))
    return
  }
  // radio 必须有有效选项
  if (form.value.control_type === 'radio') {
    const valid = form.value.optionsRows.filter(o => o.label.trim())
    if (!valid.length) {
      ElMessage.warning(t('styleManage.tplOptionsRequired'))
      return
    }
  }
  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      control_type: form.value.control_type,
      pricing_mode: form.value.pricing_mode,
      default_price: form.value.default_price,
      unit_label: form.value.control_type === 'quantity' ? (form.value.unit_label.trim() || null) : null,
      options: form.value.control_type === 'radio'
        ? JSON.stringify(form.value.optionsRows.filter(o => o.label.trim()).map(o => ({ label: o.label.trim(), price: o.price })))
        : null
    }
    if (editingId.value) {
      await artistApi.updateAddonTemplate(editingId.value, payload)
    } else {
      await artistApi.createAddonTemplate(payload)
    }
    ElMessage.success(t('styleManage.tplSaved'))
    dialogVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function confirmDelete(row) {
  try {
    await ElMessageBox.confirm(
      t('styleManage.tplDeleteConfirm', { name: row.name }),
      t('styleManage.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await artistApi.deleteAddonTemplate(row.id)
    ElMessage.success(t('styleManage.tplDeleted'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function load() {
  loading.value = true
  try {
    templates.value = await artistApi.getAddonTemplates()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
/* v0.38 第二批: 纸墨 token（REQ-026）；价格数字墨色不上色铁律（REQ §1.1） */
.tpl-price { font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 600; font-size: 13px; }
.options-editor { width: 100%; }
.option-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.options-hint { font-size: 11px; color: var(--ink2); margin: 4px 0 0; }
</style>
