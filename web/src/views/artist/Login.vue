<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-prefs">
        <ThemePicker />
      </div>

      <!-- Logo -->
      <div class="login-brand">
        <img :src="logoUrl" alt="绘约" class="login-logo" />
        <h1 class="login-title font-display">{{ $t('login.title') }}</h1>
        <p class="login-subtitle">{{ $t('login.subtitle') }}</p>
      </div>

      <!-- REQ-027: QQ 号 + TOTP 动态口令单步登录（替代旧验证码流程） -->
      <el-input
        v-model="qqNumber" :placeholder="$t('login.qqPlaceholder')" size="large"
        style="margin-bottom: 16px"
      />
      <el-input
        v-model="code" :placeholder="$t('login.codePlaceholder')" size="large"
        maxlength="6" @keyup.enter="login" style="margin-bottom: 16px"
      />
      <el-button type="primary" size="large" style="width: 100%" @click="login" :loading="logging">
        {{ $t('login.login') }}
      </el-button>

      <!-- R6: 验证器 App 推荐清单（画师引导文案） -->
      <el-collapse class="login-help">
        <el-collapse-item :title="$t('login.helpTitle')" name="help">
          <p class="help-desc">{{ $t('login.helpDesc') }}</p>
          <ul class="help-list">
            <li>{{ $t('login.helpTencent') }}</li>
            <li>{{ $t('login.helpAegis') }}</li>
            <li>{{ $t('login.help2fas') }}</li>
          </ul>
          <p class="help-note">{{ $t('login.helpNotGoogle') }}</p>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useArtistStore } from '../../stores/artist.js'
import { useThemeStore } from '../../stores/theme.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ThemePicker from '../../components/ThemePicker.vue'
import logoUrl from '../../assets/logo.webp'

const { t } = useI18n()
const router = useRouter()
const store = useArtistStore()
const themeStore = useThemeStore()

// v0.38 第二批: 登录是后台入口，启用纸墨 token 作用域（REQ-026）。
// 复用第一批 enter/leave 机制（机制不动）：挂载时按 localStorage 持久化值挂
// html[data-artist-theme]，卸载时摘除，不污染客户端路由（客户端零影响）。
onMounted(() => themeStore.enterArtistScope())
onUnmounted(() => themeStore.leaveArtistScope())

const qqNumber = ref('')
const code = ref('')
const logging = ref(false)

async function login() {
  if (!qqNumber.value.trim()) {
    ElMessage.warning(t('login.enterQq'))
    return
  }
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
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026）——token 作用域由 onMounted enterArtistScope 挂载 ═══ */
.login-page {
  min-height: 100vh;
  background: var(--paper);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  transition: background 0.3s;
}
.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--card);
  border-radius: var(--r-l);
  border: 1px solid var(--line);
  padding: 40px 32px;
  box-shadow: var(--sh-3);
  position: relative;
  transition: background 0.3s, border-color 0.3s;
}
.login-prefs { position: absolute; top: 12px; right: 12px; }

.login-brand { text-align: center; margin-bottom: 28px; }
.login-logo {
  width: 64px; height: 64px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 1px var(--line);
  margin-bottom: 12px;
}
.login-title {
  font-size: 28px;
  font-weight: 400;
  color: var(--ink);
  letter-spacing: 0.3em;
  margin-bottom: 6px;
}
.login-subtitle {
  color: var(--ink2);
  font-size: 13px;
}

/* R6 验证器推荐清单 */
.login-help { margin-top: 20px; border-top: 1px dashed var(--line); }
.login-help :deep(.el-collapse-item__header) {
  font-size: 12px;
  color: var(--ink2);
  background: transparent;
  border-bottom: none;
  justify-content: center;
}
.login-help :deep(.el-collapse-item__wrap) { background: transparent; border-bottom: none; }
.login-help :deep(.el-collapse-item__content) { padding-bottom: 8px; }
.help-desc { font-size: 12px; color: var(--ink2); margin-bottom: 8px; }
.help-list { margin: 0 0 8px 18px; padding: 0; font-size: 12px; color: var(--ink2); line-height: 1.8; }
.help-note { font-size: 12px; color: var(--zs); margin: 0; }
</style>
