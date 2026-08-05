<template>
  <div class="discount-manager">
    <!-- 全局开关 -->
    <div class="discount-toggle">
      <span class="discount-toggle-label">{{ $t('discount.enableLabel') }}</span>
      <el-switch v-model="enabled" :loading="toggling" @change="toggleDiscount" />
      <span class="discount-toggle-hint">{{ enabled ? $t('discount.enabledHint') : $t('discount.disabledHint') }}</span>
    </div>

    <!-- 折扣码列表 -->
    <div v-if="enabled" v-loading="loading" style="margin-top: 16px">
      <el-button type="primary" size="small" style="margin-bottom: 12px" @click="openDialog()">
        + {{ $t('discount.addBtn') }}
      </el-button>

      <el-table v-if="codes.length" :data="codes" size="small" stripe>
        <el-table-column prop="code" :label="$t('discount.colCode')" width="140" />
        <el-table-column :label="$t('discount.colType')" width="120">
          <template #default="{ row }">
            {{ row.discount_type === 'percent' ? `${row.discount_value}%` : `¥${row.discount_value}` }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('discount.colUsage')" width="100">
          <template #default="{ row }">
            {{ row.used_count }}{{ row.max_uses ? ` / ${row.max_uses}` : '' }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('discount.colExpiry')" width="120">
          <template #default="{ row }">
            {{ row.expires_at ? row.expires_at.slice(0, 10) : $t('discount.noExpiry') }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('discount.colStatus')" width="80">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? $t('discount.statusOn') : $t('discount.statusOff') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" min-width="140">
          <template #default="{ row }">
            <el-button size="small" text @click="openDialog(row)">{{ $t('common.edit') }}</el-button>
            <el-button size="small" text :type="row.enabled ? 'warning' : 'success'" @click="toggleCode(row)">
              {{ row.enabled ? $t('discount.disable') : $t('discount.enable') }}
            </el-button>
            <el-popconfirm :title="$t('discount.deleteConfirm', { code: row.code })" @confirm="removeCode(row)">
              <template #reference>
                <el-button size="small" text type="danger">{{ $t('common.delete') }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else-if="!loading" :description="$t('discount.empty')" :image-size="60" />
    </div>

    <!-- 创建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? $t('discount.editTitle') : $t('discount.addTitle')" width="420px">
      <el-form label-position="top">
        <el-form-item :label="$t('discount.codeLabel')" required>
          <el-input
            v-model="form.code" :disabled="!!editingId"
            :placeholder="$t('discount.codePlaceholder')" maxlength="20" show-word-limit
            style="text-transform: uppercase"
          />
        </el-form-item>
        <el-form-item :label="$t('discount.typeLabel')">
          <el-radio-group v-model="form.discountType" :disabled="!!editingId">
            <el-radio-button value="percent">{{ $t('discount.typePercent') }}</el-radio-button>
            <el-radio-button value="fixed">{{ $t('discount.typeFixed') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="form.discountType === 'percent' ? $t('discount.valuePercent') : $t('discount.valueFixed')" required>
          <el-input-number
            v-model="form.discountValue"
            :min="0.01" :max="form.discountType === 'percent' ? 100 : 99999"
            :precision="2" :step="form.discountType === 'percent' ? 5 : 10"
            controls-position="right" style="width: 200px"
          />
        </el-form-item>
        <el-form-item :label="$t('discount.maxUsesLabel')">
          <el-input-number v-model="form.maxUses" :min="1" :max="99999" controls-position="right" style="width: 200px" :placeholder="$t('discount.maxUsesPlaceholder')" />
          <span class="form-hint">{{ $t('discount.maxUsesHint') }}</span>
        </el-form-item>
        <el-form-item :label="$t('discount.expiryLabel')">
          <el-date-picker v-model="form.expiresAt" type="date" value-format="YYYY-MM-DD" :placeholder="$t('discount.expiryPlaceholder')" clearable style="width: 200px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitCode" :disabled="!form.code.trim() || !form.discountValue" :loading="submitting">
          {{ $t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const enabled = ref(false)
const toggling = ref(false)
const loading = ref(true)
const codes = ref([])

const dialogVisible = ref(false)
const submitting = ref(false)
const editingId = ref(null)
const form = ref({ code: '', discountType: 'percent', discountValue: 10, maxUses: null, expiresAt: null })

async function loadData() {
  loading.value = true
  try {
    const res = await artistApi.getDiscountCodes()
    enabled.value = res.enabled
    codes.value = res.codes || []
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function toggleDiscount(val) {
  toggling.value = true
  try {
    await artistApi.toggleDiscount(val)
    ElMessage.success(val ? t('discount.enabledMsg') : t('discount.disabledMsg'))
  } catch (err) {
    enabled.value = !val
    ElMessage.error(err.message)
  } finally {
    toggling.value = false
  }
}

function openDialog(row) {
  if (row) {
    editingId.value = row.id
    form.value = {
      code: row.code,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      maxUses: row.max_uses,
      expiresAt: row.expires_at ? row.expires_at.slice(0, 10) : null
    }
  } else {
    editingId.value = null
    form.value = { code: '', discountType: 'percent', discountValue: 10, maxUses: null, expiresAt: null }
  }
  dialogVisible.value = true
}

async function submitCode() {
  submitting.value = true
  try {
    const payload = {
      discountValue: form.value.discountValue,
      maxUses: form.value.maxUses || null,
      expiresAt: form.value.expiresAt || null
    }
    if (editingId.value) {
      await artistApi.updateDiscountCode(editingId.value, payload)
      ElMessage.success(t('discount.updatedMsg'))
    } else {
      await artistApi.createDiscountCode({
        code: form.value.code.trim().toUpperCase(),
        discountType: form.value.discountType,
        ...payload
      })
      ElMessage.success(t('discount.createdMsg'))
    }
    dialogVisible.value = false
    await loadData()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    submitting.value = false
  }
}

async function toggleCode(row) {
  try {
    await artistApi.updateDiscountCode(row.id, { enabled: !row.enabled })
    await loadData()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function removeCode(row) {
  try {
    await artistApi.deleteDiscountCode(row.id)
    ElMessage.success(t('discount.deletedMsg'))
    await loadData()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(loadData)
</script>

<style scoped>
/* v0.38 第二批: 纸墨 token（REQ-026） */
.discount-toggle {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-radius: var(--r-m);
  background: var(--paper2);
}
.discount-toggle-label { font-weight: 600; font-size: 14px; color: var(--ink); }
.discount-toggle-hint { font-size: 12px; color: var(--ink2); }
.form-hint { font-size: 12px; color: var(--ink2); margin-left: 8px; }
</style>
