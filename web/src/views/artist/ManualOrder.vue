<template>
  <ArtistLayout>
    <h2>✍ 手动录单</h2>
    <p class="hint">客户通过QQ联系你后，在这里手动录入订单信息。</p>

    <el-card style="margin-top: 16px; max-width: 600px">
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
        <el-form-item label="客户QQ号" prop="clientQq">
          <el-input v-model="form.clientQq" placeholder="客户的QQ号" />
        </el-form-item>

        <el-form-item label="客户昵称（可选）">
          <el-input v-model="form.clientName" placeholder="怎么称呼客户" />
        </el-form-item>

        <el-form-item label="档位">
          <el-select v-model="form.tierId" placeholder="选择档位（可不选）" clearable style="width: 100%">
            <el-option v-for="t in tiers" :key="t.id" :label="`${t.name} - ¥${t.price}`" :value="t.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="需求描述">
          <el-input v-model="form.description" type="textarea" :rows="4"
            placeholder="从QQ聊天中复制客户的需求描述" maxlength="1000" show-word-limit />
        </el-form-item>

        <el-form-item label="优先级">
          <el-radio-group v-model="form.priority">
            <el-radio-button value="high">🔴 高</el-radio-button>
            <el-radio-button value="medium">🟡 中（默认）</el-radio-button>
            <el-radio-button value="low">🟢 低</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="submit" :loading="submitting" style="width: 100%">
            录入订单
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 录入成功 -->
    <el-dialog v-model="showResult" title="录入成功" width="360px">
      <el-result icon="success" :title="`订单号: ${resultNo}`">
        <template #sub-title>已加入排期队列</template>
        <template #extra>
          <el-button type="primary" @click="$router.push('/queue')">查看排期</el-button>
          <el-button @click="resetForm">继续录入</el-button>
        </template>
      </el-result>
    </el-dialog>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'

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
  clientQq: [{ required: true, message: '请填写客户QQ号', trigger: 'blur' }]
}

async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const order = await artistApi.createManualOrder({
      clientQq: form.clientQq,
      clientName: form.clientName,
      tierId: form.tierId,
      description: form.description,
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
.hint { color: #999; font-size: 13px; margin-top: 8px; }
</style>
