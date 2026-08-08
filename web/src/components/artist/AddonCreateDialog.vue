<template>
  <!-- REQ-036 批A (任务2) + 02H (2026-08-09): [+ 新建增项] 弹窗 —— 名称/类别(增项/用途/加急)/计价方式/数量上限 → 保存后自动挂到本画风并沉淀进增项库 -->
  <!-- 用户原话(08-09): 价格分 增项类 用途类 加急类；增项可设个数、计价方式可设(原价百分比/纯数字/开关/计数)；算完乘用途类再乘加急类；用途、加急分别只能选一个 -->
  <!-- 后端契约: kind=add 加法 / kind=multiply 倍率(百分比)；max_quantity 数量上限（v49 已支持） -->
  <el-dialog
    :model-value="modelValue"
    :title="$t('styleManage.createTitle')"
    width="520px"
    destroy-on-close
    @update:model-value="(v) => emit('update:modelValue', v)"
    @open="initForm"
  >
    <el-form :model="form" label-position="top" @submit.prevent>
      <el-form-item :label="$t('styleManage.createNameLabel')" required>
        <el-input v-model="form.name" :placeholder="$t('styleManage.createNamePlaceholder')" maxlength="50" show-word-limit />
      </el-form-item>

      <!-- 02H: 类别三选（增项类=加法多选；用途/加急=乘法单选） -->
      <el-form-item :label="$t('styleManage.createKindLabel')" required>
        <el-radio-group v-model="form.kind">
          <el-radio-button value="add">{{ $t('styleManage.catAdd') }}</el-radio-button>
          <el-radio-button value="usage">{{ $t('styleManage.catUsage') }}</el-radio-button>
          <el-radio-button value="rush">{{ $t('styleManage.catRush') }}</el-radio-button>
        </el-radio-group>
        <p class="form-hint">{{ $t('styleManage.createKindHint') }}</p>
      </el-form-item>

      <!-- 02H: 计价方式（增项类：纯数字/开关/计数；用途/加急：原价百分比） -->
      <el-form-item :label="$t('styleManage.createPricingLabel')" required>
        <el-radio-group v-model="form.pricing_mode">
          <el-radio-button v-if="form.kind !== 'add'" value="percent">{{ $t('styleManage.pricingPercent') }}</el-radio-button>
          <el-radio-button v-if="form.kind === 'add'" value="fixed">{{ $t('styleManage.pricingFixed') }}</el-radio-button>
          <el-radio-button v-if="form.kind === 'add'" value="switch">{{ $t('styleManage.pricingSwitch') }}</el-radio-button>
          <el-radio-button v-if="form.kind === 'add'" value="count">{{ $t('styleManage.pricingCount') }}</el-radio-button>
        </el-radio-group>
        <p class="form-hint">{{ pricingHint }}</p>
      </el-form-item>

      <el-form-item :label="priceLabel" required>
        <el-input-number v-model="form.default_price" :min="0" :max="999999" :step="10" style="width: 200px" />
        <span v-if="form.kind !== 'add'" class="price-suffix">%</span>
      </el-form-item>

      <!-- 02H: 计数类型 → 单位 + 数量上限（防刷，v49 后端 max_quantity） -->
      <template v-if="form.kind === 'add' && form.pricing_mode === 'count'">
        <el-form-item :label="$t('styleManage.createUnitLabel')">
          <el-input v-model="form.unit_label" :placeholder="$t('styleManage.createUnitPlaceholder')" maxlength="10" style="width: 200px" />
        </el-form-item>
        <el-form-item :label="$t('styleManage.createMaxQtyLabel')">
          <el-input-number v-model="form.max_quantity" :min="1" :max="999" :step="1" style="width: 200px" />
          <p class="form-hint">{{ $t('styleManage.createMaxQtyHint') }}</p>
        </el-form-item>
      </template>

      <el-form-item>
        <p class="form-hint">{{ $t('styleManage.createSaveHint') }}</p>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ $t('styleManage.createSaveBtn') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 当前画风 id（挂载目标） */
  styleId: { type: Number, required: true },
  /** 增项库现有模板（同名检测用：name -> id） */
  templates: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'created', 'attached'])

const saving = ref(false)
const form = reactive({ name: '', kind: 'add', pricing_mode: 'fixed', default_price: 50, unit_label: '', max_quantity: 99 })

function initForm() {
  form.name = ''
  form.kind = 'add'
  form.pricing_mode = 'fixed'
  form.default_price = 50
  form.unit_label = ''
  form.max_quantity = 99
}

/** 计价方式提示：按类别/计价方式联动 */
const pricingHint = computed(() => {
  if (form.kind === 'add') {
    return t('styleManage.pricingHintAdd', { percent: form.pricing_mode === 'fixed' ? t('styleManage.pricingFixed') : t('styleManage.pricingSwitch') })
  }
  return t('styleManage.pricingHintMultiply')
})

const priceLabel = computed(() => form.kind === 'add' ? t('styleManage.createPriceLabel') : t('styleManage.createPercentLabel'))

/** 后端字段映射（与 AddonTemplateManager/后端 schema 一致）：
 *  增项类: kind=add，计价方式 fixed=纯数字 / switch=开关 / count=计数(per_unit)
 *  用途/加急: kind=multiply，计价方式 percent → default_price=百分比（+50% → 50） */
function toPayload() {
  if (form.kind !== 'add') {
    return {
      name: form.name.trim(),
      control_type: 'switch',
      pricing_mode: 'fixed',
      default_price: form.default_price,
      kind: 'multiply'
    }
  }
  if (form.pricing_mode === 'count') {
    return {
      name: form.name.trim(),
      control_type: 'quantity',
      pricing_mode: 'per_unit',
      default_price: form.default_price,
      unit_label: form.unit_label.trim() || null,
      max_quantity: form.max_quantity ?? null,
      kind: 'add'
    }
  }
  // 纯数字 / 开关 → switch 控件，fixed 计价
  return {
    name: form.name.trim(),
    control_type: 'switch',
    pricing_mode: 'fixed',
    default_price: form.default_price,
    kind: 'add'
  }
}

async function submit() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning(t('styleManage.createNameRequired'))
    return
  }
  // 02H: 加急类名称必须含「加急/急件」→ 前端分类约定（后端无 usage/rush 维度）
  if (form.kind === 'rush' && !(name.includes('加急') || name.includes('急件'))) {
    ElMessage.warning(t('styleManage.createRushNameHint'))
    return
  }
  saving.value = true
  try {
    // §3 同名处理：库中已有同名 → 「直接挂载 or 另建独立」
    const dup = props.templates.find(tp => tp.name === name)
    if (dup) {
      // 区分确认/取消/右上角关闭：确认=直接挂载，取消=另建独立，关闭=不操作
      let attach = false
      try {
        await ElMessageBox.confirm(
          t('styleManage.createDuplicateMsg', { name }),
          t('styleManage.createDuplicateTitle'),
          {
            type: 'warning',
            confirmButtonText: t('styleManage.createAttach'),
            cancelButtonText: t('styleManage.createNew'),
            distinguishCancelAndClose: true
          }
        )
        attach = true
      } catch (reason) {
        if (reason !== 'cancel') return // 右上角关闭或异常：不操作
      }
      if (attach) {
        emit('attached', { templateId: dup.id })
        emit('update:modelValue', false)
        ElMessage.success(t('styleManage.createAttached'))
        return
      }
    }
    // 另建独立 / 无同名
    emit('created', toPayload())
    emit('update:modelValue', false)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.form-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2); margin: 4px 0 0; line-height: 1.6; }
.price-suffix { margin-left: 8px; color: var(--ink3); font-weight: 600; }
</style>
