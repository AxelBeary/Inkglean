<template>
  <div class="account-security artist-scope">
    <!-- v127④：标题对齐全站口径（文楷 28/700，同作品管理/主页设置） -->
    <h2 class="font-display page-title">{{ t('account.title') }}</h2>

    <!-- ═══ 账号信息 ═══ -->
    <div class="group">
      <div class="group-head">
        <span>{{ t('account.accountInfo') }}</span>
      </div>
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ t('account.qqLabel') }}</div>
          <div class="desc">
            {{ t('account.profileHint') }}
            <router-link to="/settings" class="link">{{ t('account.profileLink') }}</router-link>
          </div>
        </div>
        <div class="ctrl"><span class="info-value">{{ profile?.qq_number || '-' }}</span></div>
      </div>
    </div>

    <!-- ═══ TOTP ═══ -->
    <div class="group">
      <div class="group-head">
        <span>{{ t('account.totpSection') }}</span>
        <el-tag v-if="totpVerified" type="success" size="small">{{ t('account.totpBound') }}</el-tag>
        <el-tag v-else type="info" size="small">{{ t('account.totpNotBound') }}</el-tag>
      </div>
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ t('account.totpSection') }}</div>
          <div class="desc">{{ t('account.totpRowDesc') }}</div>
        </div>
        <div class="ctrl">
          <!-- 已绑定：显示重绑按钮 -->
          <template v-if="totpVerified">
            <el-button v-if="rebindStep === 'idle'" type="primary" size="small" @click="startRebind" :disabled="rebindCooldownMs > 0">
              {{ t('account.totpRebind') }}
            </el-button>
            <p v-if="rebindCooldownMs > 0" class="cooldown-hint">
              {{ t('account.totpRebindCooldown', { hours: Math.ceil(rebindCooldownMs / 3600000) }) }}
            </p>
          </template>
          <div v-else class="unbound-hints">
            <p class="hint-text">{{ t('errors.TOTP_NOT_BOUND') }}</p>
            <!-- 824: 未绑定状态辅助说明（重置/重绑后的后续指引，措辞中性） -->
            <p class="hint-text hint-sub">{{ t('account.totpResetHint') }}</p>
          </div>
        </div>
      </div>

      <!-- 重绑流程 -->
      <div v-if="totpVerified && rebindStep !== 'idle'" class="rebind-flow">
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

    <!-- ═══ Passkey ═══ -->
    <div class="group">
      <div class="group-head">
        <span>{{ t('account.passkeySection') }}</span>
      </div>
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ t('account.passkeySection') }}</div>
          <div class="desc">{{ t('account.passkeyRowDesc') }}</div>
        </div>
        <div class="ctrl">
          <div v-if="!passkeySupported" class="unsupported-hint">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ t('account.passkeyNotSupported') }}</span>
          </div>

          <template v-else>
            <el-button type="primary" size="small" @click="registerPasskey" :loading="registering" :disabled="registering">
              {{ registering ? t('account.passkeyRegistering') : t('account.passkeyRegister') }}
            </el-button>

            <div v-if="credentials.length === 0 && !loading" class="empty-hint">
              {{ t('account.passkeyEmpty') }}
            </div>
          </template>
        </div>
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
            <el-button v-if="editingId === row.id" text size="small" :loading="savingNameId === row.id" :disabled="savingNameId != null" @click="saveName(row.id)">{{ t('common.save') }}</el-button>
            <el-button v-else text size="small" @click="startEdit(row)">{{ t('common.edit') }}</el-button>
            <el-popconfirm :title="t('account.passkeyDeleteConfirm')" @confirm="deleteCredential(row.id)">
              <template #reference>
                <el-button text size="small" type="danger" :loading="deletingId === row.id" :disabled="deletingId != null">{{ t('account.passkeyDelete') }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- ═══ 桌面端登录设备（H-3：设备账本，本人可撕账移除自己的桌面登录） ═══ -->
    <div class="group">
      <div class="group-head">
        <span>{{ t('account.devicesSection') }}</span>
      </div>
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ t('account.devicesSection') }}</div>
          <div class="desc">{{ t('account.devicesRowDesc') }}</div>
        </div>
      </div>

      <div v-if="devicesLoading" class="loading-hint">
        <el-icon class="loading-icon"><Loading /></el-icon>
      </div>
      <div v-else-if="devicesError" class="devices-error">
        <p class="hint-text">{{ devicesError }}</p>
        <el-button size="small" @click="loadDevices">{{ t('common.loadRetry') }}</el-button>
      </div>
      <template v-else>
        <div v-if="devices.length === 0" class="empty-hint">
          {{ t('account.devicesEmpty') }}
        </div>
        <el-table v-else :data="devices" class="cred-table" size="small">
          <el-table-column :label="t('account.devicesName')" min-width="140">
            <template #default="{ row }">
              <span>{{ row.device_name || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('account.devicesLastActive')" width="150">
            <template #default="{ row }">{{ formatDate(row.last_active_at) }}</template>
          </el-table-column>
          <el-table-column :label="t('account.devicesExpires')" width="150">
            <template #default="{ row }">{{ formatDate(row.expires_at) }}</template>
          </el-table-column>
          <el-table-column :label="t('account.devicesIp')" width="130">
            <template #default="{ row }">{{ row.login_ip || '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="110">
            <template #default="{ row }">
              <el-popconfirm :title="t('account.devicesRemoveConfirm')" @confirm="removeDevice(row.id)">
                <template #reference>
                  <el-button text size="small" type="danger" :loading="removingDeviceId === row.id" :disabled="removingDeviceId != null">{{ t('common.remove') }}</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>

    <!-- ═══ 日历订阅（ICS）——oimimo 吸纳批一：手机日历同步排期与截稿日 ═══ -->
    <div class="group">
      <div class="group-head">
        <span>{{ t('account.feedSection') }}</span>
      </div>
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ t('account.feedTitle') }}</div>
          <div class="desc">{{ t('account.feedDesc') }}</div>
        </div>
        <div class="ctrl">
          <el-switch v-model="feedEnabled" :loading="feedSaving" @change="onFeedToggle" />
        </div>
      </div>
      <div v-if="feedEnabled && feedFullUrl" class="row feed-url-row">
        <div class="field-text">
          <div class="lab">{{ t('account.feedUrlLabel') }}</div>
          <div class="desc">{{ t('account.feedUrlDesc') }}</div>
        </div>
        <div class="ctrl feed-url-ctrl">
          <el-input :model-value="feedFullUrl" readonly size="small" class="feed-url-input" />
          <el-button size="small" @click="copyFeedUrl">{{ t('account.feedCopy') }}</el-button>
          <el-popconfirm :title="t('account.feedRotateConfirm')" @confirm="rotateFeed">
            <template #reference>
              <el-button size="small" :loading="feedRotating">{{ t('account.feedRotate') }}</el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist'
import { webauthnApi, totpRebindApi, calendarFeedApi, artistApi } from '../../api/index'
import { WarningFilled, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { copyText as copyToClipboard } from '../../utils/clipboard'
import {
  toCredentialCreationOptions,
  toCredentialRequestOptions,
  publicKeyCredentialToJSON,
  isBackendError
} from '../../utils/webauthn'
import { usePasskeyCreate, PASSKEY_FLOW_HANDLED } from '../../composables/usePasskeyCreate'
import { REBIND_COOLDOWN_DEFAULT_MS } from '../../constants/account'
import type { WebAuthnCredential, PublicArtistDTO, DesktopDevice } from '../../api/types'

const { t } = useI18n()
const { passkeyCreateFlow } = usePasskeyCreate()
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
/** a1: 改名/删除在途标记——双击/连点防重复请求 */
const savingNameId = ref<number | null>(null)
const deletingId = ref<number | null>(null)
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
  await passkeyCreateFlow(async () => {
    const options = await webauthnApi.registerOptions()
    const credential = await navigator.credentials.create({ publicKey: toCredentialCreationOptions(options) })
    if (!credential) return null
    const pubCred = credential as PublicKeyCredential
    await webauthnApi.registerVerify(publicKeyCredentialToJSON(pubCred))
    await loadCredentials()
    return credential
  }, {
    setBusy: (busy) => { registering.value = busy },
    // 812-B5: 设备已注册 → 刷新列表
    onInvalidState: async () => { await loadCredentials() }
  })
}

function startEdit(row: WebAuthnCredential) {
  editingId.value = row.id
  editName.value = row.device_name || ''
}

async function saveName(id: number) {
  if (!editName.value.trim() || savingNameId.value != null) return
  savingNameId.value = id
  try {
    await webauthnApi.updateCredential(id, editName.value.trim())
    editingId.value = null
    editName.value = ''
    await loadCredentials()
  } catch {
    ElMessage.error(t('account.passkeyRenameFailed'))
  } finally {
    savingNameId.value = null
  }
}

async function deleteCredential(id: number) {
  if (deletingId.value != null) return
  deletingId.value = id
  try {
    await webauthnApi.deleteCredential(id)
    await loadCredentials()
  } catch {
    ElMessage.error(t('account.passkeyDeleteFailed'))
  } finally {
    deletingId.value = null
  }
}

// ─── 桌面端登录设备（H-3：设备账本，本人可撕账移除自己的桌面登录） ───
const devices = ref<DesktopDevice[]>([])
const devicesLoading = ref(false)
const devicesError = ref('')
/** a1 同款在途锁：移除按钮防双击重复请求 */
const removingDeviceId = ref<number | null>(null)

async function loadDevices() {
  devicesLoading.value = true
  devicesError.value = ''
  try {
    const res = await artistApi.getMyDevices()
    devices.value = res.devices
  } catch {
    devicesError.value = t('account.devicesLoadFailed')
  } finally {
    devicesLoading.value = false
  }
}

async function removeDevice(id: number) {
  if (removingDeviceId.value != null) return
  removingDeviceId.value = id
  try {
    await artistApi.revokeMyDevice(id)
    await loadDevices()
  } catch {
    ElMessage.error(t('account.devicesRemoveFailed'))
  } finally {
    removingDeviceId.value = null
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
// passkey 重绑（a1 修复后）：Step1 走登录仪式——loginOptions 拿挑战 + credentials.get 产 assertion，暂存到 confirm 时交后端 verifyLogin
const rebindPasskeyCredential = ref<unknown>(null)

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
        : REBIND_COOLDOWN_DEFAULT_MS
    } else {
      rebindStep.value = 'idle'
      ElMessage.error(t('account.totpRebindFailed'))
    }
  } finally {
    rebindLoading.value = false
  }
}

async function verifyWithPasskey() {
  await passkeyCreateFlow(async () => {
    const qq = profile.value?.qq_number
    if (!qq) {
      ElMessage.error(t('account.totpRebindFailed'))
      return PASSKEY_FLOW_HANDLED
    }
    const options = await webauthnApi.loginOptions(qq)
    const credential = await navigator.credentials.get({ publicKey: toCredentialRequestOptions(options) })
    if (!credential) return null
    rebindPasskeyCredential.value = publicKeyCredentialToJSON(credential as PublicKeyCredential)
    const result = await totpRebindApi.rebindInit()
    // 815 审计 P1-1 修复：无二维码时明示错误，不再渲染残缺表单让用户盲输
    if (result.verifyMethod !== 'passkey' || !result.qrDataUrl) {
      ElMessage.error(t('account.totpRebindFailed'))
      return PASSKEY_FLOW_HANDLED
    }
    rebindQrDataUrl.value = result.qrDataUrl
    rebindTempKey.value = result.tempKey
    rebindStep.value = 'scan'
    return credential
  }, {
    setBusy: (busy) => { rebindLoading.value = busy }
  })
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
      // passkey 路：confirm 携带 Step1 登录仪式 assertion（loginOptions + credentials.get 产出）交后端 verifyLogin；
      // 815 审计 P1-1 修复：同时携带 init 阶段下发的 tempKey，后端消费暂存新密钥
      body.credential = rebindPasskeyCredential.value
      body.tempKey = rebindTempKey.value
    }
    await totpRebindApi.rebindConfirm(body)
    rebindStep.value = 'done'
    // 刷新 store（踢下线后 store 会被清除）
    rebindCooldownMs.value = REBIND_COOLDOWN_DEFAULT_MS
  } catch {
    ElMessage.error(t('account.totpRebindFailed'))
  } finally {
    rebindLoading.value = false
  }
}

// ─── 日历订阅（ICS，oimimo 吸纳批一）───
const feedEnabled = ref(false)
const feedUrlPath = ref<string | null>(null)
const feedSaving = ref(false)
const feedRotating = ref(false)
// 后端只回路径（含令牌），前端拼当前站点 origin 得完整链接（本机/公网自动适配）
const feedFullUrl = computed(() => (feedUrlPath.value ? window.location.origin + feedUrlPath.value : ''))

async function loadFeed() {
  try {
    const res = await calendarFeedApi.get()
    feedEnabled.value = res.enabled
    feedUrlPath.value = res.url
  } catch {
    ElMessage.error(t('account.feedLoadFailed'))
  }
}

async function onFeedToggle(value: boolean | string | number) {
  const next = value === true
  if (feedSaving.value) return
  feedSaving.value = true
  try {
    const res = await calendarFeedApi.setEnabled(next)
    feedEnabled.value = res.enabled
    feedUrlPath.value = res.url
  } catch {
    feedEnabled.value = !next // 失败回滚开关态
    ElMessage.error(t('account.feedToggleFailed'))
  } finally {
    feedSaving.value = false
  }
}

async function copyFeedUrl() {
  if (!feedFullUrl.value) return
  if (await copyToClipboard(feedFullUrl.value)) {
    ElMessage.success(t('account.feedCopied'))
  }
}

async function rotateFeed() {
  if (feedRotating.value) return
  feedRotating.value = true
  try {
    const res = await calendarFeedApi.rotate()
    feedEnabled.value = res.enabled
    feedUrlPath.value = res.url
    ElMessage.success(t('account.feedRotated'))
  } catch {
    ElMessage.error(t('account.feedToggleFailed'))
  } finally {
    feedRotating.value = false
  }
}

// ─── 工具函数 ───
function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  // 817 修复：直链/刷新进入账号页时 store 可能尚无 profile（登录标记在 localStorage，
  // profile 只在登录/仪表盘等路径加载）；补齐拉取，避免账号信息行（如 QQ）误显「-」。
  // Passkey 取消路径本身不触碰 profile，此处只保证展示数据存在，不覆盖既有值。
  if (!store.profile) {
    store.fetchProfile().catch(() => { /* 拉取失败不阻塞页面，行内仍以「-」兜底 */ })
  }
  if (passkeySupported.value) {
    loadCredentials()
  }
  loadFeed()
  loadDevices()
})
</script>

<style scoped>
/* v127④：去居中窄列（原 640px + margin auto），改与主页设置同口径的左对齐 860px 内容带 */
/* 页宽归一批：移除页级限宽 860px，交给 ArtistLayout 内容容器统一管（--page-max-w） */
.account-security {
  max-width: none;
}
.page-title {
  font-size: calc(var(--font-scale, 1) * 28px);
  font-weight: 700;
  margin: 0;
  color: var(--ink);
  letter-spacing: .02em;
}

/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点（v127④：margin 口径对齐其他页 16px 上下） */
.group {
  margin: 16px 0;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.info-value {
  font-size: calc(var(--font-scale, 1) * 15px);
  color: var(--ink);
  font-weight: 600;
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
/* 824: 未绑定辅助说明（次一级字号，不抢主提示） */
.hint-sub {
  margin-top: 8px;
  font-size: calc(var(--font-scale, 1) * 12px);
  line-height: 1.6;
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
/* 桌面设备清单加载失败态：错误文案 + 重试按钮纵向排布 */
.devices-error {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
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

/* 日历订阅（ICS）：链接行控件竖排（输入框+两按钮），窄屏随 row 单列降级 */
.feed-url-ctrl {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
  min-width: 280px;
}
.feed-url-input :deep(.el-input__inner) {
  font-size: calc(var(--font-scale, 1) * 12px);
}

/* 页宽容器查询收尾批：行堆叠断点改认容器宽（ArtistLayout 已设 container-type） */
@container (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .feed-url-ctrl { min-width: 0; }
}
</style>
