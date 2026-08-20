<template>
  <!-- REQ-042: 页脚合规入口（隐私/条款链接 + 统一举报弹窗；客户端所有页面可见） -->
  <div class="compliance-links">
    <router-link to="/privacy" class="compliance-link">{{ $t('compliance.common.privacy') }}</router-link>
    <router-link to="/terms" class="compliance-link">{{ $t('compliance.common.terms') }}</router-link>
    <button type="button" class="compliance-link compliance-link--button" @click="dialogVisible = true">
      {{ $t('compliance.common.report') }}
    </button>

    <el-dialog
      v-model="dialogVisible"
      :title="$t('compliance.report.title')"
      width="480px"
      destroy-on-close
      align-center
    >
      <el-form label-position="top" :model="form" :rules="rules" ref="formRef">
        <el-form-item :label="$t('compliance.report.targetType')" prop="targetType">
          <el-select v-model="form.targetType" style="width: 100%">
            <el-option
              v-for="(label, value) in targetTypeOptions"
              :key="value"
              :value="value"
              :label="label"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('compliance.report.targetId')" prop="targetId">
          <el-input
            v-model="form.targetId"
            type="number"
            min="1"
            :placeholder="$t('compliance.report.targetIdPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="$t('compliance.report.description')" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
            :placeholder="$t('compliance.report.descriptionPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="$t('compliance.report.contact')">
          <el-input
            v-model="form.contact"
            maxlength="100"
            :placeholder="$t('compliance.report.contactPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <p class="compliance-report-hint">{{ $t('compliance.report.hint') }}</p>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">{{ $t('compliance.report.submit') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormItemRule } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { complianceApi } from '../../api/index'
import type { ReportTargetType } from '../../api/types'

const { t } = useI18n()

const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref(null)

const form = reactive<{
  targetType: ReportTargetType
  targetId: string
  description: string
  contact: string
}>({
  targetType: 'artist_home',
  targetId: '',
  description: '',
  contact: ''
})

/** 举报类型选项（i18n label；顺序即下拉顺序） */
const targetTypeOptions = computed(() => ({
  artist_home: t('compliance.report.types.artist_home'),
  artwork: t('compliance.report.types.artwork'),
  message: t('compliance.report.types.message'),
  other: t('compliance.report.types.other')
}))

const rules = {
  targetType: [{ required: true, message: () => t('compliance.report.targetTypeRequired'), trigger: 'change' }],
  // K1-10: 对象编号须为大于 0 的整数（拦截负数/小数/科学计数，空白允许）
  targetId: [{
    validator: (_rule: FormItemRule, value: unknown, callback: (error?: string | Error) => void) => {
      const raw = value == null ? '' : String(value).trim()
      if (!raw) { callback(); return }
      const n = Number(raw)
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n <= 0) {
        callback(new Error(t('compliance.report.targetIdInvalid')))
      } else {
        callback()
      }
    },
    trigger: 'blur'
  }],
  description: [
    { required: true, message: () => t('compliance.report.descriptionRequired'), trigger: 'blur' },
    { min: 1, max: 1000, message: () => t('compliance.report.descriptionLength'), trigger: 'blur' }
  ]
}

async function submit() {
  try {
    await (formRef.value as { validate: () => Promise<unknown> } | null)?.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const targetId = form.targetId.trim()
    await complianceApi.submitReport({
      targetType: form.targetType,
      targetId: targetId ? Number(targetId) : null,
      description: form.description.trim(),
      contact: form.contact.trim() || null
    })
    ElMessage.success(t('compliance.report.submitted'))
    dialogVisible.value = false
    form.description = ''
    form.contact = ''
    form.targetId = ''
  } catch (err) {
    const e = err as { status?: number; message?: string }
    if (e.status === 429) ElMessage.warning(t('compliance.report.rateLimited'))
    else ElMessage.error(e.message || t('compliance.report.submitFailed'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
/* 最小增量样式：链接行克制排版，随所在页脚主题继承（无野生圆角/间距全部 4px 倍数） */
.compliance-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.compliance-link {
  padding: 4px 0;
  color: var(--text-footer, var(--pal-text-dim, #888));
  font-size: 13px;
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  transition: color var(--dur-mid);
}
.compliance-link:hover { color: var(--color-primary, var(--pal-text, #333)); }
.compliance-link--button { font-family: inherit; }
.compliance-report-hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary, #888);
}
</style>
