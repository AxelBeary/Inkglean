<template>
  <!-- REQ-043 I6-a: 从 ArtStyleManager 拆出——从增项库导入弹窗（纯搬移，零行为变化） -->
  <el-dialog v-model="visible" :title="$t('styleManage.addonImportTitle')" width="460px">
    <div v-if="importCandidates.length" class="import-list">
      <el-checkbox-group v-model="importSelection">
        <div v-for="tpl in importCandidates" :key="tpl.id" class="import-row">
          <el-checkbox :value="tpl.id">
            <span class="addon-tpl-name">{{ tpl.name }}</span>
          </el-checkbox>
          <el-tag size="small" :type="controlTagType(tpl.control_type)">{{ controlLabel(tpl.control_type) }}</el-tag>
          <el-tag size="small" effect="plain" :type="tplCategoryTagType(tpl.category)">{{ categoryLabel($t, tpl.category || 'add') }}</el-tag>
          <!-- 813-fq-tail-shared 战役 S：单位缺省走 i18n（styleManage.unitFallback），不再依赖 money.js 内置「位」 -->
          <span class="import-price">{{ formatAddonPrice(tpl.default_price, tpl.price_mode, { controlType: tpl.control_type, unitLabel: tpl.unit_label || t('styleManage.unitFallback') }) }}</span>
        </div>
      </el-checkbox-group>
    </div>
    <el-empty v-else :description="$t('styleManage.addonImportEmpty')" :image-size="40" />
    <template #footer>
      <el-button @click="visible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!importSelection.length" :loading="importSaving" @click="confirmImportAddons">
        {{ $t('styleManage.addonImportConfirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../api/index.js'
import type { AddonTemplate } from '../../api/types.js'
import { formatAddonPrice } from '../../utils/money.js'
import { categoryLabel, controlLabel as controlLabelText, controlTagType } from './addon-utils.js'

/** 目标画风（本弹窗消费字段：已导入增项列表） */
interface ImportStyleLite {
  id: number
  addons: Array<{ addon_template_id: number | null; is_enabled: number | boolean | null; price_override?: number | null }>
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 目标画风（未导入项按它计算） */
  style: { type: Object as PropType<ImportStyleLite | null>, default: null },
  /** 增项库全量模板 */
  templates: { type: Array as PropType<AddonTemplate[]>, default: () => [] }
})
const emit = defineEmits(['update:modelValue', 'imported'])
const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const importSelection = ref<number[]>([])
const importSaving = ref(false)

function controlLabel(type: string) {
  return controlLabelText(t, type)
}

/** 该画风尚未导入的增项库模板 */
function unimportedTemplates(style: ImportStyleLite) {
  const imported = new Set(style.addons.map(sa => sa.addon_template_id))
  return props.templates.filter(tpl => !imported.has(tpl.id))
}

const importCandidates = computed(() => {
  const style = props.style
  return style ? unimportedTemplates(style) : []
})

/** 打开时清空勾选（与旧 openImportDialog 同口径） */
watch(() => props.modelValue, (open) => {
  if (open) importSelection.value = []
})

/** 确认导入：现有增项原状 + 新导入项（默认启用）整体 PUT（setStyleAddons upsert 语义） */
async function confirmImportAddons() {
  const style = props.style
  if (!style || !importSelection.value.length) return
  importSaving.value = true
  try {
    const items = [
      ...style.addons.map(sa => ({
        addon_template_id: sa.addon_template_id as number,
        is_enabled: !!sa.is_enabled,
        price_override: sa.price_override ?? null
      })),
      ...importSelection.value.map(tplId => ({ addon_template_id: tplId, is_enabled: true }))
    ]
    await artistApi.setStyleAddons(style.id, items)
    ElMessage.success(t('styleManage.addonImported'))
    visible.value = false
    emit('imported')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    importSaving.value = false
  }
}

/** 类别标签 el-tag type（导入弹窗用） */
function tplCategoryTagType(cat: string): 'warning' | 'danger' | 'info' {
  const map: Record<string, 'warning' | 'danger' | 'info'> = { usage: 'warning', rush: 'danger', add: 'info' }
  return map[cat] || 'info'
}
</script>

<style scoped>
.addon-tpl-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 500; color: var(--ink); }
/* A4: 增项导入弹窗 */
.import-list { max-height: 360px; overflow-y: auto; }
.import-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
/* 价格数字墨色不上色铁律（REQ §1.1） */
.import-price { margin-left: auto; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); font-variant-numeric: tabular-nums; }
</style>
