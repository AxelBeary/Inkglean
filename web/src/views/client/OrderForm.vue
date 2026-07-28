<template>
  <div class="order-form-page">
    <div class="form-container" v-loading="loading">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('orderForm.backHome')" :content="$t('orderForm.title')" />

      <el-card style="margin-top: 16px" v-if="artist">
        <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
          <!-- 档位选择 -->
          <el-form-item :label="$t('orderForm.tierLabel')" prop="tierId">
            <el-select v-model="form.tierId" :placeholder="$t('orderForm.tierPlaceholder')" style="width: 100%">
              <el-option v-for="tier in tiers" :key="tier.id" :label="`${tier.name} - ¥${tier.price}`" :value="tier.id" />
            </el-select>
          </el-form-item>

          <!-- 流程与收款预览 -->
          <el-form-item v-if="workflowStages.length" :label="$t('orderForm.workflowLabel')">
            <WorkflowOverviewStrip :stages="workflowStages" />
          </el-form-item>

          <!-- 需求描述 -->
          <el-form-item :label="$t('orderForm.descLabel')" prop="description">
            <el-input
              v-model="form.description" type="textarea" :rows="5"
              :placeholder="$t('orderForm.descPlaceholder')" maxlength="2000" show-word-limit
            />
          </el-form-item>

          <!-- 参考图上传 -->
          <el-form-item :label="$t('orderForm.refLabel')">
            <el-upload
              :auto-upload="true" :http-request="handleRefUpload"
              accept="image/*" list-type="picture-card" :limit="5"
              :file-list="refFileList" :on-exceed="() => ElMessage.warning($t('orderForm.refExceed'))"
              :on-remove="handleRefRemove"
            >
              <el-icon aria-label="上传参考图"><Plus /></el-icon>
            </el-upload>
          </el-form-item>

          <!-- QQ号 -->
          <el-form-item :label="$t('orderForm.qqLabel')" prop="clientQq">
            <el-input v-model="form.clientQq" :placeholder="$t('orderForm.qqPlaceholder')" />
          </el-form-item>

          <!-- 昵称 -->
          <el-form-item :label="$t('orderForm.nameLabel')">
            <el-input v-model="form.clientName" :placeholder="$t('orderForm.namePlaceholder')" />
          </el-form-item>

          <!-- QQ通知 -->
          <el-form-item v-if="artist.notifyEnabled">
            <el-checkbox v-model="form.notifyEnabled">{{ $t('orderForm.notifyLabel') }}</el-checkbox>
          </el-form-item>

          <!-- 须知确认（消毒后渲染） -->
          <el-form-item v-if="rulesContent" prop="agreed">
            <el-card shadow="never" class="rules-preview">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-html="sanitizedRules" class="rules-html"></div>
            </el-card>
            <el-checkbox v-model="form.agreed" style="margin-top: 8px">
              {{ $t('orderForm.agreeLabel') }}
            </el-checkbox>
          </el-form-item>

          <!-- 平台职责声明 -->
          <el-form-item>
            <Disclaimer />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="submit" :loading="submitting" style="width: 100%">
              {{ $t('orderForm.submit') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <!-- 成功弹窗 -->
    <el-dialog v-model="showSuccess" :title="$t('orderForm.successTitle')" width="380px" :close-on-click-modal="false">
      <el-result icon="success" :title="$t('orderForm.orderNoIs') + resultNo">
        <template #sub-title>{{ $t('orderForm.addQqHint') }}</template>
        <template #extra>
          <el-button type="primary" @click="$router.push(`/artist/${subdomain}/track?no=${resultNo}`)">
            {{ $t('orderForm.viewProgress') }}
          </el-button>
        </template>
      </el-result>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { artistPublicApi, orderApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { sanitizeHtml } from '../../utils/sanitize.js'
import Disclaimer from '../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../components/shared/WorkflowOverviewStrip.vue'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain

const formRef = ref(null)
const artist = ref(null)
const tiers = ref([])
const rulesContent = ref('')
const loading = ref(true)
const submitting = ref(false)
const showSuccess = ref(false)
const resultNo = ref('')
const refFileList = ref([])
const uploadedRefs = ref([])
const workflowStages = ref([])
// uid → filePath 映射，用于删除时精确匹配
const refUidMap = ref(new Map())

// XSS 防护：须知内容消毒后渲染
const sanitizedRules = computed(() => sanitizeHtml(rulesContent.value))

const form = reactive({
  tierId: null,
  description: '',
  clientQq: '',
  clientName: '',
  notifyEnabled: true,
  agreed: false
})

const rules = {
  tierId: [{ required: true, message: () => t('orderForm.selectTier'), trigger: 'change' }],
  clientQq: [{ required: true, message: () => t('orderForm.fillQq'), trigger: 'blur' }],
  agreed: [{
    validator: (rule, value, callback) => {
      if (rulesContent.value && !value) callback(new Error(t('orderForm.agreeLabel')))
      else callback()
    },
    trigger: 'change'
  }]
}

async function handleRefUpload({ file }) {
  if (file.size > 10 * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    ElMessage.warning(t('orderForm.fileTooBig', { name: file.name, size: sizeMB }))
    return
  }
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    ElMessage.info(t('orderForm.typeWarning'))
  }
  try {
    const uploaded = await uploadApi.reference(file)
    uploadedRefs.value.push(uploaded.filePath)
    refUidMap.value.set(file.uid, uploaded.filePath)
  } catch (err) {
    ElMessage.error(err.message || t('common.uploadFailed'))
    throw err // 让 el-upload 标记该文件为 error 状态
  }
}

function handleRefRemove(file) {
  const filePath = refUidMap.value.get(file.uid)
  if (filePath) {
    const idx = uploadedRefs.value.indexOf(filePath)
    if (idx > -1) uploadedRefs.value.splice(idx, 1)
    refUidMap.value.delete(file.uid)
  }
}

async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const order = await orderApi.create({
      subdomain,
      tierId: form.tierId,
      description: form.description.trim(),
      clientQq: form.clientQq.trim(),
      clientName: form.clientName.trim(),
      clientNotify: form.notifyEnabled,
      agreeRules: form.agreed,
      references: uploadedRefs.value
    })
    resultNo.value = order.orderNo
    showSuccess.value = true
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    const data = await artistPublicApi.getProfile(subdomain)
    artist.value = data
    tiers.value = data.tiers || []
    rulesContent.value = data.rules || ''
    // 加载流程（静默失败不阻塞下单）
    artistPublicApi.getWorkflow(subdomain)
      .then(res => { workflowStages.value = res.stages || [] })
      .catch(() => {})
  } catch (err) {
    ElMessage.error(err.message || t('orderForm.loadFailed'))
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.order-form-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding: 16px;
  transition: background 0.3s;
}
.form-container { max-width: 600px; margin: 0 auto; }
.rules-preview { max-height: 200px; overflow-y: auto; }
.rules-html { line-height: 1.8; color: var(--text-primary); }
</style>
