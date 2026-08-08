<template>
  <!-- REQ-036 批A (任务2): [+ 新建增项] 弹窗 —— 名称/控件类型/默认价 → 保存后自动挂到本画风并沉淀进增项库 -->
  <!-- ⚠️ 数量上限：后端 addon_templates 无 max_quantity 字段（批B加），本批不提供输入，避免「填了没保存」 -->
  <!-- ⚠️ radio 控件：需选项列表编辑（addon_templates.options 必填），本快捷入口只提供 switch/quantity，radio 请在「增项库」tab 创建 -->
  <el-dialog
    :model-value="modelValue"
    :title="$t('styleManage.createTitle')"
    width="480px"
    destroy-on-close
    @update:model-value="(v) => emit('update:modelValue', v)"
    @open="initForm"
  >
    <el-form :model="form" label-position="top" @submit.prevent>
      <el-form-item :label="$t('styleManage.createNameLabel')" required>
        <el-input v-model="form.name" :placeholder="$t('styleManage.createNamePlaceholder')" maxlength="50" show-word-limit />
      </el-form-item>

      <el-form-item :label="$t('styleManage.createControlLabel')" required>
        <el-radio-group v-model="form.control_type">
          <el-radio-button value="switch">{{ $t('styleManage.tplControlSwitch') }}</el-radio-button>
          <el-radio-button value="quantity">{{ $t('styleManage.tplControlQuantity') }}</el-radio-button>
        </el-radio-group>
        <p class="form-hint">{{ $t('styleManage.createControlHint') }}</p>
      </el-form-item>

      <el-form-item :label="$t('styleManage.createPriceLabel')" required>
        <el-input-number v-model="form.default_price" :min="0" :max="999999" :step="10" style="width: 200px" />
        <p class="form-hint">{{ $t('styleManage.createPriceHint') }}</p>
      </el-form-item>

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
import { reactive, ref } from 'vue'
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
const form = reactive({ name: '', control_type: 'switch', default_price: 50 })

function initForm() {
  form.name = ''
  form.control_type = 'switch'
  form.default_price = 50
}

/** pricing_mode 自动映射（与 AddonTemplateManager 语义一致） */
function pricingModeFor(type) {
  if (type === 'quantity') return 'per_unit'
  return 'fixed'
}

async function submit() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning(t('styleManage.createNameRequired'))
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
    emit('created', {
      name,
      control_type: form.control_type,
      pricing_mode: pricingModeFor(form.control_type),
      default_price: form.default_price
    })
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
</style>

