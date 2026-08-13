<template>
  <!-- SPEC-PRICE-2: 胶囊设置弹窗 —— 三层编辑（模板级本身价+范围 / 画风级激活 / 尺寸级表格+批量）+ 移除解绑 -->
  <!-- 数据模型映射（与后端契约一致）:
       模板级 default_price → updateAddonTemplate；画风级 is_enabled/price_override → setStyleAddons；
       尺寸级 is_hidden(反义=启用)/price_override → setSizeOverrides。价格优先级: 本尺寸 > 画风价 > 本身价 -->
  <el-dialog
    :model-value="modelValue"
    :title="$t('styleManage.addonDialogTitle', { name: sa?.template_name || '' })"
    width="640px"
    destroy-on-close
    @update:model-value="(v) => emit('update:modelValue', v)"
    @open="initForm"
  >
    <div v-if="sa" v-loading="saving" class="addon-settings">
      <!-- ── 模板级 ── -->
      <div class="set-section">
        <div class="set-section-title">{{ $t('styleManage.addonTplLevel') }}</div>
        <div class="inp-row">
          <el-input-number
            v-model="form.basePrice"
            :min="0"
            :max="isPercent ? ADDON_PERCENT_MAX : ADDON_FIXED_PRICE_MAX"
            :step="isPercent ? 5 : 10"
            :precision="isPercent ? 0 : undefined"
            style="width: 200px"
          />
          <span class="unit-suffix">{{ isPercent ? '%' : '¥' }}</span>
          <el-tag size="small" effect="plain" :type="categoryTagType" class="cat-tag">{{ categoryTagText }}</el-tag>
          <el-button :plain="form.scope === 'all'" @click="toggleScope">
            {{ form.scope === 'style' ? $t('styleManage.addonScopeStyle') : $t('styleManage.addonScopeAll') }}
          </el-button>
        </div>
        <p class="hint">
          {{ form.scope === 'style' ? $t('styleManage.addonScopeHintStyle') : $t('styleManage.addonScopeHintAll') }}
        </p>
      </div>

      <!-- ── 画风级 ── -->
      <div class="set-section">
        <div class="set-section-title">{{ $t('styleManage.addonStyleLevel') }}</div>
        <el-switch
          :model-value="form.styleEnabled"
          :active-text="$t('styleManage.addonStyleEnable')"
          @change="(v) => (form.styleEnabled = !!v)"
        />
        <p class="hint">{{ stylePriceInfo }}</p>
      </div>

      <!-- ── 尺寸级 ── -->
      <div class="set-section">
        <div class="set-section-title">{{ $t('styleManage.addonSizeLevel') }}</div>
        <div class="batch-bar">
          <el-button size="small" @click="batchSet(true)">{{ $t('styleManage.addonBatchAll') }}</el-button>
          <el-button size="small" @click="batchSet(false)">{{ $t('styleManage.addonBatchOff') }}</el-button>
          <span class="batch-hint">{{ $t('styleManage.addonBatchHint') }}</span>
        </div>
        <table class="set-table">
          <thead>
            <tr>
              <th>{{ $t('styleManage.addonSizeCol') }}</th>
              <th style="width: 90px">{{ $t('styleManage.addonEnableCol') }}</th>
              <th style="width: 190px">{{ $t('styleManage.addonDiffPriceCol') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in form.sizeRows" :key="row.sizeId">
              <td class="row-name">{{ row.sizeName }}</td>
              <td><el-switch v-model="row.enabled" size="small" :aria-label="$t('styleManage.addonEnableCol')" /></td>
              <td>
                <div class="diff-cell">
                  <el-input-number
                    v-model="row.diffPrice"
                    :min="0"
                    :max="isPercent ? ADDON_PERCENT_MAX : ADDON_FIXED_PRICE_MAX"
                    :step="isPercent ? 5 : 10"
                    :precision="isPercent ? 0 : undefined"
                    size="small" style="width: 130px"
                    :placeholder="diffPlaceholder(row)"
                  />
                  <span v-if="row.diffPrice != null" class="unit-suffix">{{ isPercent ? '%' : '¥' }}</span>
                </div>
              </td>
            </tr>
            <tr v-if="!form.sizeRows.length">
              <td colspan="3" class="row-empty">{{ $t('styleManage.sizeEmpty') }}</td>
            </tr>
          </tbody>
        </table>
        <p class="hint">{{ $t('styleManage.addonPricePriority') }}</p>
      </div>
    </div>

    <template #footer>
      <div class="dlg-foot-inner">
        <el-button text type="danger" :disabled="saving" @click="onRemove">{{ $t('styleManage.addonRemove') }}</el-button>
        <div>
          <el-button @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="save">{{ $t('common.confirm') }}</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { ADDON_PERCENT_MAX, ADDON_FIXED_PRICE_MAX } from '../../constants/addon.js'
import { artistApi } from '../../api/index.js'
import { addonCategory, categoryLabel, addonPriceText } from './addon-utils.js'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  style: { type: Object, required: true },
  sa: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'saved'])

const saving = ref(false)
const form = reactive({
  basePrice: 0,
  scope: 'style',
  styleEnabled: true,
  sizeRows: []
})

/** 是否百分比计价（模板级 price_mode，真实后端字段） */
const isPercent = computed(() => props.sa?.template_price_mode === 'percent')

/** 类别徽标（真实 template_category，非名称约定） */
const categoryTagType = computed(() => ({ usage: 'warning', rush: 'danger', add: 'info' }[addonCategory(props.sa || {})] || 'info'))
const categoryTagText = computed(() => categoryLabel(t, addonCategory(props.sa || {})))

/** 画风级当前生效价文案（i18n；本尺寸 > 画风价 > 本身价 的中间层） */
const stylePriceInfo = computed(() => {
  const sa = props.sa
  if (!sa) return ''
  if (sa.price_override != null) {
    return t('styleManage.addonStylePriceOverride', { price: addonPriceText(sa, null, t) })
  }
  return t('styleManage.addonStylePriceTemplate', { price: addonPriceText(sa, null, t) })
})

/** 尺寸差异价为空时的 placeholder：沿用上层生效价（画风价 ?? 本身价） */
function diffPlaceholder(row) {
  const sa = props.sa
  if (!sa) return ''
  return addonPriceText(sa, row.diffPrice ?? null, t)
}

/** 打开时初始化表单（快照当前数据） */
function initForm() {
  const sa = props.sa
  if (!sa) return
  form.basePrice = sa.price_override ?? sa.template_default_price
  form.scope = 'style'
  form.styleEnabled = !!sa.is_enabled
  form.sizeRows = (props.style.sizes || []).map(size => {
    const ov = size._overrides?.[sa.id]
    return {
      sizeId: size.id,
      sizeName: size.name,
      enabled: ov ? !ov.is_hidden : true, // 无 override 记录 = 默认启用（老数据语义不变）
      diffPrice: ov?.price_override ?? null
    }
  })
}

function toggleScope() {
  form.scope = form.scope === 'style' ? 'all' : 'style'
}

function batchSet(on) {
  form.sizeRows.forEach(r => { r.enabled = on })
}

/** 移除（解绑本画风）：DELETE 端点删 style_addons 行（尺寸覆盖级联清），增项库保留 */
async function onRemove() {
  const sa = props.sa
  if (!sa) return
  try {
    await ElMessageBox.confirm(
      t('styleManage.addonRemoveConfirm', { name: sa.template_name }),
      t('styleManage.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  saving.value = true
  try {
    await artistApi.removeStyleAddon(props.style.id, sa.id)
    ElMessage.success(t('styleManage.addonRemoved'))
    emit('update:modelValue', false)
    emit('saved')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function save() {
  const sa = props.sa
  if (!sa) return
  if (isPercent.value && !Number.isInteger(form.basePrice)) {
    ElMessage.warning(t('styleManage.createPercentRangeHint'))
    return
  }
  saving.value = true
  try {
    // ── 模板级：本身价 ──
    if (form.scope === 'all') {
      if (form.basePrice !== sa.template_default_price) {
        await artistApi.updateAddonTemplate(sa.addon_template_id, { default_price: form.basePrice })
      }
      // 应用到所有画风 → 本画风跟随模板价（清画风价覆盖）
      if (sa.price_override != null) {
        await artistApi.setStyleAddons(props.style.id, [{ addon_template_id: sa.addon_template_id, price_override: null }])
      }
    } else {
      // 仅当前画风：改本身价输入 = 写画风价覆盖（与模板价一致时 = 沿用模板，置 null）
      const target = form.basePrice
      const newOverride = target === sa.template_default_price ? null : target
      if ((sa.price_override ?? null) !== newOverride) {
        await artistApi.setStyleAddons(props.style.id, [{ addon_template_id: sa.addon_template_id, price_override: newOverride }])
      }
    }

    // ── 画风级：激活开关 ──
    if (!!sa.is_enabled !== form.styleEnabled) {
      // 单选约束：打开用途/加急的画风级激活 → 同画风其他同类停用（顾客每单各选一个，后端兜底互斥）
      let styleItems = [{ addon_template_id: sa.addon_template_id, is_enabled: form.styleEnabled }]
      if (form.styleEnabled) {
        const cat = addonCategory(sa)
        if (cat !== 'add') {
          for (const other of (props.style.addons || [])) {
            if (other.id !== sa.id && addonCategory(other) === cat && !!other.is_enabled) {
              styleItems.push({ addon_template_id: other.addon_template_id, is_enabled: false })
            }
          }
        }
      }
      await artistApi.setStyleAddons(props.style.id, styleItems)
    }

    // ── 尺寸级：启用开关（is_hidden 反义）+ 差异价 ──
    const sizeChanges = []
    for (const row of form.sizeRows) {
      const ov = props.style.sizes.find(s => s.id === row.sizeId)?._overrides?.[sa.id]
      const cur = { enabled: ov ? !ov.is_hidden : true, diffPrice: ov?.price_override ?? null }
      if (cur.enabled !== row.enabled || (cur.diffPrice ?? null) !== (row.diffPrice ?? null)) {
        sizeChanges.push({
          sizeId: row.sizeId,
          price_override: row.diffPrice ?? null,
          is_hidden: !row.enabled
        })
      }
    }
    for (const ch of sizeChanges) {
      await artistApi.setSizeOverrides(props.style.id, ch.sizeId, [{
        style_addon_id: sa.id,
        price_override: ch.price_override,
        is_hidden: ch.is_hidden
      }])
    }

    ElMessage.success(t('styleManage.addonSaved'))
    emit('update:modelValue', false)
    emit('saved')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.addon-settings { display: flex; flex-direction: column; gap: 4px; }
.set-section { padding: 12px 0; border-bottom: 1px dashed var(--line); }
.set-section:last-child { border-bottom: none; }
.set-section-title { font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600; color: var(--ink); margin-bottom: 10px; }
.inp-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.unit-suffix { color: var(--ink3); font-weight: 600; }
.cat-tag { margin-left: 2px; }
.hint { font-size: calc(var(--font-scale, 1) * 11.5px); color: var(--ink2); margin: 6px 0 0; line-height: 1.6; }
.batch-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.batch-hint { margin-left: auto; font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); }
.set-table { width: 100%; border-collapse: collapse; font-size: calc(var(--font-scale, 1) * 12.5px); }
.set-table th { text-align: left; padding: 6px 8px; color: var(--ink3); font-weight: 500; border-bottom: 1px solid var(--line); font-size: calc(var(--font-scale, 1) * 11.5px); }
.set-table td { padding: 6px 8px; border-bottom: 1px solid var(--line); color: var(--ink2); }
.row-name { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); }
.row-empty { text-align: center; color: var(--ink4); padding: 14px 0; }
.diff-cell { display: flex; align-items: center; gap: 6px; }
.dlg-foot-inner { display: flex; justify-content: space-between; align-items: center; width: 100%; }
</style>
