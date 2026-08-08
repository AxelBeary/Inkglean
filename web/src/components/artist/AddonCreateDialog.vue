<template>
  <!-- SPEC-PRICE-2: [+ 新建增项] 弹窗 —— 名称 / 类别(增项/用途/加急) / 控件(开关/个数) / 计价(固定¥/百分比%) → 保存后自动挂到本画风并沉淀进增项库 -->
  <!-- 后端契约（v50）: category add/usage/rush；control_type switch/quantity；price_mode fixed/percent；max_quantity 数量上限 -->
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

      <!-- 类别：后端真实维度（category），顾客下单时用途/加急各只能选一个生效 -->
      <el-form-item :label="$t('styleManage.createKindLabel')" required>
        <el-radio-group v-model="form.category">
          <el-radio-button value="add">{{ $t('styleManage.catAdd') }}</el-radio-button>
          <el-radio-button value="usage">{{ $t('styleManage.catUsage') }}</el-radio-button>
          <el-radio-button value="rush">{{ $t('styleManage.catRush') }}</el-radio-button>
        </el-radio-group>
        <p class="form-hint">{{ categoryHint }}</p>
      </el-form-item>

      <!-- 控件类型：开关类 / 个数类（SPEC-PRICE-2 仅两类） -->
      <el-form-item :label="$t('styleManage.createControlLabel')" required>
        <el-radio-group v-model="form.control_type">
          <el-radio-button value="switch">{{ $t('styleManage.tplControlSwitch') }}</el-radio-button>
          <el-radio-button value="quantity">{{ $t('styleManage.tplControlQuantity') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <!-- 计价方式：固定金额 ¥N / 百分比 +N%（两类控件都支持） -->
      <el-form-item :label="$t('styleManage.createPricingLabel')" required>
        <el-radio-group v-model="form.price_mode">
          <el-radio-button value="fixed">{{ $t('styleManage.pricingFixed') }}</el-radio-button>
          <el-radio-button value="percent">{{ $t('styleManage.pricingPercent') }}</el-radio-button>
        </el-radio-group>
        <p class="form-hint">{{ pricingHint }}</p>
      </el-form-item>

      <el-form-item :label="priceLabel" required>
        <el-input-number
          v-model="form.default_price"
          :min="0"
          :max="form.price_mode === 'percent' ? 1000 : 999999"
          :step="form.price_mode === 'percent' ? 5 : 10"
          :precision="form.price_mode === 'percent' ? 0 : undefined"
          style="width: 200px"
        />
        <span class="price-suffix">{{ form.price_mode === 'percent' ? '%' : '¥' }}</span>
      </el-form-item>

      <!-- 个数类 → 单位 + 数量上限（防刷） -->
      <template v-if="form.control_type === 'quantity'">
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
import { reactive, ref, computed, watch } from 'vue'
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
const form = reactive({
  name: '',
  category: 'add',
  control_type: 'switch',
  price_mode: 'fixed',
  default_price: 50,
  unit_label: '',
  max_quantity: 99
})

function initForm() {
  form.name = ''
  form.category = 'add'
  form.control_type = 'switch'
  form.price_mode = 'fixed'
  form.default_price = 50
  form.unit_label = ''
  form.max_quantity = 99
}

/** 用途/加急必须是百分比计价（后端铁律：它们是公式中的乘法因子）→ 自动切到 percent */
watch(() => form.category, (cat) => {
  if (cat !== 'add' && form.price_mode !== 'percent') {
    form.price_mode = 'percent'
    if (form.default_price > 1000) form.default_price = 50
  }
})

/** 类别提示：增项=加法可多选；用途/加急=乘法位，顾客各选一个 */
const categoryHint = computed(() =>
  form.category === 'add' ? t('styleManage.createCatHintAdd') : t('styleManage.createCatHintMultiplier')
)

/** 计价方式提示 */
const pricingHint = computed(() =>
  form.price_mode === 'percent' ? t('styleManage.pricingHintPercent') : t('styleManage.pricingHintFixed')
)

/** 价格输入标签随计价方式切换（¥ 金额 / % 百分比） */
const priceLabel = computed(() =>
  form.price_mode === 'percent' ? t('styleManage.createPercentLabel') : t('styleManage.createPriceLabel')
)

/** 后端 payload（与 v50 schema 一一对应） */
function toPayload() {
  const payload = {
    name: form.name.trim(),
    control_type: form.control_type,
    price_mode: form.price_mode,
    default_price: form.default_price,
    category: form.category
  }
  if (form.control_type === 'quantity') {
    payload.unit_label = form.unit_label.trim() || null
    payload.max_quantity = form.max_quantity ?? null
  }
  return payload
}

async function submit() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning(t('styleManage.createNameRequired'))
    return
  }
  if (form.price_mode === 'percent' && (!Number.isInteger(form.default_price) || form.default_price > 1000)) {
    ElMessage.warning(t('styleManage.createPercentRangeHint'))
    return
  }
  saving.value = true
  try {
    // 同名处理：库中已有同名 → 「直接挂载 or 另建独立」
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
