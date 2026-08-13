<template>
  <div class="account-security artist-scope">
    <h1 class="page-title">{{ t('account.title') }}</h1>

    <!-- ═══ 账号信息 ═══ -->
    <section class="card-section">
      <div class="card">
        <div class="card-head">
          <el-icon><InfoFilled /></el-icon>
          <span>{{ t('account.accountInfo') }}</span>
        </div>
        <div class="card-body">
          <div class="info-row">
            <span class="info-label">{{ t('account.qqLabel') }}</span>
            <span class="info-value">{{ profile?.qq_number || '-' }}</span>
          </div>
          <p class="info-hint">
            {{ t('account.profileHint') }}
            <router-link to="/settings" class="link">{{ t('account.profileLink') }}</router-link>
          </p>
        </div>
      </div>
    </section>

    <!-- ═══ TOTP ═══ -->
    <section class="card-section">
      <div class="card">
        <div class="card-head">
          <el-icon><Key /></el-icon>
          <span>{{ t('account.totpSection') }}</span>
          <el-tag v-if="totpVerified" type="success" size="small">{{ t('account.totpBound') }}</el-tag>
          <el-tag v-else type="info" size="small">{{ t('account.totpNotBound') }}</el-tag>
        </div>
        <div class="card-body">
          <!-- 已绑定：显示重绑按钮 -->
          <div v-if="totpVerified">
            <el-button v-if="rebindStep === 'idle'" type="primary" size="small" @click="startRebind" :disabled="rebindCooldownMs > 0">
              {{ t('account.totpRebind') }}
            </el-button>
            <p v-if="rebindCooldownMs > 0" class="cooldown-hint">
              {{ t('account.totpRebindCooldown', { hours: Math.ceil(rebindCooldownMs / 3600000) }) }}
            </p>

            <!-- 重绑流程 -->
            <div v-if="rebindStep !== 'idle'" class="rebind-flow">
              <!-- Step 1: 验证身份 -->
              <div v-if="rebindStep === 'verify'" class="rebind-step">
                <h3>{{ t('account.totpRebindStep1') }}</h3>
                <p v-if="rebindMethod === 'passkey'" class="step-hint">{{ t('account.totpRebindPasskeyHint') }}</p>
                <p v-else class="step-hint">{{ t('account.totpRebindCodeHint') }}</p>

                <template v-if="rebindMethod === 'passkey'">
                  <el-button type="primary" @click="verifyWithPasskey" :loading="rebindLoading">
                    {{ t('account.passkeyRegister') }}
                  </el-button>
                </template>
                <template v-else>
                  <el-input v-model="currentCode" :placeholder="t('login.codePlaceholder')" maxlength="6" class="code-input" />
                  <el-button type="primary" @click="verifyWithCode" :loading="rebindLoading" :disabled="currentCode.length !== 6">
                    {{ t('common.confirm') }}
                  </el-button>
                </template>
              </div>

              <!-- Step 2: 扫码 -->
              <div v-if="rebindStep === 'scan'" class="rebind-step">
                <h3>{{ t('account.totpRebindStep2') }}</h3>
                <div v-if="rebindQrDataUrl" class="qr-wrapper">
                  <img :src="rebindQrDataUrl" alt="TOTP QR" class="qr-img" />
                </div>
                <p class="step-hint">{{ t('account.totpRebindNewCodeHint') }}</p>
                <el-input v-model="newCode" :placeholder="t('account.totpRebindNewCodePlaceholder')" maxlength="6" class="code-input" />
                <el-button type="primary" @click="confirmRebind" :loading="rebindLoading" :disabled="newCode.length !== 6">
                  {{ t('account.totpRebindConfirm') }}
                </el-button>
              </div>

              <!-- Step 3: 完成 -->
              <div v-if="rebindStep === 'done'" class="rebind-step">
                <h3>{{ t('account.totpRebindDone') }}</h3>
                <el-alert type="success" :title="t('account.totpRebindSuccess')" :closable="false" show-icon />
              </div>
            </div>
          </div>
          <div v-else>
            <p class="hint-text">{{ t('errors.TOTP_NOT_BOUND') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ Passkey ═══ -->
    <section class="card-section">
      <div class="card">
        <div class="card-head">
          <el-icon><Lock /></el-icon>
          <span>{{ t('account.passkeySection') }}</span>
        </div>
        <div class="card-body">
          <div v-if="!passkeySupported" class="unsupported-hint">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ t('account.passkeyNotSupported') }}</span>
          </div>

          <div v-else>
            <el-button type="primary" size="small" @click="registerPasskey" :loading="registering" :disabled="registering">
              {{ registering ? t('account.passkeyRegistering') : t('account.passkeyRegister') }}
            </el-button>

            <div v-if="credentials.length === 0 && !loading" class="empty-hint">
              {{ t('account.passkeyEmpty') }}
            </div>

            <div v-if="loading" class="loading-hint">
              <el-icon class="loading-icon"><Loading /></el-icon>
            </div>

            <el-table v-if="credentials.length > 0" :data="credentials" class="cred-table" size="small">
              <el-table-column :label="t('account.passkeyDeviceName')" min-width="140">
                <template #default="{ row }">
                  <el-input v-if="editingId === row.id" v-model="editName" size="small" class="edit-name-input" @keyup.enter="saveName(row.id)" />
                  <span v-else>{{ row.device_name || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t('account.passkeyLastUsed')" width="150">
                <template #default="{ row }">
                  {{ row.last_used_at ? formatDate(row.last_used_at) : t('account.passkeyNeverUsed') }}
                </template>
              </el-table-column>
              <el-table-column :label="t('common.actions')" width="140">
                <template #default="{ row }">
                  <el-button v-if="editingId === row.id" text size="small" @click="saveName(row.id)">{{ t('common.save') }}</el-button>
                  <el-button v-else text size="small" @click="startEdit(row)">{{ t('common.edit') }}</el-button>
                  <el-popconfirm :title="t('account.passkeyDeleteConfirm')" @confirm="deleteCredential(row.id)">
                    <template #reference>
                      <el-button text size="small" type="danger">{{ t('account.passkeyDelete') }}</el-button>
                    </template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist.js'
import { webauthnApi, totpRebindApi } from '../../api/index.js'
import { Lock, InfoFilled, Key, WarningFilled, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  toCredentialCreationOptions,
  publicKeyCredentialToJSON,
  isWebAuthnCancellation,
  isWebAuthnUnsupported,
  isBackendError
} from '../../utils/webauthn.js'
import type { WebAuthnCredential, PublicArtistDTO } from '../../api/types.js'

const { t } = useI18n()
const store = useArtistStore()
// JS store 无类型推导，收敛到 PublicArtistDTO（含 qq_number/totp_verified）——诚实断言非 any
const profile = computed(() => (store.profile ?? null) as PublicArtistDTO | null)

// ─── Passkey 支持检测 ───
const passkeySupported = ref(window.PublicKeyCredential !== undefined && window.isSecureContext === true)

// ─── 凭据管理 ───
const credentials = ref<WebAuthnCredential[]>([])
const loading = ref(false)
const registering = ref(false)
const editingId = ref<number | null>(null)
const editName = ref('')

async function loadCredentials() {
  loading.value = true
  try {
    const res = await webauthnApi.getCredentials()
    credentials.value = res.credentials
  } catch {
    ElMessage.error(t('account.passkeyLoadFailed'))
  }
  finally { loading.value = false }
}

async function registerPasskey() {
  registering.value = true
  try {
    const options = await webauthnApi.registerOptions()
    // 812-B5: 后端下发 Base64URL 字符串 → 浏览器要求的 ArrayBuffer（challenge/user.id/excludeCredentials[].id）
    const credential = await navigator.credentials.create({ publicKey: toCredentialCreationOptions(options) })
    if (!credential) {
      ElMessage.info(t('common.passkeyCancelled'))
      return
    }
    const pubCred = credential as PublicKeyCredential
    // 812-B5: 上传侧统一转 base64url JSON（与后端 verifyRegistration 的 Base64URL 解码口径一致）
    await webauthnApi.registerVerify(publicKeyCredentialToJSON(pubCred))
    await loadCredentials()
  } catch (err) {
    if (err instanceof Error && err.name === 'InvalidStateError') {
      // 设备已注册，刷新列表
      await loadCredentials()
      return
    }
    // 812-B5: 取消/不支持/失败一律人话提示，禁止原始英文错误直出
    if (isWebAuthnCancellation(err)) {
      ElMessage.info(t('common.passkeyCancelled'))
      return
    }
    if (isWebAuthnUnsupported(err)) {
      ElMessage.warning(t('common.passkeyNotSupported'))
      return
    }
    ElMessage.error(t('common.passkeyFailed'))
  } finally {
    registering.value = false
  }
}

function startEdit(row: WebAuthnCredential) {
  editingId.value = row.id
  editName.value = row.device_name || ''
}

async function saveName(id: number) {
  if (!editName.value.trim()) return
  try {
    await webauthnApi.updateCredential(id, editName.value.trim())
    editingId.value = null
    editName.value = ''
    await loadCredentials()
  } catch {
    ElMessage.error(t('account.passkeyRenameFailed'))
  }
}

async function deleteCredential(id: number) {
  try {
    await webauthnApi.deleteCredential(id)
    await loadCredentials()
  } catch {
    ElMessage.error(t('account.passkeyDeleteFailed'))
  }
}

// ─── TOTP ───
const totpVerified = computed(() => {
  return profile.value?.totp_verified === 1
})

const rebindStep = ref<'idle' | 'verify' | 'scan' | 'done'>('idle')
const rebindMethod = ref<'passkey' | 'code'>('code')
const rebindLoading = ref(false)
const rebindQrDataUrl = ref<string | null>(null)
const rebindTempKey = ref('')
const currentCode = ref('')
const newCode = ref('')
const rebindCooldownMs = ref(0)

async function startRebind() {
  rebindStep.value = 'verify'
  rebindLoading.value = true
  try {
    const result = await totpRebindApi.rebindInit()
    if (result.verifyMethod === 'passkey') {
      rebindMethod.value = 'passkey'
    } else {
      rebindMethod.value = 'code'
      rebindQrDataUrl.value = result.qrDataUrl
      rebindTempKey.value = result.tempKey
    }
  } catch (err) {
    if (isBackendError(err) && err.code === 'REBIND_COOLDOWN') {
      rebindStep.value = 'idle'
      rebindCooldownMs.value = typeof err.detail?.remainingMs === 'number'
        ? err.detail.remainingMs
        : 24 * 3600000
    } else {
      rebindStep.value = 'idle'
      ElMessage.error(t('account.totpRebindFailed'))
    }
  } finally {
    rebindLoading.value = false
  }
}

async function verifyWithPasskey() {
  rebindLoading.value = true
  try {
    // 使用 Passkey 认证
    const options = await webauthnApi.registerOptions()
    // 812-B5: 后端下发 Base64URL 字符串 → 浏览器要求的 ArrayBuffer（challenge/user.id/excludeCredentials[].id）
    const credential = await navigator.credentials.create({ publicKey: toCredentialCreationOptions(options) })
    if (!credential) {
      ElMessage.info(t('common.passkeyCancelled'))
      return
    }
    const pubCred = credential as PublicKeyCredential
    await webauthnApi.registerVerify(publicKeyCredentialToJSON(pubCred))
    // 初始化重绑（获取新二维码）
    const result = await totpRebindApi.rebindInit()
    rebindQrDataUrl.value = 'qrDataUrl' in result ? result.qrDataUrl : null
    rebindStep.value = 'scan'
  } catch (err) {
    // 812-B5: 取消/不支持/失败一律人话提示，禁止原始英文错误直出
    if (isWebAuthnCancellation(err)) {
      ElMessage.info(t('common.passkeyCancelled'))
      return
    }
    if (isWebAuthnUnsupported(err)) {
      ElMessage.warning(t('common.passkeyNotSupported'))
      return
    }
    ElMessage.error(t('common.passkeyFailed'))
  } finally {
    rebindLoading.value = false
  }
}

async function verifyWithCode() {
  if (currentCode.value.length !== 6) return
  rebindLoading.value = true
  try {
    // 战役审计修复：Step1「验证」真实校验当前码（原虚实现直接进步骤，错码要到 confirm 才暴露）
    await totpRebindApi.verifyCurrent(currentCode.value)
    rebindStep.value = 'scan'
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    rebindLoading.value = false
  }
}

async function confirmRebind() {
  rebindLoading.value = true
  try {
    const body: Record<string, unknown> = { newCode: newCode.value }
    if (rebindMethod.value === 'code') {
      body.tempKey = rebindTempKey.value
      body.code = currentCode.value
    } else {
      // passkey 路径：重新验证一次
    }
    await totpRebindApi.rebindConfirm(body)
    rebindStep.value = 'done'
    // 刷新 store（踢下线后 store 会被清除）
    rebindCooldownMs.value = 24 * 3600000
  } catch {
    ElMessage.error(t('account.totpRebindFailed'))
  } finally {
    rebindLoading.value = false
  }
}

// ─── 工具函数 ───
function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  if (passkeySupported.value) {
    loadCredentials()
  }
})
</script>

<style scoped>
.account-security {
  max-width: 640px;
  margin: 0 auto;
}
.page-title {
  font-family: var(--f-d);
  font-size: calc(var(--font-scale, 1) * 22px);
  font-weight: 400;
  margin: 0 0 24px;
  color: var(--ink);
}
.card-section {
  margin-bottom: 20px;
}
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  overflow: hidden;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  font-size: calc(var(--font-scale, 1) * 14px);
  font-weight: 600;
  color: var(--ink);
}
.card-head .el-icon {
  font-size: 18px;
  color: var(--hq);
}
.card-body {
  padding: 16px;
}
.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.info-label {
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink3);
  min-width: 60px;
}
.info-value {
  font-size: calc(var(--font-scale, 1) * 15px);
  color: var(--ink);
  font-weight: 600;
}
.info-hint {
  margin: 0;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink3);
}
.link {
  color: var(--hq);
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
.hint-text {
  margin: 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink3);
}
.cooldown-hint {
  margin: 8px 0 0;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--zs);
}
.rebind-flow {
  margin-top: 12px;
}
.rebind-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rebind-step h3 {
  margin: 0;
  font-size: calc(var(--font-scale, 1) * 14px);
  font-weight: 600;
}
.step-hint {
  margin: 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink2);
}
.code-input {
  max-width: 200px;
}
.qr-wrapper {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}
.qr-img {
  width: 160px;
  height: 160px;
}
.unsupported-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink3);
}
.unsupported-hint .el-icon {
  font-size: 16px;
  color: var(--th);
}
.empty-hint {
  margin-top: 12px;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink3);
}
.loading-hint {
  padding: 20px 0;
  text-align: center;
}
.loading-icon {
  animation: spin 1s linear infinite;
  font-size: 24px;
  color: var(--ink3);
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.cred-table {
  margin-top: 12px;
}
.edit-name-input {
  max-width: 160px;
}
</style>
