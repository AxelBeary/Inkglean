<template>
  <div class="standalone-income-page">
    <h2 class="od-page-title">{{ $t('standaloneIncome.title') }}</h2>
    <p class="page-sub">{{ $t('standaloneIncome.subtitle') }}</p>

    <!-- 记一笔：金额（元→分）/ 日期（默认今天）/ 客户昵称 / 备注 -->
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="page-card si-form"
      @submit.prevent="submit"
    >
      <div class="si-form-grid">
        <el-form-item :label="$t('standaloneIncome.amountLabel')" prop="amount" class="si-field">
          <el-input-number
            v-model="form.amount"
            :min="0"
            :precision="2"
            :controls="false"
            :placeholder="$t('standaloneIncome.amountPlaceholder')"
            class="si-amount-input"
          />
        </el-form-item>
        <el-form-item :label="$t('standaloneIncome.dateLabel')" prop="incomeDate" class="si-field">
          <el-date-picker
            v-model="form.incomeDate"
            type="date"
            value-format="YYYY-MM-DD"
            :placeholder="$t('standaloneIncome.datePlaceholder')"
            style="width: 100%"
          />
        </el-form-item>
      </div>
      <el-form-item :label="$t('standaloneIncome.clientLabel')" prop="clientName">
        <el-input
          v-model="form.clientName"
          :maxlength="50"
          show-word-limit
          :placeholder="$t('standaloneIncome.clientPlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="$t('standaloneIncome.noteLabel')" prop="note">
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="3"
          :maxlength="200"
          show-word-limit
          :placeholder="$t('standaloneIncome.notePlaceholder')"
        />
      </el-form-item>
      <el-button type="primary" :loading="saving" @click="submit">
        {{ saving ? $t('standaloneIncome.adding') : $t('standaloneIncome.addBtn') }}
      </el-button>
    </el-form>

    <!-- 记账明细（按日期倒序：日期 / 客户 / 金额 / 备注） -->
    <div class="page-card si-list">
      <h3 class="si-list-title">{{ $t('standaloneIncome.listTitle') }}</h3>
      <div v-loading="loading" class="si-list-body">
        <p v-if="!loading && items.length === 0" class="si-empty">{{ $t('standaloneIncome.empty') }}</p>
        <div v-for="item in items" :key="item.id" class="si-row">
          <span class="si-row-date">{{ item.incomeDate }}</span>
          <div class="si-row-info">
            <span class="si-row-client">{{ item.clientName || $t('standaloneIncome.anonymous') }}</span>
            <span v-if="item.note" class="si-row-note">{{ item.note }}</span>
          </div>
          <span class="si-row-amount">{{ formatYuan(item.amountCents) }}</span>
          <el-button
            text
            type="danger"
            size="small"
            class="si-row-delete"
            @click="remove(item)"
          >
            {{ $t('standaloneIncome.delete') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatYuan, yuanToCents } from '../../utils/money.js'
import { todayStr } from '../../utils/datetime.js'
import { artistApi } from '../../api/index.js'

const { t } = useI18n()

const formRef = ref(null)
const form = reactive({ amount: null, clientName: '', note: '', incomeDate: todayStr() })
const saving = ref(false)

/** 前端校验 = 后端子集：amountCents>0 / incomeDate YYYY-MM-DD（组件限定格式）/ 长度上限 */
const rules = {
  amount: [{
    validator: (_rule, value, callback) => {
      if (value == null || value === '' || !Number.isFinite(value)) {
        return callback(new Error(t('standaloneIncome.amountRequired')))
      }
      if (value <= 0) {
        return callback(new Error(t('standaloneIncome.amountPositive')))
      }
      callback()
    },
    trigger: 'blur'
  }],
  incomeDate: [{ required: true, message: () => t('standaloneIncome.dateRequired'), trigger: 'change' }],
  clientName: [{ max: 50, message: () => t('standaloneIncome.clientTooLong'), trigger: 'blur' }],
  note: [{ max: 200, message: () => t('standaloneIncome.noteTooLong'), trigger: 'blur' }]
}

async function submit() {
  if (saving.value) return
  try {
    await formRef.value.validate()
  } catch {
    return // el-form 已展示校验错误
  }
  // 元 → 分（×100 取整；后端要求整数分 >0）
  const amountCents = yuanToCents(form.amount)
  saving.value = true
  try {
    // 05D-I1: 收口进 artistApi（401 自动登出/15s 超时/i18n 翻译走统一拦截器）
    await artistApi.createStandaloneIncome({
      amountCents,
      clientName: form.clientName.trim(),
      note: form.note.trim(),
      incomeDate: form.incomeDate
    })
    ElMessage.success(t('standaloneIncome.addSuccess'))
    // 重置表单（日期回到今天），列表刷新
    form.amount = null
    form.clientName = ''
    form.note = ''
    form.incomeDate = todayStr()
    formRef.value.clearValidate()
    await loadItems()
  } catch (err) {
    ElMessage.error(err.message || t('standaloneIncome.addFailed'))
  } finally {
    saving.value = false
  }
}

// ─── 列表：GET（后端已按 income_date 倒序） + 删除（仅本人，越权 404） ───
const items = ref([])
const loading = ref(false)

async function loadItems() {
  loading.value = true
  try {
    // 05D-I1: 收口进 artistApi
    const data = await artistApi.getStandaloneIncomes()
    items.value = data?.items || []
  } catch (err) {
    ElMessage.error(err.message || t('standaloneIncome.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function remove(item) {
  try {
    await ElMessageBox.confirm(t('standaloneIncome.deleteConfirm'), t('common.confirmDeleteTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return // 用户取消
  }
  try {
    // 05D-I1: 收口进 artistApi（错误对象带 status，拦截器附加）
    await artistApi.deleteStandaloneIncome(item.id)
    ElMessage.success(t('standaloneIncome.deleteSuccess'))
    await loadItems()
  } catch (err) {
    // 越权/已删：后端统一 404，提示并刷新列表
    if (err?.status === 404) {
      ElMessage.warning(t('standaloneIncome.notFound'))
      await loadItems()
      return
    }
    ElMessage.error(err.message || t('standaloneIncome.deleteFailed'))
  }
}

onMounted(loadItems)
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.standalone-income-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; }

/* 记一笔表单卡片 */
.si-form {
  margin-top: 20px;
  padding: 22px 24px;
}
.si-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 16px; }
.si-amount-input { width: 100%; }

/* 记账明细卡片 */
.si-list {
  margin-top: 20px;
  padding: 18px 0 8px;
}
.si-list-title { margin: 0 24px 6px; font-size: 15px; font-weight: 700; color: var(--ink); }
.si-list-body { min-height: 64px; }
.si-empty { margin: 0; padding: 28px 24px; text-align: center; color: var(--ink3); font-size: 13px; }

.si-row {
  display: grid;
  grid-template-columns: 104px 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 24px;
}
.si-row + .si-row { border-top: 1px dashed var(--line2); }
.si-row-date { font-size: 12px; color: var(--ink3); font-variant-numeric: tabular-nums; }
.si-row-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.si-row-client { font-size: 14px; font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.si-row-note { font-size: 12px; color: var(--ink2); overflow-wrap: anywhere; }
.si-row-amount { font-size: 16px; font-weight: 700; color: var(--hq); font-variant-numeric: tabular-nums; text-align: right; }
.si-row-delete { flex: none; }

@media (max-width: 600px) {
  .si-row { grid-template-columns: 1fr auto auto; }
  .si-row-date { grid-column: 1 / -1; }
}
</style>
