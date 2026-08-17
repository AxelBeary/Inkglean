<template>
  <div class="addon-template-manage admin-page">
    <!-- 页头 -->
    <div class="admin-page-head admin-page-head--actions">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.addonTemplates') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.addonTemplatesSubtitle') }}</p>
      </div>
      <el-button type="primary" @click="openCreate">{{ $t('admin.addonTemplatesAdd') }}</el-button>
    </div>

    <el-card shadow="never" class="admin-section-card" v-loading="loading">
      <el-table :data="templates" style="width: 100%">
        <el-table-column prop="name" :label="$t('admin.addonTemplatesColName')" min-width="140" />
        <el-table-column :label="$t('admin.addonTemplatesColCategory')" width="96">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="categoryTagType(row.category)">{{ categoryLabel($t, row.category || 'add') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.addonTemplatesColControl')" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="controlTagType(row.control_type)">{{ controlLabel($t, row.control_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.addonTemplatesColPricing')" width="100">
          <template #default="{ row }">
            <span>{{ row.price_mode === 'percent' ? $t('styleManage.tplPricingPercent') : $t('styleManage.tplPricingFixed') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.addonTemplatesColPrice')" min-width="130">
          <template #default="{ row }">
            <span class="at-price">{{ formatAddonPrice(row.default_price, row.price_mode, { controlType: row.control_type, unitLabel: row.unit_label || $t('styleManage.unitFallback') }) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.addonTemplatesColSort')" width="72" prop="sort_order" align="center" />
        <el-table-column :label="$t('admin.addonTemplatesColReferenced')" width="92" align="center">
          <template #default="{ row }">
            <span>{{ row.referenced }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" width="150" fixed="right" align="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button size="small" @click="openEdit(row)">{{ $t('common.edit') }}</el-button>
              <el-button size="small" type="danger" plain @click="confirmDelete(row)">{{ $t('common.delete') }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !templates.length" :description="$t('admin.addonTemplatesEmpty')" />
    </el-card>

    <!-- 新建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? $t('admin.addonTemplatesEdit') : $t('admin.addonTemplatesAdd')"
      width="680px"
      destroy-on-close
    >
      <!-- 819-I：一行一事——说明在左、控件在右 -->
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('styleManage.tplNameLabel') }}</div>
          <div class="desc">{{ $t('admin.addonTemplatesNameHint') }}</div>
        </div>
        <el-input v-model="form.name" :placeholder="$t('styleManage.tplNamePlaceholder')" maxlength="50" show-word-limit class="at-name-input" />
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('styleManage.tplCategoryLabel') }}</div>
          <div class="desc">{{ categoryHint }}</div>
        </div>
        <el-radio-group v-model="form.category" @change="onCategoryChange">
          <el-radio-button value="add">{{ $t('styleManage.catAdd') }}</el-radio-button>
          <el-radio-button value="usage">{{ $t('styleManage.catUsage') }}</el-radio-button>
          <el-radio-button value="rush">{{ $t('styleManage.catRush') }}</el-radio-button>
        </el-radio-group>
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('styleManage.tplControlLabel') }}</div>
          <div class="desc">{{ $t('admin.addonTemplatesControlHint') }}</div>
        </div>
        <el-radio-group v-model="form.control_type">
          <el-radio-button value="switch">{{ $t('styleManage.tplControlSwitch') }}</el-radio-button>
          <el-radio-button value="quantity" :disabled="form.category !== 'add'">{{ $t('styleManage.tplControlQuantity') }}</el-radio-button>
        </el-radio-group>
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('styleManage.tplPricingLabel') }}</div>
          <div class="desc">{{ pricingHint }}</div>
        </div>
        <el-radio-group v-model="form.price_mode">
          <el-radio-button value="fixed">{{ $t('styleManage.tplPricingFixed') }}</el-radio-button>
          <el-radio-button value="percent">{{ $t('styleManage.tplPricingPercent') }}</el-radio-button>
        </el-radio-group>
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('styleManage.tplPriceLabel') }}</div>
          <div class="desc">{{ $t('admin.addonTemplatesPriceHint') }}</div>
        </div>
        <div class="at-price-control">
          <el-input-number
            v-model="form.default_price"
            :min="0"
            :max="form.price_mode === 'percent' ? ADDON_PERCENT_MAX : ADDON_FIXED_PRICE_MAX"
            :step="form.price_mode === 'percent' ? 5 : 10"
            :precision="form.price_mode === 'percent' ? 0 : undefined"
            class="at-price-input"
          />
          <span class="price-suffix">{{ form.price_mode === 'percent' ? '%' : '¥' }}</span>
        </div>
      </div>
      <template v-if="form.control_type === 'quantity'">
        <div class="row">
          <div class="form-text">
            <div class="lab">{{ $t('styleManage.tplUnitLabel') }}</div>
            <div class="desc">{{ $t('admin.addonTemplatesUnitHint') }}</div>
          </div>
          <el-input v-model="form.unit_label" :placeholder="$t('styleManage.tplUnitPlaceholder')" maxlength="20" class="at-unit-input" />
        </div>
        <div class="row">
          <div class="form-text">
            <div class="lab">{{ $t('styleManage.tplMaxQtyLabel') }}</div>
            <div class="desc">{{ $t('styleManage.createMaxQtyHint') }}</div>
          </div>
          <el-input-number v-model="form.max_quantity" :min="1" :max="999" :step="1" class="at-qty-input" />
        </div>
      </template>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.addonTemplatesSortLabel') }}</div>
          <div class="desc">{{ $t('admin.addonTemplatesSortHint') }}</div>
        </div>
        <el-input-number v-model="form.sort_order" :min="0" :max="9999" controls-position="right" class="at-sort-input" />
      </div>

      <!-- 编辑时：同步/冻结开关（默认不勾选 = 冻结） -->
      <div class="row" v-if="editingId">
        <div class="form-text">
          <div class="lab">{{ $t('admin.addonTemplatesSyncLabel') }}</div>
          <div class="desc">
            {{ $t('admin.addonTemplatesSyncHint') }}
            <span class="sync-warn">{{ $t('admin.addonTemplatesFreezeNote') }}</span>
          </div>
        </div>
        <el-switch v-model="form.sync" />
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submit">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { ADDON_PERCENT_MAX, ADDON_FIXED_PRICE_MAX, ADDON_DEFAULT_PRICE } from '../../constants/addon.js'
import { formatAddonPrice } from '../../utils/money.js'
import { controlLabel, controlTagType, categoryLabel } from '../../components/artist/addon-utils.js'

const { t } = useI18n()

const templates = ref([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editingId = ref(null)

const form = reactive({
  name: '',
  category: 'add',
  control_type: 'switch',
  price_mode: 'fixed',
  default_price: ADDON_DEFAULT_PRICE,
  unit_label: '',
  max_quantity: 99,
  sort_order: 0,
  sync: false
})

const categoryHint = computed(() =>
  form.category === 'add' ? t('styleManage.createCatHintAdd') : t('styleManage.createCatHintMultiplier')
)
const pricingHint = computed(() =>
  form.price_mode === 'percent' ? t('styleManage.pricingHintPercent') : t('styleManage.pricingHintFixed')
)

function categoryTagType(cat) {
  return { usage: 'warning', rush: 'danger', add: 'info' }[cat] || 'info'
}

/** 用途/加急必须百分比计价 + 开关控件（后端铁律）→ 自动切并锁定 */
function onCategoryChange(cat) {
  if (cat !== 'add') {
    form.price_mode = 'percent'
    form.control_type = 'switch'
    if (form.default_price > ADDON_PERCENT_MAX) form.default_price = ADDON_DEFAULT_PRICE
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    name: '',
    category: 'add',
    control_type: 'switch',
    price_mode: 'fixed',
    default_price: ADDON_DEFAULT_PRICE,
    unit_label: '',
    max_quantity: 99,
    sort_order: 0,
    sync: false
  })
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  Object.assign(form, {
    name: row.name,
    category: row.category || 'add',
    control_type: row.control_type,
    price_mode: row.price_mode,
    default_price: row.default_price,
    unit_label: row.unit_label || '',
    max_quantity: row.max_quantity ?? 99,
    sort_order: row.sort_order ?? 0,
    // 默认不勾选 = 冻结（用户拍板 2026-08-15）
    sync: false
  })
  dialogVisible.value = true
}

async function submit() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning(t('styleManage.tplNameRequired'))
    return
  }
  if (form.price_mode === 'percent' && (!Number.isInteger(form.default_price) || form.default_price > ADDON_PERCENT_MAX)) {
    ElMessage.warning(t('styleManage.createPercentRangeHint'))
    return
  }
  const isQuantity = form.control_type === 'quantity'
  const payload = {
    name,
    category: form.category,
    control_type: form.control_type,
    price_mode: form.price_mode,
    default_price: form.default_price,
    unit_label: isQuantity ? (form.unit_label.trim() || null) : null,
    max_quantity: isQuantity ? (form.max_quantity ?? null) : null,
    sort_order: form.sort_order ?? 0
  }
  saving.value = true
  try {
    if (editingId.value) {
      await adminApi.updateAddonTemplate(editingId.value, { ...payload, sync: form.sync })
    } else {
      await adminApi.createAddonTemplate(payload)
    }
    dialogVisible.value = false
    ElMessage.success(t('admin.addonTemplatesSaved'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function confirmDelete(row) {
  const message = row.referenced > 0
    ? t('admin.addonTemplatesDeleteRefConfirm', { name: row.name, count: row.referenced })
    : t('admin.addonTemplatesDeleteConfirm', { name: row.name })
  try {
    await ElMessageBox.confirm(message, t('styleManage.confirmTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
  } catch { return }
  try {
    await adminApi.deleteAddonTemplate(row.id)
    ElMessage.success(t('admin.addonTemplatesDeleted'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function load() {
  loading.value = true
  try {
    templates.value = await adminApi.getAddonTemplates()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.at-price { font-weight: 600; color: var(--ink); }
.price-suffix { margin-left: 8px; color: var(--ink3); font-weight: 600; }

/* 819-I：一行一事（说明在左、控件在右，对齐 QuickNote 基准） */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.6; }
.form-text { min-width: 0; }
.sync-warn { display: block; color: var(--warn, #b7791f); margin-top: 4px; }
.at-name-input { width: 320px; flex: none; }
.at-price-control { display: flex; align-items: center; }
.at-price-input { width: 200px; flex: none; }
.at-unit-input { width: 200px; flex: none; }
.at-qty-input { width: 200px; flex: none; }
.at-sort-input { width: 160px; flex: none; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .at-name-input { width: 100%; }
}
</style>
