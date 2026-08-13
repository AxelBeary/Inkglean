<template>
  <!-- SPEC-PRICE-2: 增项库（唯一价格资产管理面）——类别/控件/计价方式/数量上限全可编辑 -->
  <!-- 契约（v50）: category add/usage/rush；control_type switch/quantity；price_mode fixed/percent -->
  <div class="tpl-manager" v-loading="loading">
    <p class="tpl-intro">{{ $t('styleManage.tplIntro') }}</p>

    <el-table :data="templates" stripe style="width: 100%">
      <el-table-column prop="name" :label="$t('styleManage.tplName')" min-width="110" />
      <el-table-column :label="$t('styleManage.tplCategory')" width="90">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="categoryTagType(row.category)">{{ categoryLabel($t, row.category || 'add') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('styleManage.tplControl')" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="controlTagType(row.control_type)">{{ controlLabel($t, row.control_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('styleManage.tplDefaultPrice')" min-width="130">
        <template #default="{ row }">
          <!-- 813-fq-tail-shared 战役 S：单位缺省走 i18n（styleManage.unitFallback），不再依赖 money.js 内置「位」 -->
          <span class="tpl-price">{{ formatAddonPrice(row.default_price, row.price_mode, { controlType: row.control_type, unitLabel: row.unit_label || t('styleManage.unitFallback') }) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('styleManage.tplMaxQty')" width="90">
        <template #default="{ row }">
          <span v-if="row.control_type === 'quantity'">{{ row.max_quantity ?? '—' }}</span>
          <span v-else class="tpl-na">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('styleManage.tplActions')" width="140" align="right">
        <template #default="{ row }">
          <el-button text size="small" @click="openEdit(row)">{{ $t('common.edit') }}</el-button>
          <el-button text size="small" type="danger" @click="confirmDelete(row)">{{ $t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 加载失败错误态（区分真空与加载失败，不再把失败误导成"没有模板"） -->
    <div v-if="loadFailed" class="module-error">
      <span>{{ $t('styleManage.tplLoadFailed') }}</span>
      <el-button size="small" @click="load">{{ $t('dashboard.retry') }}</el-button>
    </div>

    <el-empty v-else-if="!loading && templates.length === 0" :description="$t('styleManage.tplEmpty')" :image-size="60" />

    <el-button type="primary" size="small" style="margin-top: 12px" @click="openCreate">{{ $t('styleManage.tplAdd') }}</el-button>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? $t('styleManage.tplEditTitle') : $t('styleManage.tplAddTitle')" width="460px" destroy-on-close @closed="onDialogClosed">
      <el-form :model="form" label-position="top">
        <el-form-item :label="$t('styleManage.tplNameLabel')" required>
          <el-input v-model="form.name" :placeholder="$t('styleManage.tplNamePlaceholder')" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item :label="$t('styleManage.tplCategoryLabel')">
          <el-select v-model="form.category" style="width: 100%" @change="onCategoryChange">
            <el-option v-for="c in categories" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
          <p class="form-hint">{{ categoryHint }}</p>
        </el-form-item>
        <el-form-item :label="$t('styleManage.tplControlLabel')">
          <el-select v-model="form.control_type" style="width: 100%">
            <el-option v-for="c in controlTypes" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('styleManage.tplPricingLabel')">
          <el-select v-model="form.price_mode" style="width: 100%">
            <el-option v-for="p in priceModes" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('styleManage.tplPriceLabel')">
          <el-input-number
            v-model="form.default_price"
            :min="0"
            :max="form.price_mode === 'percent' ? 1000 : 999999"
            :step="form.price_mode === 'percent' ? 5 : 10"
            :precision="form.price_mode === 'percent' ? 0 : undefined"
            style="width: 200px"
          />
          <span class="unit-suffix">{{ form.price_mode === 'percent' ? '%' : '¥' }}</span>
        </el-form-item>
        <!-- quantity 时显示单位标签 + 数量上限 -->
        <template v-if="form.control_type === 'quantity'">
          <el-form-item :label="$t('styleManage.tplUnitLabel')">
            <el-input v-model="form.unit_label" :placeholder="$t('styleManage.tplUnitPlaceholder')" maxlength="20" style="width: 200px" />
          </el-form-item>
          <el-form-item :label="$t('styleManage.tplMaxQtyLabel')">
            <el-input-number v-model="form.max_quantity" :min="1" :max="999" :step="1" style="width: 200px" />
          </el-form-item>
        </template>
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
import { formatAddonPrice } from '../../utils/money.js'
import { controlLabel, controlTagType, categoryLabel } from './addon-utils.js'

const { t } = useI18n()

const templates = ref([])
const loading = ref(true)
/** 模板列表加载失败（独立错误态 + 重试；与"真没有模板"区分） */
const loadFailed = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editingId = ref(null)
const pendingReload = ref(false)

const form = ref({
  name: '',
  category: 'add',
  control_type: 'switch',
  price_mode: 'fixed',
  default_price: 0,
  unit_label: '',
  max_quantity: 99
})

// ─── 选项（i18n 标签，computed 保证语言切换后更新） ───
const categories = computed(() => [
  { value: 'add', label: t('styleManage.catAdd') },
  { value: 'usage', label: t('styleManage.catUsage') },
  { value: 'rush', label: t('styleManage.catRush') }
])
const controlTypes = computed(() => [
  { value: 'switch', label: t('styleManage.tplControlSwitch') },
  { value: 'quantity', label: t('styleManage.tplControlQuantity') }
])
const priceModes = computed(() => [
  { value: 'fixed', label: t('styleManage.tplPricingFixed') },
  { value: 'percent', label: t('styleManage.tplPricingPercent') }
])

const categoryHint = computed(() =>
  form.value.category === 'add' ? t('styleManage.createCatHintAdd') : t('styleManage.createCatHintMultiplier')
)

function categoryTagType(cat) {
  return { usage: 'warning', rush: 'danger', add: 'info' }[cat] || 'info'
}

/** 用途/加急必须百分比计价（后端铁律）→ 自动切 percent */
function onCategoryChange(cat) {
  if (cat !== 'add' && form.value.price_mode !== 'percent') {
    form.value.price_mode = 'percent'
    if (form.value.default_price > 1000) form.value.default_price = 50
  }
}

// ─── CRUD ───
function openCreate() {
  editingId.value = null
  form.value = { name: '', category: 'add', control_type: 'switch', price_mode: 'fixed', default_price: 0, unit_label: '', max_quantity: 99 }
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  form.value = {
    name: row.name,
    category: row.category || 'add',
    control_type: row.control_type,
    price_mode: row.price_mode,
    default_price: row.default_price,
    unit_label: row.unit_label || '',
    max_quantity: row.max_quantity ?? 99
  }
  dialogVisible.value = true
}

async function save() {
  if (!form.value.name.trim()) {
    ElMessage.warning(t('styleManage.tplNameRequired'))
    return
  }
  if (form.value.price_mode === 'percent' && (!Number.isInteger(form.value.default_price) || form.value.default_price > 1000)) {
    ElMessage.warning(t('styleManage.createPercentRangeHint'))
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      category: form.value.category,
      control_type: form.value.control_type,
      price_mode: form.value.price_mode,
      default_price: form.value.default_price,
      unit_label: form.value.control_type === 'quantity' ? (form.value.unit_label.trim() || null) : null,
      max_quantity: form.value.control_type === 'quantity' ? (form.value.max_quantity ?? null) : null
    }
    if (editingId.value) {
      await artistApi.updateAddonTemplate(editingId.value, payload)
    } else {
      await artistApi.createAddonTemplate(payload)
    }
    ElMessage.success(t('styleManage.tplSaved'))
    // 关闭弹窗触发过渡动画（约 300ms）——若此时 load() 挂 v-loading 遮罩会与动画重叠闪烁；
    // 改为静默刷新（不遮罩）+ 等 @closed 后再正式刷新，消除闪烁
    dialogVisible.value = false
    pendingReload.value = true
    await load(true)
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

async function load(silent = false) {
  if (!silent) loading.value = true
  loadFailed.value = false
  try {
    templates.value = await artistApi.getAddonTemplates()
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

// el-dialog 关闭过渡动画结束后触发——补一次正式刷新（静默刷新只更新数据，这里确保 UI 完整）
function onDialogClosed() {
  if (pendingReload.value) {
    pendingReload.value = false
    load(true)
  }
}

onMounted(load)
</script>

<style scoped>
/* 纸墨 token；价格数字墨色不上色铁律 */
.tpl-intro { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); line-height: 1.6; margin: 0 0 12px; }
.tpl-price { font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 600; font-size: calc(var(--font-scale, 1) * 13px); }
.tpl-na { color: var(--ink4); }
.form-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2); margin: 4px 0 0; line-height: 1.6; }
.unit-suffix { margin-left: 8px; color: var(--ink3); font-weight: 600; }
/* 加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
</style>
