<template>
  <div class="order-form">
    <el-page-header @back="$router.push('/')" title="返回主页" content="我要约稿" />

    <el-card class="form-card" v-if="!submitted">
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">

        <!-- 选择档位 -->
        <el-form-item label="选择档位" prop="tierId">
          <el-select v-model="form.tierId" placeholder="请选择约稿类型" style="width: 100%">
            <el-option
              v-for="tier in tiers" :key="tier.id"
              :label="`${tier.name} - ¥${tier.price}`"
              :value="tier.id"
            />
          </el-select>
        </el-form-item>

        <!-- 需求描述 -->
        <el-form-item label="需求描述" prop="description">
          <el-input
            v-model="form.description" type="textarea" :rows="4"
            placeholder="描述你想要的画面：角色特征、姿势、风格、背景等"
            maxlength="1000" show-word-limit
          />
        </el-form-item>

        <!-- 参考图上传 -->
        <el-form-item label="参考图（可选，最多5张，每张≤10MB）">
          <el-upload
            :auto-upload="false" :limit="5" list-type="picture-card"
            :on-change="handleFileChange" :on-remove="handleFileRemove"
            accept="image/*,.psd,.gif,.bmp,.tiff"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
          <el-alert
            v-if="typeWarning" :title="typeWarning" type="warning"
            :closable="true" show-icon style="margin-top: 8px"
          />
        </el-form-item>

        <!-- QQ号 -->
        <el-form-item label="你的QQ号" prop="clientQq">
          <el-input v-model="form.clientQq" placeholder="画师会通过QQ联系你" />
        </el-form-item>

        <!-- 昵称 -->
        <el-form-item label="昵称（可选）">
          <el-input v-model="form.clientName" placeholder="怎么称呼你" />
        </el-form-item>

        <!-- QQ通知 -->
        <el-form-item v-if="notifyEnabled">
          <el-checkbox v-model="form.clientNotify">
            📩 排到我的时候通过QQ通知我
          </el-checkbox>
        </el-form-item>

        <!-- 约稿须知 -->
        <el-form-item v-if="rulesContent">
          <el-card class="rules-box" shadow="never">
            <div class="rules-scroll" v-html="rulesContent"></div>
          </el-card>
          <el-checkbox v-model="form.agreeRules" style="margin-top: 8px">
            ✋ 我已阅读并同意以上约稿须知
          </el-checkbox>
        </el-form-item>

        <!-- 提交 -->
        <el-form-item>
          <el-button type="primary" @click="submitOrder" :loading="submitting"
            :disabled="!form.agreeRules && !!rulesContent" style="width: 100%">
            提交约稿
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 提交成功 -->
    <el-card class="form-card" v-else>
      <el-result icon="success" title="约稿提交成功！">
        <template #sub-title>
          <p>你的订单号是：<strong class="order-no">{{ resultOrderNo }}</strong></p>
          <p style="margin-top: 8px; color: #666">请添加画师QQ沟通细节，报上你的订单号即可</p>
        </template>
        <template #extra>
          <el-button type="primary" @click="$router.push(`/track?no=${resultOrderNo}`)">
            查看进度
          </el-button>
          <el-button @click="$router.push('/')">返回主页</el-button>
        </template>
      </el-result>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { artistPublicApi, orderApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'

const formRef = ref(null)
const tiers = ref([])
const rulesContent = ref('')
const notifyEnabled = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const resultOrderNo = ref('')
const typeWarning = ref('')
const pendingFiles = ref([])

const form = reactive({
  tierId: null,
  description: '',
  clientQq: '',
  clientName: '',
  clientNotify: false,
  agreeRules: false
})

const rules = {
  tierId: [{ required: true, message: '请选择档位', trigger: 'change' }],
  clientQq: [{ required: true, message: '请填写QQ号', trigger: 'blur' }]
}

function getSubdomain() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('artist')) return params.get('artist')
  const parts = window.location.hostname.split('.')
  if (parts.length >= 3) return parts[0]
  return 'alice'
}

function handleFileChange(file) {
  pendingFiles.value.push(file.raw)
  // 格式提示
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    typeWarning.value = '建议转换为 JPG 或 WebP 格式以获得更好的预览体验，但当前格式也可以正常上传。'
  }
}

function handleFileRemove(file) {
  const idx = pendingFiles.value.indexOf(file.raw)
  if (idx > -1) pendingFiles.value.splice(idx, 1)
}

async function submitOrder() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const res = await orderApi.create({
      subdomain: getSubdomain(),
      tierId: form.tierId,
      clientQq: form.clientQq,
      clientName: form.clientName,
      description: form.description,
      clientNotify: form.clientNotify,
      agreeRules: form.agreeRules
    })
    resultOrderNo.value = res.orderNo
    submitted.value = true
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    const profile = await artistPublicApi.getProfile(getSubdomain())
    tiers.value = profile.tiers || []
    rulesContent.value = profile.rules || ''
    notifyEnabled.value = profile.notifyEnabled
  } catch {
    ElMessage.error('加载画师信息失败')
  }
})
</script>

<style scoped>
.order-form { max-width: 600px; margin: 0 auto; padding: 16px; }
.form-card { margin-top: 16px; }
.rules-box { max-height: 200px; overflow-y: auto; background: #fafafa; }
.rules-scroll { line-height: 1.8; font-size: 14px; }
.order-no { font-size: 24px; color: #409eff; letter-spacing: 2px; }
</style>
