<template>
  <div class="login-page">
    <el-card class="login-card">
      <h2 class="title">🎨 画师登录</h2>
      <p class="subtitle">输入你的QQ号，登录码将发送到你的QQ</p>

      <!-- 步骤1：输入QQ号 -->
      <div v-if="step === 1">
        <el-input v-model="qqNumber" placeholder="输入你的QQ号" size="large"
          @keyup.enter="sendCode" clearable />
        <el-button type="primary" size="large" style="width: 100%; margin-top: 16px"
          @click="sendCode" :loading="sending">
          获取登录码
        </el-button>
      </div>

      <!-- 步骤2：输入登录码 -->
      <div v-else>
        <el-alert :title="`登录码已发送至 QQ ${qqNumber}`" type="success" :closable="false"
          style="margin-bottom: 16px" />
        <el-input v-model="code" placeholder="输入6位登录码" size="large"
          maxlength="6" @keyup.enter="verify" />
        <el-button type="primary" size="large" style="width: 100%; margin-top: 16px"
          @click="verify" :loading="verifying">
          登录
        </el-button>
        <el-button text style="width: 100%; margin-top: 8px" @click="step = 1">
          ← 换个QQ号
        </el-button>
      </div>

      <!-- 开发提示 -->
      <el-alert v-if="devCode" :title="`开发模式登录码: ${devCode}`" type="warning"
        style="margin-top: 16px" :closable="false" />
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authApi } from '../../api/index.js'
import { useArtistStore } from '../../stores/artist.js'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const store = useArtistStore()

const step = ref(1)
const qqNumber = ref('')
const code = ref('')
const sending = ref(false)
const verifying = ref(false)
const devCode = ref('')

async function sendCode() {
  if (!qqNumber.value.trim()) return ElMessage.warning('请输入QQ号')
  sending.value = true
  try {
    const res = await authApi.sendCode(qqNumber.value.trim())
    step.value = 2
    // 开发模式显示登录码
    if (res._dev_code) devCode.value = res._dev_code
    ElMessage.success(res.message)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    sending.value = false
  }
}

async function verify() {
  if (!code.value.trim()) return ElMessage.warning('请输入登录码')
  verifying.value = true
  try {
    await store.login(qqNumber.value.trim(), code.value.trim())
    ElMessage.success('登录成功！')
    const redirect = route.query.redirect || '/dashboard'
    router.push(redirect)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    verifying.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 16px;
}
.login-card { width: 100%; max-width: 400px; }
.title { text-align: center; margin-bottom: 8px; }
.subtitle { text-align: center; color: #999; font-size: 14px; margin-bottom: 24px; }
</style>
