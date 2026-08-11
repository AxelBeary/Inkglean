<!-- REQ-041 管理后台二次验证对话框（会话升级）
     入口级守卫（AdminLayout）与动作级再验共用：
     TOTP 动态码输入 + Passkey 验证按钮同框（能力检测对齐 Login.vue 先例）
     验证通过 → emit('verified')，由父组件刷新状态继续 -->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('stepup.title')"
    width="420px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    append-to-body
    class="stepup-dialog"
  >
    <p class="stepup-desc">{{ t('stepup.desc') }}</p>

    <el-form label-position="top" @submit.prevent="submitTotp">
      <el-form-item :label="t('stepup.codeLabel')">
        <el-input
          v-model="code"
          maxlength="6"
          autofocus
          :placeholder="t('stepup.codePlaceholder')"
          @keyup.enter="submitTotp"
        />
      </el-form-item>
    </el-form>

    <div v-if="passkeySupported && hasPasskey" class="stepup-passkey">
      <div class="stepup-divider"><span>{{ t('common.or') }}</span></div>
      <button class="stepup-passkey-btn" type="button" :disabled="loading || passkeyLoading" @click="verifyPasskey">
        <el-icon><Lock /></el-icon>
        {{ passkeyLoading ? t('stepup.passkeyVerifying') : t('stepup.passkeyVerify') }}
      </button>
    </div>

    <p v-if="error" class="stepup-error" role="alert">{{ error }}</p>

    <template #footer>
      <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!code" :loading="loading" @click="submitTotp">
        {{ t('stepup.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Lock } from '@element-plus/icons-vue'
import { stepUpApi, webauthnApi, authApi } from '../../api/index.js'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  verified: []
  cancel: []
}>()

const { t } = useI18n()

const code = ref('')
const loading = ref(false)
const passkeyLoading = ref(false)
const error = ref('')
// 能力检测对齐 Login.vue 先例：浏览器原生支持 + 安全上下文（HTTPS/localhost）
const passkeySupported = ref(window.PublicKeyCredential !== undefined && window.isSecureContext === true)
// 有凭据时才显示 Passkey 按钮（打开时按需探测）
const hasPasskey = ref(false)

/** 凭据响应字段（flat 传给后端，后端组回 credential 校验） */
interface FlatPasskeyCredential {
  credentialId: string
  authenticatorData: string
  signature: string
  clientDataJSON: string
}

/** ArrayBuffer → base64url（旧浏览器无 credential.toJSON() 时兜底） */
function bufToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 打开时重置状态 + 探测管理员 QQ 与 Passkey 凭据 */
watch(() => props.modelValue, async (open) => {
  if (!open) return
  code.value = ''
  error.value = ''
  hasPasskey.value = false
  if (!passkeySupported.value) return
  try {
    // 有凭据才显示按钮（对齐「浏览器支持且有凭据时显示」）
    const creds = await webauthnApi.getCredentials()
    hasPasskey.value = creds.credentials.length > 0
  } catch {
    hasPasskey.value = false
  }
})

function onVerified() {
  emit('verified')
  emit('update:modelValue', false)
}

function cancel() {
  emit('cancel')
  emit('update:modelValue', false)
}

/** TOTP 分支：验证当前登录管理员的动态口令 */
async function submitTotp() {
  const cd = code.value.trim()
  if (!/^\d{6}$/.test(cd)) {
    error.value = t('stepup.codeFormat')
    return
  }
  loading.value = true
  error.value = ''
  try {
    await stepUpApi.verify({ method: 'totp', code: cd })
    onVerified()
  } catch (err) {
    error.value = (err as Error).message || t('stepup.error')
  } finally {
    loading.value = false
  }
}

/** Passkey 分支：复用公开认证流程（login-options → navigator.credentials.get → step-up） */
async function verifyPasskey() {
  passkeyLoading.value = true
  error.value = ''
  try {
    // 当前登录管理员 QQ（/api/auth/me 以服务端为准；profile 可能仍是登录响应的 camelCase 形状）
    const me = await authApi.me()
    const options = await webauthnApi.loginOptions(me.qq_number)
    // 避免直接引用 DOM 类型名（eslint no-undef），从 navigator API 推导请求选项类型
    type CredentialGetOptions = NonNullable<Parameters<typeof navigator.credentials.get>[0]>
    const credential = await navigator.credentials.get({
      publicKey: options as unknown as CredentialGetOptions['publicKey']
    })
    if (!credential) return // 用户取消
    const pubCred = credential as PublicKeyCredential
    const flat = credentialToFlat(pubCred)
    await stepUpApi.verify({ method: 'passkey', ...flat })
    onVerified()
  } catch (err) {
    // 用户主动取消（NotAllowedError / AbortError）静默返回，其余展示错误
    const name = (err as Error)?.name
    if (name === 'NotAllowedError' || name === 'AbortError') return
    error.value = (err as Error).message || t('stepup.error')
  } finally {
    passkeyLoading.value = false
  }
}

/**
 * PublicKeyCredential → flat 字段
 * 优先 credential.toJSON()（现代浏览器返回 base64url 字符串）；
 * 旧浏览器兜底手动转 ArrayBuffer
 */
function credentialToFlat(credential: PublicKeyCredential): FlatPasskeyCredential {
  const withJson = credential as PublicKeyCredential & { toJSON?: () => unknown }
  const json = withJson.toJSON?.()
  if (json) {
    const parsed = json as {
      id: string
      response: { authenticatorData: string; clientDataJSON: string; signature: string }
    }
    return {
      credentialId: parsed.id,
      authenticatorData: parsed.response.authenticatorData,
      signature: parsed.response.signature,
      clientDataJSON: parsed.response.clientDataJSON
    }
  }
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    credentialId: credential.id,
    authenticatorData: bufToBase64Url(response.authenticatorData),
    signature: bufToBase64Url(response.signature),
    clientDataJSON: bufToBase64Url(response.clientDataJSON)
  }
}
</script>

<style scoped>
.stepup-dialog :deep(.el-dialog) {
  border-radius: var(--r-l);
  box-shadow: var(--sh-2);
}
.stepup-desc {
  margin: 0 0 16px;
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
  line-height: 1.7;
}
.stepup-error {
  margin: 12px 0 0;
  color: var(--zs); /* 朱砂：警示语义（对齐 HealthCheck 错误态） */
  font-size: calc(var(--font-scale, 1) * 12.5px);
}
.stepup-passkey {
  margin-top: 4px;
}
.stepup-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 12px);
  margin: 8px 0 12px;
}
.stepup-divider::before,
.stepup-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line2);
}
.stepup-passkey-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  color: var(--ink);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, transform 0.15s ease-out;
}
.stepup-passkey-btn:hover:not(:disabled) {
  border-color: var(--hq);
  background: color-mix(in srgb, var(--hq) 6%, var(--card));
}
.stepup-passkey-btn:active:not(:disabled) {
  transform: scale(0.98);
}
.stepup-passkey-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
