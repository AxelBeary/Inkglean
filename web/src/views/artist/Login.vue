<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-prefs">
        <ThemeToggle />
      </div>
      <h1 class="login-title">{{ $t('login.title') }}</h1>
      <p class="login-subtitle">{{ $t('login.subtitle') }}</p>

      <!-- 步骤1：输入QQ -->
      <div v-if="step === 1">
        <el-input v-model="qqNumber" :placeholder="$t('login.qqPlaceholder')" size="large"
          @keyup.enter="getCode" style="margin-bottom: 16px" />
        <el-button type="primary" size="large" style="width: 100%" @click="getCode" :loading="sending">
          {{ $t('login.getCode') }}
        </el-button>
      </div>

      <!-- 步骤2：输入验证码 -->
      <div v-else>
        <p class="code-sent">{{ $t('login.codeSent', { qq: qqNumber }) }}</p>
        <el-input v-model="code" :placeholder="$t('login.codePlaceholder')" size="large"
          maxlength="6" @keyup.enter="login" style="margin-bottom: 16px" />
        <el-button type="primary" size="large" style="width: 100%" @click="login" :loading="logging">
          {{ $t('login.login') }}
        </el-button>
        <el-button text style="width: 100%; margin-top: 8px" @click="step = 1">
          {{ $t('login.changeQq') }}
        </el-button>
      </div>

      <!-- 开发模式提示 -->
      <el-alert v-if="devCode" type="info" :closable="false" style="margin-top: 16px">
        {{ $t('login.devCode', { code: devCode }) }}
      </el-alert>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useArtistStore } from '../../stores/artist.js'
import { authApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ThemeToggle from '../../components/ThemeToggle.vue'

const { t } = useI18n()
const router = useRouter()
const store = useArtistStore()

const step = ref(1)
const qqNumber = ref('')
const code = ref('')
const devCode = ref('')
const sending = ref(false)
const logging = ref(false)

async function getCode() {
  if (!qqNumber.value.trim()) {
    ElMessage.warning(t('login.enterQq'))
    return
  }
  sending.value = true
  try {
    const res = await authApi.sendCode(qqNumber.value.trim())
    devCode.value = res._dev_code || ''
    step.value = 2
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    sending.value = false
  }
}

async function login() {
  if (!code.value.trim()) {
    ElMessage.warning(t('login.enterCode'))
    return
  }
  logging.value = true
  try {
    await store.login(qqNumber.value.trim(), code.value.trim())
    ElMessage.success(t('login.loginSuccess'))
    router.push(store.isAdmin ? '/admin' : '/dashboard')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    logging.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: var(--bg-page);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  transition: background 0.3s;
}
.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-card);
  border-radius: 12px;
  padding: 40px 32px;
  box-shadow: var(--shadow-card);
  position: relative;
  transition: background 0.3s;
}
.login-prefs { position: absolute; top: 12px; right: 12px; }
.login-title { text-align: center; font-size: 24px; color: var(--text-primary); margin-bottom: 8px; }
.login-subtitle { text-align: center; color: var(--text-secondary); font-size: 14px; margin-bottom: 24px; }
.code-sent { color: var(--el-color-success); font-size: 14px; margin-bottom: 16px; text-align: center; }
</style>
