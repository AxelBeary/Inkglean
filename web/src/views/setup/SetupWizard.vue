<template>
  <div class="setup-page">
    <div class="setup-backdrop"></div>
    <div ref="containerRef" class="setup-container">
      <!-- B1: 向导头部文字按钮式中/EN 切换（对齐登录页 LoginPrefs 语言区：文字标签、aria-pressed） -->
      <div class="setup-lang" role="group" :aria-label="$t('setup.step1Lang')">
        <button type="button" :aria-pressed="locale === 'zh-CN'" @click="onSwitchLang('zh-CN')">中</button>
        <button type="button" :aria-pressed="locale === 'en'" @click="onSwitchLang('en')">EN</button>
      </div>
      <div class="setup-steps">
        <button
          v-for="(step, idx) in steps" :key="idx"
          class="step-item"
          :class="{ active: currentStep === idx + 1, done: currentStep > idx + 1 }"
          type="button"
          :disabled="idx + 1 > currentStep"
          :aria-current="currentStep === idx + 1 ? 'step' : undefined"
          @click="goStep(idx + 1)"
        >
          <div class="step-circle">{{ currentStep > idx + 1 ? '\u2713' : idx + 1 }}</div>
          <div class="step-label">{{ $t(step.labelKey) }}</div>
        </button>
      </div>
      <div class="setup-card">
        <div v-if="currentStep === 1" class="step-panel">
          <h1 class="panel-title">{{ $t('setup.step1Title') }}</h1>
          <p class="panel-desc">{{ $t('setup.step1Desc') }}</p>
          <div class="field-group">
            <label class="field-label">{{ $t('setup.step1Lang') }}</label>
            <div class="lang-switch">
              <button :class="{ active: locale === 'zh-CN' }" @click="onSwitchLang('zh-CN')">{{ $t('setup.langZh') }}</button>
              <button :class="{ active: locale === 'en' }" @click="onSwitchLang('en')">{{ $t('setup.langEn') }}</button>
            </div>
          </div>
          <div v-if="setupStore.tokenRequired" class="field-group">
            <label class="field-label">{{ $t('setup.step1TokenLabel') }}</label>
            <input v-model="setupStore.setupToken" type="text" class="field-input" :placeholder="$t('setup.step1TokenPlaceholder')" @keyup.enter="startSetup" />
            <p v-if="tokenError" class="field-error-text">{{ $t('setup.step1TokenError') }}</p>
          </div>
          <button class="btn-primary" @click="startSetup">{{ $t('setup.step1Start') }}</button>
        </div>
        <div v-if="currentStep === 2" class="step-panel">
          <h1 class="panel-title">{{ $t('setup.step2Title') }}</h1>
          <p class="panel-desc">{{ $t('setup.step2Desc') }}</p>
          <!-- 823：前置提醒——下一步扫码绑动态码，先装好验证器 App（画师反馈：没提前让下载 2FA 软件） -->
          <p class="prep-notice">{{ $t('setup.step2Prep') }}</p>
          <div class="field-group">
            <label class="field-label">{{ $t('setup.step2QqLabel') }} <span class="required">*</span></label>
            <input v-model="adminQq" type="text" inputmode="numeric" class="field-input" :placeholder="$t('setup.step2QqPlaceholder')" />
            <p v-if="errQq" class="field-error-text">{{ $t(errQq) }}</p>
          </div>
          <div class="field-group">
            <label class="field-label">{{ $t('setup.step2NameLabel') }} <span class="required">*</span></label>
            <input v-model="adminName" type="text" class="field-input" :placeholder="$t('setup.step2NamePlaceholder')" />
            <p v-if="errName" class="field-error-text">{{ $t(errName) }}</p>
          </div>
          <div class="field-group">
            <label class="field-label-checkbox">
              <input v-model="setupStore.createStudio" type="checkbox" />
              <span>{{ $t('setup.step2StudioLabel') }}</span>
            </label>
          </div>
          <div v-if="setupStore.createStudio" class="studio-fields">
            <div class="field-group">
              <label class="field-label">{{ $t('setup.step2StudioNameLabel') }}</label>
              <input v-model="setupStore.studioName" type="text" class="field-input" :placeholder="$t('setup.step2StudioNamePlaceholder')" />
            </div>
            <div class="field-group">
              <label class="field-label">{{ $t('setup.step2StudioSubdomainLabel') }} <span class="required">*</span></label>
              <input v-model="setupStore.studioSubdomain" type="text" class="field-input" :placeholder="$t('setup.step2StudioSubdomainPlaceholder')" />
              <p v-if="errSubdomain" class="field-error-text">{{ $t(errSubdomain) }}</p>
            </div>
          </div>
          <p v-if="submitError" class="error-banner">{{ submitError }}</p>
          <div class="btn-row">
            <button class="btn-secondary" @click="currentStep = 1">{{ $t('setup.prevStep') }}</button>
            <button class="btn-primary" :disabled="submitting" @click="submitAdmin">{{ submitting ? '...' : $t('setup.step2Submit') }}</button>
          </div>
        </div>
        <div v-if="currentStep === 3" class="step-panel">
          <h1 class="panel-title">{{ $t('setup.step3Title') }}</h1>
          <p class="panel-desc">{{ $t('setup.step3Desc') }}</p>
          <div class="qr-section">
            <div class="qr-wrap">
              <img v-if="qrDataUrl" :src="qrDataUrl" :alt="$t('setup.step3QrAlt')" class="qr-image" />
              <button v-else type="button" class="qr-placeholder" @click="regenerateQr">{{ $t('setup.step3QrRegenerate') }}</button>
            </div>
          </div>
          <!-- 823：验证器安装引导（与登录页/邀请入驻同源 authApp 口径） -->
          <div class="app-help">
            <button class="app-help-toggle" type="button" :aria-expanded="appHelpOpen" @click="appHelpOpen = !appHelpOpen">{{ $t('setup.appHelpToggle') }}</button>
            <div class="app-help-body-wrap" :class="{ open: appHelpOpen }">
              <div class="app-help-body">
                <p>{{ $t('authApp.desc') }}</p>
                <p>{{ $t('authApp.alts') }}</p>
                <p class="app-help-note">{{ $t('authApp.miniProgram') }}</p>
              </div>
            </div>
          </div>
          <div class="field-group">
            <label class="field-label">{{ $t('setup.step3CodeLabel') }}</label>
            <input v-model="totpCode" type="text" inputmode="numeric" maxlength="6" class="field-input code-input" :placeholder="$t('setup.step3CodePlaceholder')" @keyup.enter="confirmTotp" />
            <p v-if="errCode" class="field-error-text">{{ $t(errCode) }}</p>
          </div>
          <p v-if="totpError" class="error-banner">{{ totpError }}</p>
          <div class="btn-row">
            <button class="btn-secondary" @click="currentStep = 2">{{ $t('setup.prevStep') }}</button>
            <button class="btn-primary" :disabled="!totpCode || totpSubmitting" @click="confirmTotp">{{ totpSubmitting ? '...' : $t('setup.step3Confirm') }}</button>
          </div>
        </div>
        <div v-if="currentStep === 4" class="step-panel">
          <div class="done-icon">✔</div>
          <h1 class="panel-title">{{ $t('setup.step4Title') }}</h1>
          <p class="panel-desc">{{ $t('setup.step4Desc') }}</p>
          <div class="done-actions">
            <router-link to="/login" class="btn-primary">{{ $t('setup.step4Login') }}</router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSetupStore } from '../../stores/setup'
import { useArtistStore } from '../../stores/artist'
import { useThemeStore } from '../../stores/theme'
import { useLocaleSwitch } from '../../composables/useLocaleSwitch'

const { t, locale } = useI18n()
const route = useRoute()
const setupStore = useSetupStore()
const artistStore = useArtistStore()
const themeStore = useThemeStore()

const containerRef = ref<HTMLElement | null>(null)
const { switchLang } = useLocaleSwitch(() => containerRef.value)
const onSwitchLang = (next: string) => switchLang(next, locale.value)

const steps = [
  { labelKey: 'setup.step1Title' },
  { labelKey: 'setup.step2Title' },
  { labelKey: 'setup.step3Title' },
  { labelKey: 'setup.step4Title' }
]

const currentStep = computed({
  get: () => setupStore.currentStep,
  set: (v) => { setupStore.currentStep = v }
})

const tokenError = ref(false)
const adminQq = ref('')
const adminName = ref('')
const errQq = ref('')
const errName = ref('')
const errSubdomain = ref('')
const submitting = ref(false)
const submitError = ref('')
const qrDataUrl = ref('')
const totpCode = ref('')
const errCode = ref('')
const totpError = ref('')
const totpSubmitting = ref(false)
// 823：扫码页「还没装验证器 App？」折叠开关（默认收起，不干扰扫码主路径）
const appHelpOpen = ref(false)

function startSetup() {
  if (setupStore.tokenRequired && !setupStore.setupToken) {
    tokenError.value = true
    return
  }
  tokenError.value = false
  currentStep.value = 2
}

async function submitAdmin() {
  errQq.value = ''
  errName.value = ''
  errSubdomain.value = ''
  submitError.value = ''

  if (!adminQq.value.trim()) {
    errQq.value = 'setup.step2QqRequired'
    return
  }
  if (!/^\d{5,15}$/.test(adminQq.value.trim())) {
    errQq.value = 'errors.QQ_FORMAT'
    return
  }
  if (!adminName.value.trim()) {
    errName.value = 'setup.step2NameRequired'
    return
  }
  if (setupStore.createStudio && !setupStore.studioSubdomain.trim()) {
    errSubdomain.value = 'setup.step2SubdomainRequired'
    return
  }
  if (setupStore.createStudio && !/^[a-z0-9-]{2,20}$/.test(setupStore.studioSubdomain.trim())) {
    errSubdomain.value = 'setup.step2SubdomainFormat'
    return
  }

  submitting.value = true
  try {
    const params: Record<string, unknown> = {
      token: setupStore.setupToken || undefined,
      qqNumber: adminQq.value.trim(),
      name: adminName.value.trim()
    }
    if (setupStore.createStudio) {
      params.studio = {
        name: setupStore.studioName.trim() || t('setup.step2StudioNameDefault', { name: adminName.value.trim() }),
        subdomain: setupStore.studioSubdomain.trim()
      }
    }
    const result = await setupStore.submitAdmin(params)
    qrDataUrl.value = await generateQrCode(result.otpauthUri)
    currentStep.value = 3
  } catch (err) {
    submitError.value = (err as Error).message || t('setup.error')
  } finally {
    submitting.value = false
  }
}

async function generateQrCode(otpauthUri: string) {
  try {
    const QRCode = await import('qrcode')
    return await QRCode.default.toDataURL(otpauthUri, { width: 220, margin: 1 })
  } catch (err) {
    // eslint-disable-next-line no-console -- QR 生成失败降级链路，需留痕（零网络约束：不走外网兑底）
    console.error('QR generation failed', err)
    return ''
  }
}

async function regenerateQr() {
  if (setupStore.otpauthUri) {
    qrDataUrl.value = await generateQrCode(setupStore.otpauthUri)
  }
}

async function confirmTotp() {
  errCode.value = ''
  totpError.value = ''

  const code = totpCode.value.trim()
  if (!code) {
    errCode.value = 'setup.step3CodeRequired'
    return
  }
  if (!/^\d{6}$/.test(code)) {
    errCode.value = 'setup.step3CodeFormat'
    return
  }

  totpSubmitting.value = true
  try {
    await setupStore.confirmTotp(code)
    // REQ-043 I6-e: 会话标记统一走 store action（单一数据源；profile 由后续登录补齐）
    artistStore.applySession(null, true)
    currentStep.value = 4
  } catch (err) {
    totpError.value = (err as Error).message || t('setup.step3CodeError')
  } finally {
    totpSubmitting.value = false
  }
}

function goStep(step: number) {
  if (step <= currentStep.value) {
    currentStep.value = step
  }
}

onMounted(() => {
  themeStore.enterArtistScope()
  // 815 拍板 #3（方案 C）：直达链接 /setup?token=xxx——自动填充安装口令免手输；
  // 口令已在第一步则直接进步骤（真实校验仍在第二步后端，错口令会被拒）
  const qToken = route.query.token
  if (typeof qToken === 'string' && qToken.length > 0) {
    setupStore.setupToken = qToken
    if (setupStore.tokenRequired && setupStore.currentStep === 1) {
      setupStore.currentStep = 2
    }
  }
})
</script>

<style scoped>
.setup-page {
  --setup-bg: var(--paper, #F0E6CF);
  --setup-card: var(--paper2, #FFFFFF);
  --setup-line: var(--line, #E5E2DA);
  --setup-ink: var(--ink, #1F1E19);
  --setup-ink2: var(--ink2, #88847A);
  --setup-hq: var(--hq, #2D5F5B);
  --setup-hq-d: var(--hq-d, #1F4340);
  --setup-zs: var(--zs, #A84F4F);
  --setup-sl: var(--sl, #5B8C7A);
  --setup-r-paper: var(--r-paper, 14px);
  position: relative;
  min-height: 100vh;
  font-family: var(--f-b, sans-serif);
  color: var(--setup-ink);
  background: var(--setup-bg);
}
.setup-backdrop { position: fixed; inset: 0; z-index: 0; background: var(--setup-bg); }
.setup-container { position: relative; z-index: 1; max-width: 520px; margin: 0 auto; padding: 48px 20px 64px; }
.setup-lang { display: flex; justify-content: flex-end; gap: 4px; margin-bottom: 16px; }
.setup-lang button {
  padding: 8px;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  color: var(--setup-ink2);
  cursor: pointer;
  transition: color var(--dur-mid) var(--ease-out);
}
.setup-lang button:hover { color: var(--setup-ink); }
.setup-lang button:focus-visible { outline: 2px solid var(--setup-hq); outline-offset: 2px; }
.setup-lang button[aria-pressed='true'] { color: var(--setup-hq); font-weight: 600; }
.setup-steps { display: flex; justify-content: space-between; margin-bottom: 32px; position: relative; }
.setup-steps::before { content: ''; position: absolute; top: 14px; left: 30px; right: 30px; height: 2px; background: var(--setup-line); z-index: 0; }
.step-item { display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; position: relative; z-index: 1; border: 0; background: none; padding: 0; font: inherit; color: inherit; }
.step-item:disabled { cursor: default; }
.step-item:focus-visible { outline: 2px solid var(--setup-hq); outline-offset: 2px; }
.step-circle { width: 28px; height: 28px; border-radius: 50%; background: var(--setup-line); color: var(--setup-ink2); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; transition: all var(--dur-slow) var(--ease-out); }
.step-item.active .step-circle { background: var(--setup-hq); color: #fff; }
.step-item.done .step-circle { background: var(--setup-sl); color: #fff; }
.step-label { font-size: 12px; color: var(--setup-ink); text-align: center; white-space: nowrap; }
.step-item.active .step-label { color: var(--setup-hq); font-weight: 600; }
.setup-card { background: var(--setup-card); border: 1px solid var(--setup-line); border-radius: var(--setup-r-paper); padding: 36px 32px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.step-panel { animation: fadeIn var(--dur-slow) var(--ease-out); }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.panel-title { font-size: 22px; font-weight: 700; margin: 0 0 8px; color: var(--setup-ink); }
.panel-desc { font-size: 14px; color: var(--setup-ink2); margin: 0 0 28px; line-height: 1.6; }
.field-group { margin-bottom: 20px; }
.field-label { display: block; font-size: 13px; font-weight: 600; color: var(--setup-ink); margin-bottom: 6px; }
.field-label .required { color: var(--setup-zs); }
.field-label-checkbox { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; color: var(--setup-ink); }
.field-label-checkbox input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--setup-hq); }
.field-input { width: 100%; padding: 10px 12px; border: 1px solid var(--setup-line); border-radius: 8px; background: transparent; font-size: 14px; color: var(--setup-ink); transition: border-color var(--dur-mid); box-sizing: border-box; }
.field-input:focus { outline: none; border-color: var(--setup-hq); }
.field-input::placeholder { color: var(--setup-ink2); opacity: 0.7; }
.code-input { font-size: 20px; letter-spacing: 6px; text-align: center; }
.field-error-text { margin: 4px 0 0; font-size: 12px; color: var(--setup-zs); }
.lang-switch { display: flex; gap: 8px; }
.lang-switch button { padding: 6px 20px; border: 1px solid var(--setup-line); border-radius: 20px; background: transparent; color: var(--setup-ink); font-size: 13px; cursor: pointer; transition: all var(--dur-mid); }
.lang-switch button.active { background: var(--setup-hq); color: #fff; border-color: var(--setup-hq); }
.btn-primary { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 12px 0; border: 0; border-radius: var(--setup-r-paper); background: var(--setup-hq); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; transition: background var(--dur-mid); text-decoration: none; }
.btn-primary:hover:not(:disabled) { background: var(--setup-hq-d); }
.btn-primary:disabled { opacity: 0.6; cursor: default; }
.btn-secondary { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; border: 1px solid var(--setup-line); border-radius: var(--setup-r-paper); background: transparent; color: var(--setup-ink); font-size: 15px; cursor: pointer; transition: all var(--dur-mid); }
.btn-secondary:hover { border-color: var(--setup-hq); color: var(--setup-hq); }
.btn-row { display: flex; gap: 12px; margin-top: 24px; }
.btn-row .btn-primary, .btn-row .btn-secondary { flex: 1; }
.qr-section { display: flex; justify-content: center; margin: 16px 0 24px; }
.qr-wrap { display: flex; justify-content: center; align-items: center; }
.qr-image { width: 200px; height: 200px; border: 1px solid var(--setup-line); border-radius: 8px; }
.qr-placeholder { width: 200px; height: 200px; border: 2px dashed var(--setup-line); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--setup-ink2); cursor: pointer; font-size: 14px; background: transparent; font-family: inherit; }
.qr-placeholder:focus-visible { outline: 2px solid var(--setup-hq); outline-offset: 2px; }
.error-banner { margin: 12px 0 0; padding: 10px 14px; background: rgba(168, 79, 79, 0.08); border: 1px solid rgba(168, 79, 79, 0.2); border-radius: 8px; color: var(--setup-zs); font-size: 13px; }
.done-icon { font-size: 48px; text-align: center; margin-bottom: 16px; color: var(--setup-sl); }
.done-actions { margin-top: 28px; }
.done-actions .btn-primary { display: block; text-align: center; }
.studio-fields { padding: 16px; background: rgba(0,0,0,0.02); border-radius: 8px; margin-bottom: 8px; }
/* 823：前置提醒（虚线纸签，与向导卡内柔和底色同手法） */
.prep-notice {
  margin: -16px 0 24px;
  padding: 12px 14px;
  border: 1px dashed var(--setup-line);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--setup-ink2);
}
/* 823：验证器安装引导折叠（与登录页 .help 同款交互，默认收起） */
.app-help { margin: 0 0 20px; }
.app-help-toggle {
  width: 100%;
  padding: 8px 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  color: var(--setup-ink2);
  cursor: pointer;
  text-align: center;
  transition: color var(--dur-mid) var(--ease-out);
}
.app-help-toggle:hover { color: var(--setup-ink); }
.app-help-toggle:focus-visible { outline: 2px solid var(--setup-hq); outline-offset: 2px; }
.app-help-toggle::after { content: '＋'; margin-left: 8px; opacity: 0.6; }
.app-help-toggle[aria-expanded='true']::after { content: '－'; }
.app-help-body-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.32s var(--ease-out); }
.app-help-body-wrap.open { grid-template-rows: 1fr; }
.app-help-body {
  overflow: hidden;
  min-height: 0;
  opacity: 0;
  transition: opacity 0.28s var(--ease-out);
  font-size: 12px;
  color: var(--setup-ink2);
  line-height: 1.8;
  text-align: left;
}
.app-help-body-wrap.open .app-help-body { opacity: 1; padding-top: 8px; }
.app-help-body p { margin: 0 0 8px; }
.app-help-note { opacity: 0.8; }
</style>
