<template>
  <ArtistLayout>
    <h2>{{ $t('manualOrder.title') }}</h2>
    <p class="hint">{{ $t('manualOrder.hint') }}</p>

    <el-card style="margin-top: 16px; max-width: 600px">
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
        <el-form-item :label="$t('manualOrder.clientQq')" prop="clientQq">
          <el-input v-model="form.clientQq" :placeholder="$t('manualOrder.clientQqPlaceholder')" />
        </el-form-item>

        <el-form-item :label="$t('manualOrder.clientName')">
          <el-input v-model="form.clientName" :placeholder="$t('manualOrder.clientNamePlaceholder')" />
        </el-form-item>

        <el-form-item :label="$t('manualOrder.tier')">
          <el-select v-model="form.tierId" :placeholder="$t('manualOrder.tierPlaceholder')" clearable style="width: 100%">
            <el-option v-for="t in tiers" :key="t.id" :label="`${t.name} - ¥${t.price}`" :value="t.id" />
          </el-select>
        </el-form-item>

        <el-form-item :label="$t('manualOrder.desc')">
          <el-input
            v-model="form.description" type="textarea" :rows="4"
            :placeholder="$t('manualOrder.descPlaceholder')" maxlength="2000" show-word-limit
          />
        </el-form-item>

        <el-form-item :label="$t('manualOrder.priority')">
          <el-radio-group v-model="form.priority">
            <el-radio-button value="high">{{ $t('manualOrder.priorityHigh') }}</el-radio-button>
            <el-radio-button value="medium">{{ $t('manualOrder.priorityMedium') }}</el-radio-button>
            <el-radio-button value="low">{{ $t('manualOrder.priorityLow') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="submit" :loading="submitting" style="width: 100%">
            {{ $t('manualOrder.submit') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 录入成功 -->
    <el-dialog v-model="showResult" :title="$t('manualOrder.resultTitle')" width="360px">
      <el-result icon="success" :title="$t('manualOrder.orderNo', { no: resultNo })">
        <template #sub-title>{{ $t('manualOrder.addedToQueue') }}</template>
        <template #extra>
          <el-button type="primary" @click="$router.push('/queue')">{{ $t('manualOrder.viewQueue') }}</el-button>
          <el-button @click="resetForm">{{ $t('manualOrder.continueEntry') }}</el-button>
        </template>
      </el-result>
    </el-dialog>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
const formRef = ref(null)
const tiers = ref([])
const submitting = ref(false)
const showResult = ref(false)
const resultNo = ref('')

const form = reactive({
  clientQq: '',
  clientName: '',
  tierId: null,
  description: '',
  priority: 'medium'
})

const rules = {
  clientQq: [{ required: true, message: () => t('manualOrder.fillClientQq'), trigger: 'blur' }]
}

async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const order = await artistApi.createManualOrder({
      clientQq: form.clientQq.trim(),
      clientName: form.clientName.trim(),
      tierId: form.tierId,
      description: form.description.trim(),
      priority: form.priority
    })
    resultNo.value = order.order_no
    showResult.value = true
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  showResult.value = false
  form.clientQq = ''
  form.clientName = ''
  form.tierId = null
  form.description = ''
  form.priority = 'medium'
}

onMounted(async () => {
  try {
    tiers.value = await artistApi.getTiers()
  } catch { /* ignore */ }
})
</script>

<style scoped>
.hint { color: var(--text-secondary); font-size: 13px; margin-top: 8px; }
</style>
