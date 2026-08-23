<template>
  <div class="login-page" :data-daypart="daypart" :style="{ '--lg-tex': `url(${paperTexUrl})` }">
    <!-- 纸墨登录页（2026-08-10 重构）：远山为幕 / 纸叠卡 / 墨线输入 / 克制动效（一次性、不循环）
         结构：LoginBackdrop（远山+季节背景）· PaperCard（纸叠卡壳）· LoginPrefs（主题/语言）
         全局 token（@property / 550ms 主题缓动 / 手剪圆角族）已迁入 artist-tokens.css「纸艺基线」节 -->

    <LoginBackdrop />

    <div class="scene">
      <PaperCard ref="paperCardRef">
        <LoginPrefs class="rise rise-1" @switch-lang="onSwitchLang" />

        <!-- 品牌区：logo（用户后续替换，保留引用）+ 拾绘（文楷）+ 副标 -->
        <div class="brand rise rise-2">
          <img class="brand-logo" :src="logoUrl" alt="" aria-hidden="true">
          <h1 id="login-title" class="brand-title">{{ t('login.brandTitle') }}</h1>
          <p class="brand-sub">{{ t('login.subtitle') }}</p>
        </div>

        <!-- 824: TOTP 绑定失效提示（401 TOTP_BIND_REQUIRED 跳登录页前写旗标，挂载消费展示后清除；藤黄纸签：醒目不惊悚） -->
        <p v-if="bindNotice" class="notice notice-bind" role="alert">{{ bindNotice }}</p>

        <!-- REQ-027: QQ 号 + TOTP 动态口令（机制不变，错误内联朱砂一行，不弹 toast） -->
        <form class="rise rise-3" novalidate @submit.prevent="login">
          <div class="field" :class="{ 'field-error': errQq }">
            <label class="field-label" for="login-qq">{{ t('login.qqLabel') }}</label>
            <input
              id="login-qq" v-model="qqNumber" class="field-input" type="text" inputmode="numeric"
              autocomplete="username" :placeholder="t('login.qqPlaceholder')"
              :disabled="logging" :aria-invalid="errQq" :aria-describedby="errQq ? 'login-notice' : undefined"
              @input="errQq = false"
            >
          </div>

          <!-- REQ-040: Passkey login button -->
          <div v-if="passkeySupported" class="passkey-section">
            <button class="passkey-btn" type="button" :disabled="logging || loginOk" @click="passkeyLogin">
              <el-icon><Lock /></el-icon>
              {{ passkeyLogging ? t('login.passkeyLogging') : t('login.passkeyLogin') }}
            </button>
            <div class="passkey-divider"><span>{{ t('common.or') }}</span></div>
          </div>

          <div class="field" :class="{ 'field-error': errCode }">
            <label class="field-label" for="login-code">{{ t('login.codeLabel') }}</label>
            <input
              id="login-code" v-model="code" class="field-input" type="text" inputmode="numeric"
              maxlength="6" autocomplete="one-time-code" :placeholder="t('login.codePlaceholder')"
              :disabled="logging" :aria-invalid="errCode" :aria-describedby="errCode ? 'login-notice' : undefined"
              @input="errCode = false"
            >
          </div>

          <button class="login-btn" :class="{ 'is-ok': loginOk }" type="submit" :disabled="logging || loginOk">
            <span v-if="logging" class="btn-spinner" aria-hidden="true"></span>
            {{ loginOk ? t('login.loginSuccess') : logging ? t('login.logging') : t('login.login') }}
          </button>

          <p v-if="noticeError" id="login-notice" class="notice notice-error" role="alert">{{ noticeError }}</p>
          <p v-if="loginOk" class="sr-only" role="status">{{ t('login.loginSuccess') }}</p>
        </form>

        <!-- 帮助：验证器推荐（button + grid-rows 0fr→1fr 展开动画） -->
        <div class="help rise rise-4">
          <button
            id="login-help-toggle" class="help-toggle" type="button"
            :aria-expanded="helpOpen" aria-controls="login-help-body"
            @click="helpOpen = !helpOpen"
          >
            {{ t('login.helpTitle') }}
          </button>
          <div id="login-help-body" class="help-body-wrap" :class="{ open: helpOpen }">
            <div class="help-body">
              <!-- 823：推荐口径统一走 authApp 单一事实源（主推/商店搜索/备选/小程序免责） -->
              <p>{{ t('login.helpDesc') }}</p>
              <p>{{ t('authApp.desc') }}</p>
              <p>{{ t('authApp.alts') }}</p>
              <p class="help-note">{{ t('authApp.miniProgram') }}</p>
              <p class="help-note">{{ t('login.helpNote') }}</p>
            </div>
          </div>
        </div>

        <!-- REQ-039: 邀请码入驻入口（onboarding_mode=invite 时显示；纯增量，不动登录结构） -->
        <button
          v-if="inviteEnabled && !inviteView"
          ref="inviteEntryRef" class="invite-entry rise rise-4" type="button"
          @click="openInvite"
        >
          {{ t('invite.entry') }}
        </button>

        <!-- REQ-039: 入驻叠加层（两步：信息表单 → TOTP 首绑；覆盖卡片，v0.49 冻结页最小增量） -->
        <div
          v-if="inviteView" ref="inviteOverlayRef"
          class="invite-overlay" role="dialog" aria-modal="true" :aria-label="t('invite.title')"
          @keydown.tab="onInviteKeydown"
        >
          <div class="invite-overlay-inner">
            <button class="invite-back" type="button" @click="closeInvite">← {{ t('invite.back') }}</button>
            <h2 class="invite-title">{{ t('invite.title') }}</h2>
            <p class="invite-sub">{{ t('invite.subtitle') }}</p>

            <!-- 步骤 1：入驻信息 -->
            <form v-if="inviteStep === 1" novalidate @submit.prevent="submitInvite">
              <!-- 823：前置提醒——提前说清要装验证器 App（画师反馈：注册时没提前让下载 2FA 软件） -->
              <p class="invite-prep">{{ t('invite.prepNotice') }}</p>
              <div class="field" :class="{ 'field-error': inviteErrCode }">
                <label class="field-label" for="invite-code">{{ t('invite.codeLabel') }}</label>
                <input
                  id="invite-code" v-model="invCode" class="field-input" type="text"
                  maxlength="8" autocomplete="off" :placeholder="t('invite.codePlaceholder')"
                  :disabled="inviteSubmitting" @input="inviteErrCode = false"
                >
              </div>
              <div class="field" :class="{ 'field-error': inviteErrQq }">
                <label class="field-label" for="invite-qq">{{ t('invite.qqLabel') }}</label>
                <input
                  id="invite-qq" v-model="invQq" class="field-input" type="text" inputmode="numeric"
                  autocomplete="username" :placeholder="t('invite.qqPlaceholder')"
                  :disabled="inviteSubmitting" @input="inviteErrQq = false"
                >
              </div>
              <div class="field" :class="{ 'field-error': inviteErrName }">
                <label class="field-label" for="invite-name">{{ t('invite.nameLabel') }}</label>
                <input
                  id="invite-name" v-model="invName" class="field-input" type="text"
                  autocomplete="nickname" :placeholder="t('invite.namePlaceholder')"
                  :disabled="inviteSubmitting" @input="inviteErrName = false"
                >
              </div>
              <div class="field" :class="{ 'field-error': inviteErrSub }">
                <label class="field-label" for="invite-subdomain">{{ t('invite.subdomainLabel') }}</label>
                <input
                  id="invite-subdomain" v-model="invSubdomain" class="field-input" type="text"
                  autocomplete="off" :placeholder="t('invite.subdomainPlaceholder')"
                  :disabled="inviteSubmitting" @input="inviteErrSub = false"
                >
                <p class="field-hint">{{ t('invite.subdomainHint') }}</p>
              </div>
              <button class="login-btn" type="submit" :disabled="inviteSubmitting">
                <span v-if="inviteSubmitting" class="btn-spinner" aria-hidden="true"></span>
                {{ inviteSubmitting ? t('invite.submitting') : t('invite.submit') }}
              </button>
              <p v-if="inviteError" class="notice notice-error" role="alert">{{ inviteError }}</p>
            </form>

            <!-- 步骤 2：TOTP 首绑（复用 SetupWizard 同款二维码生成） -->
            <div v-else>
              <p class="invite-step-title">{{ t('invite.step2Title') }}</p>
              <p class="invite-step-desc">{{ t('invite.step2Desc') }}</p>
              <!-- 824: 防刷新提示（藤黄纸签，醒目但不惊悚） -->
              <p class="invite-warn">{{ t('invite.noRefreshNotice') }}</p>
              <div class="invite-qr-wrap">
                <img v-if="inviteQr" :src="inviteQr" :alt="t('invite.qrAlt')" class="invite-qr" />
              </div>
              <!-- 823：验证器安装引导（复用登录页帮助折叠同款交互，口径同源 authApp） -->
              <div class="help app-help">
                <button
                  class="help-toggle" type="button"
                  :aria-expanded="inviteAppHelpOpen"
                  @click="inviteAppHelpOpen = !inviteAppHelpOpen"
                >
                  {{ t('invite.appHelpToggle') }}
                </button>
                <div class="help-body-wrap" :class="{ open: inviteAppHelpOpen }">
                  <div class="help-body">
                    <p>{{ t('authApp.desc') }}</p>
                    <p>{{ t('authApp.alts') }}</p>
                    <p class="help-note">{{ t('authApp.miniProgram') }}</p>
                  </div>
                </div>
              </div>
              <div class="field" :class="{ 'field-error': !!inviteError && inviteErrTotp }">
                <label class="field-label" for="invite-totp">{{ t('invite.totpCodeLabel') }}</label>
                <input
                  id="invite-totp" v-model="inviteTotpCode" class="field-input" type="text" inputmode="numeric"
                  maxlength="6" autocomplete="one-time-code" :placeholder="t('invite.totpCodePlaceholder')"
                  :disabled="inviteConfirming || inviteTotpOk" @input="inviteErrTotp = false"
                >
                <!-- v126①：新手引导——码 30 秒轮换机制人话说明，降低「超时」错觉 -->
                <p class="invite-totp-guide">{{ t('invite.totpGuide') }}</p>
              </div>
              <button
                class="login-btn" :class="{ 'is-ok': inviteTotpOk }" type="button"
                :disabled="inviteConfirming || inviteTotpOk" @click="confirmInviteTotp"
              >
                <span v-if="inviteConfirming" class="btn-spinner" aria-hidden="true"></span>
                {{ inviteTotpOk ? t('invite.success') : inviteConfirming ? t('invite.confirming') : t('invite.totpConfirm') }}
              </button>
              <p v-if="inviteError" class="notice notice-error" role="alert">{{ inviteError }}</p>
            </div>

            <!-- 824: 首绑找回入口（刷新丢失状态时的续绑通道；步骤 1/2 均可用，复用帮助折叠同款交互） -->
            <div class="help invite-recover">
              <button
                id="invite-recover-toggle" class="help-toggle" type="button"
                :aria-expanded="recoverOpen" aria-controls="invite-recover-body"
                @click="recoverOpen = !recoverOpen"
              >
                {{ t('invite.recoverToggle') }}
              </button>
              <div id="invite-recover-body" class="help-body-wrap" :class="{ open: recoverOpen }">
                <div class="help-body">
                  <p class="invite-recover-desc">{{ t('invite.recoverDesc') }}</p>
                  <form novalidate @submit.prevent="submitRecover">
                    <div class="field" :class="{ 'field-error': recoverErrQq }">
                      <label class="field-label" for="recover-qq">{{ t('invite.qqLabel') }}</label>
                      <input
                        id="recover-qq" v-model="recoverQq" class="field-input" type="text" inputmode="numeric"
                        autocomplete="username" :placeholder="t('invite.qqPlaceholder')"
                        :disabled="recoverSubmitting" :aria-invalid="recoverErrQq" @input="recoverErrQq = false"
                      >
                    </div>
                    <div class="field" :class="{ 'field-error': recoverErrCode }">
                      <label class="field-label" for="recover-code">{{ t('invite.totpCodeLabel') }}</label>
                      <input
                        id="recover-code" v-model="recoverCode" class="field-input" type="text" inputmode="numeric"
                        maxlength="6" autocomplete="one-time-code" :placeholder="t('invite.totpCodePlaceholder')"
                        :disabled="recoverSubmitting" :aria-invalid="recoverErrCode" @input="recoverErrCode = false"
                      >
                    </div>
                    <button class="login-btn" type="submit" :disabled="recoverSubmitting || recoverOk">
                      <span v-if="recoverSubmitting" class="btn-spinner" aria-hidden="true"></span>
                      {{ recoverOk ? t('invite.success') : recoverSubmitting ? t('invite.confirming') : t('invite.recoverSubmit') }}
                    </button>
                    <p v-if="recoverOk" class="notice notice-ok" role="status">{{ t('invite.success') }}</p>
                    <p v-else-if="recoverError" class="notice notice-error" role="alert">{{ recoverError }}</p>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PaperCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist'
import { useLocaleSwitch } from '../../composables/useLocaleSwitch'
import LoginBackdrop from '../../components/artist/login/LoginBackdrop.vue'
import PaperCard from '../../components/artist/login/PaperCard.vue'
import LoginPrefs from '../../components/artist/login/LoginPrefs.vue'
import { inviteApi } from '../../api/index'
import paperTexUrl from '../../assets/paper-tex.webp'
import logoUrl from '../../assets/logo.webp'
import { Lock } from '@element-plus/icons-vue'
import {
  toCredentialRequestOptions,
  publicKeyCredentialToJSON,
  isWebAuthnCancellation,
  isWebAuthnUnsupported,
  isBackendError
} from '../../utils/webauthn'
import {
  saveInviteTotpProgress,
  loadInviteTotpProgress,
  clearInviteTotpProgress,
  takeTotpBindRequiredNotice,
  clearTotpBindRequiredNotice
} from '../../utils/inviteProgress'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useArtistStore()

/** 登录成功跳转：消费守卫带来的 ?redirect=（限站内路径，防开放跳转），兜底统一落地画师面板；停留 500ms 让用户看见成功反馈 */
function goAfterLogin(route: RouteLocationNormalizedLoaded) {
  const redirect = route.query.redirect
  // 812-B6: 管理员与普通画师默认落地一致为画师面板；手动访问 /admin 由 requiresAdmin 守卫放行
  const target = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/dashboard'
  setTimeout(() => router.push(target), 500)
}

// 纸墨 token 作用域由路由守卫统一接管（login/dashboard 同属后台作用域，
// 过渡全程 attr 不摘——组件内 onUnmounted 摘除会与守卫竞态，造成墨黑登录闪白，已移除）

/** 时辰底色：按真实时间定纸白底色的色温（晨微暖/午标准/暮暖深/夜微冷），
 *  配合 CSS light-drift 一次性超慢漂移（不循环，宪法动效纪律）；墨黑主题不参与 */
const hours = new Date().getHours()
const daypart = hours >= 5 && hours < 10 ? 'morning' : hours >= 16 && hours < 20 ? 'dusk' : (hours >= 20 || hours < 5) ? 'night' : 'noon'

const passkeySupported = ref(window.PublicKeyCredential !== undefined && window.isSecureContext === true)
const passkeyLogging = ref(false)
const qqNumber = ref('')
const code = ref('')
const logging = ref(false)
const loginOk = ref(false)
const helpOpen = ref(false)
// 823：入驻扫码页「还没装验证器 App？」折叠开关（与登录页 helpOpen 同款交互，状态独立）
const inviteAppHelpOpen = ref(false)
const errQq = ref(false)
const errCode = ref(false)
const noticeError = ref('')
const paperCardRef = ref<InstanceType<typeof PaperCard> | null>(null)
const inviteEntryRef = ref<HTMLButtonElement | null>(null)
const inviteOverlayRef = ref<HTMLDivElement | null>(null)

/** 后端 API 错误形状（code/detail 附在抛出的错误对象上）：仅用于 catch 内分支读取 */
interface ApiErrShape {
  code?: string
  message: string
  detail?: { stale?: boolean; remainingAttempts?: number; remainingLockMs?: number }
}

// ─── REQ-039: 邀请码入驻叠加层 ───
const inviteEnabled = ref(false)
const inviteView = ref(false)
const inviteStep = ref(1)
const invCode = ref('')
const invQq = ref('')
const invName = ref('')
const invSubdomain = ref('')
const inviteSubmitting = ref(false)
const inviteError = ref('')
const inviteErrCode = ref(false)
const inviteErrQq = ref(false)
const inviteErrName = ref(false)
const inviteErrSub = ref(false)
const inviteQr = ref('')
const inviteTotpCode = ref('')
const inviteErrTotp = ref(false)
const inviteConfirming = ref(false)
const inviteTotpOk = ref(false)
// 824: TOTP 绑定失效提示（401 TOTP_BIND_REQUIRED 跳登录页前写旗标，挂载时消费展示，展示后清除）
const bindNotice = ref('')
// 824: 首绑找回入口（刷新丢状态后的续绑通道：QQ + 6 位码直调 totp-confirm）
const recoverOpen = ref(false)
const recoverQq = ref('')
const recoverCode = ref('')
const recoverSubmitting = ref(false)
const recoverErrQq = ref(false)
const recoverErrCode = ref(false)
const recoverError = ref('')
const recoverOk = ref(false)

const { switchLang } = useLocaleSwitch(() => paperCardRef.value?.getCardEl())
const onSwitchLang = (next: string) => switchLang(next, locale.value)

onMounted(async () => {
  // 824: 消费绑定失效旗标（401 TOTP_BIND_REQUIRED 跳转前写入；展示后清除，只展示一次）
  if (takeTotpBindRequiredNotice()) {
    bindNotice.value = t('errors.TOTP_BIND_REQUIRED')
  }
  // 824: 防刷新——恢复进行中的首绑第 2 步（建号已成功但绑定未完成）；
  // 不依赖入驻入口开关：账号既已创建，即使入驻关闭也恢复二维码页续绑
  const progress = loadInviteTotpProgress()
  if (progress) {
    invQq.value = progress.qqNumber
    // 找回入口预填 QQ，刷新后少填一项
    recoverQq.value = progress.qqNumber
    inviteView.value = true
    inviteStep.value = 2
    inviteQr.value = await generateInviteQr(progress.otpauthUri)
  }
  // REQ-039: 入驻模式判定（manual 时登录页不显示入口）
  try {
    const res = await inviteApi.status()
    inviteEnabled.value = res.enabled
  } catch { /* 状态查询失败静默——入口不显示，登录不受影响 */ }
})

function openInvite() {
  inviteView.value = true
  inviteStep.value = 1
  resetInviteErrors()
  // 初始聚焦：进入叠加层后聚焦第一个可输入控件
  nextTick(() => {
    const codeInput = inviteOverlayRef.value?.querySelector('#invite-code') as HTMLElement | null
    ;(codeInput || inviteOverlayRef.value?.querySelector('input, button') as HTMLElement | null)?.focus()
  })
}

function closeInvite() {
  inviteView.value = false
  invCode.value = ''
  invQq.value = ''
  invName.value = ''
  invSubdomain.value = ''
  inviteQr.value = ''
  inviteTotpCode.value = ''
  inviteStep.value = 1
  resetInviteErrors()
  inviteTotpOk.value = false
  // 824: 用户主动关闭叠加层 → 清防刷新状态与找回表单状态（拍板口径；找回入口可再次展开重新填写）
  clearInviteTotpProgress()
  recoverOpen.value = false
  recoverQq.value = ''
  recoverCode.value = ''
  recoverError.value = ''
  recoverErrQq.value = false
  recoverErrCode.value = false
  recoverOk.value = false
  // 回焦：关闭叠加层后焦点还给「邀请码入驻」入口按钮
  inviteEntryRef.value?.focus()
}

/** b1: 邀请流程错误状态清零（openInvite/closeInvite/两步提交共用） */
function resetInviteErrors() {
  inviteError.value = ''
  inviteErrCode.value = false
  inviteErrQq.value = false
  inviteErrName.value = false
  inviteErrSub.value = false
  inviteErrTotp.value = false
}

/** 焦点圈闭：Tab 不离开叠加层（首尾循环） */
function onInviteKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const overlay = inviteOverlayRef.value
  if (!overlay) return
  const focusables = ([...overlay.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )] as Array<HTMLElement & { disabled?: boolean }>).filter(el => !el.disabled && el.offsetParent !== null)
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

/** 两步表单切换后聚焦对应输入框 */
watch(inviteStep, (step) => {
  if (!inviteView.value) return
  nextTick(() => {
    const sel = step === 1 ? '#invite-code' : '#invite-totp'
    ;(inviteOverlayRef.value?.querySelector(sel) as HTMLElement | null)?.focus()
  })
})

async function generateInviteQr(otpauthUri: string) {
  try {
    const QRCode = await import('qrcode')
    return await QRCode.default.toDataURL(otpauthUri, { width: 220, margin: 1 })
  } catch { return '' }
}

async function submitInvite() {
  resetInviteErrors()

  const code = invCode.value.trim()
  const qq = invQq.value.trim()
  const name = invName.value.trim()
  const subdomain = invSubdomain.value.trim().toLowerCase()

  if (!code) {
    inviteErrCode.value = true
    inviteError.value = t('invite.codeRequired')
    return
  }
  if (!/^[A-Za-z0-9]{8}$/.test(code)) {
    inviteErrCode.value = true
    inviteError.value = t('invite.codeFormat')
    return
  }
  if (!qq) {
    inviteErrQq.value = true
    inviteError.value = t('invite.qqRequired')
    return
  }
  if (!/^\d+$/.test(qq)) {
    inviteErrQq.value = true
    inviteError.value = t('invite.qqInvalid')
    return
  }
  if (!name) {
    inviteErrName.value = true
    inviteError.value = t('invite.nameRequired')
    return
  }
  if (!subdomain) {
    inviteErrSub.value = true
    inviteError.value = t('invite.subdomainRequired')
    return
  }
  if (!/^[a-z0-9]{2,20}$/.test(subdomain)) {
    inviteErrSub.value = true
    inviteError.value = t('invite.subdomainFormat')
    return
  }

  inviteSubmitting.value = true
  try {
    const res = await inviteApi.register({ code, qqNumber: qq, name, subdomain })
    // 824: 防刷新——进行中状态落 sessionStorage（QQ + 二维码源），刷新后直接恢复到本页
    saveInviteTotpProgress({ qqNumber: qq, otpauthUri: res.otpauthUri })
    inviteQr.value = await generateInviteQr(res.otpauthUri)
    inviteStep.value = 2
  } catch (err) {
    inviteError.value = (err as ApiErrShape).message || t('invite.totpError')
  } finally {
    inviteSubmitting.value = false
  }
}

async function confirmInviteTotp() {
  resetInviteErrors()

  const code = inviteTotpCode.value.trim()
  if (!code) {
    inviteErrTotp.value = true
    inviteError.value = t('invite.totpRequired')
    return
  }
  if (!/^\d{6}$/.test(code)) {
    inviteErrTotp.value = true
    inviteError.value = t('invite.totpFormat')
    return
  }

  inviteConfirming.value = true
  try {
    const res = await inviteApi.totpConfirm({ qqNumber: invQq.value.trim(), code })
    // 会话 cookie 已由后端签发；REQ-043 I6-e: 状态与标记统一走 store.applySession
    store.applySession(res.artist, false)
    // 824: 绑定完成 → 清防刷新状态
    clearInviteTotpProgress()
    inviteTotpOk.value = true
    setTimeout(() => router.push('/dashboard'), 500)
  } catch (err) {
    inviteErrTotp.value = true
    inviteError.value = mapInviteTotpErr(err)
  } finally {
    inviteConfirming.value = false
  }
}

/** v126②③：首绑确认失败文案分流（detail 由后端 invite/totp-confirm 提供，与登录锁定提示同口径）：
 *  码刚轮换 → 等它转完再试；码输错 → 带剩余次数；锁定 → 带剩余分钟数（均只写可验证事实） */
function mapInviteTotpErr(err: unknown) {
  const e = err as ApiErrShape
  if (e?.code === 'TOTP_BIND_INVALID' && e.detail && typeof e.detail === 'object') {
    if (e.detail.stale) return t('invite.totpStale')
    if (typeof e.detail.remainingAttempts === 'number') {
      return t('invite.totpWrong', { n: e.detail.remainingAttempts })
    }
  }
  if (e?.code === 'TOTP_LOCKED' && e.detail?.remainingLockMs) {
    return t('invite.totpLockedMin', { minutes: Math.ceil(e.detail.remainingLockMs / 60000) })
  }
  return e.message || t('invite.totpError')
}

/** 824: 找回入口——QQ + 6 位码直调 totp-confirm（该接口只需这两个字段，无需邀请码）；
 *  成功走与正常首绑一致的会话落地与跳转；错误分流复用 mapInviteTotpErr（stale/剩余次数/锁定） */
async function submitRecover() {
  recoverError.value = ''
  recoverErrQq.value = false
  recoverErrCode.value = false
  recoverOk.value = false

  const qq = recoverQq.value.trim()
  const totpCode = recoverCode.value.trim()
  if (!qq) {
    recoverErrQq.value = true
    recoverError.value = t('invite.qqRequired')
    return
  }
  if (!/^\d+$/.test(qq)) {
    recoverErrQq.value = true
    recoverError.value = t('invite.qqInvalid')
    return
  }
  if (!totpCode) {
    recoverErrCode.value = true
    recoverError.value = t('invite.totpRequired')
    return
  }
  if (!/^\d{6}$/.test(totpCode)) {
    recoverErrCode.value = true
    recoverError.value = t('invite.totpFormat')
    return
  }

  recoverSubmitting.value = true
  try {
    const res = await inviteApi.totpConfirm({ qqNumber: qq, code: totpCode })
    // 与正常首绑成功同路径：清防刷新状态 + applySession + 停留 500ms 跳转
    clearInviteTotpProgress()
    store.applySession(res.artist, false)
    recoverOk.value = true
    inviteTotpOk.value = true
    setTimeout(() => router.push('/dashboard'), 500)
  } catch (err) {
    recoverErrCode.value = true
    recoverError.value = mapInviteTotpErr(err)
  } finally {
    recoverSubmitting.value = false
  }
}

async function passkeyLogin() {
  noticeError.value = ''
  const qq = qqNumber.value.trim()
  if (!qq) {
    errQq.value = true
    noticeError.value = t('login.enterQq')
    return
  }
  if (!/^\d+$/.test(qq)) {
    errQq.value = true
    noticeError.value = t('login.qqInvalid')
    return
  }

  passkeyLogging.value = true
  try {
    const { webauthnApi } = await import('../../api/index')
    const options = await webauthnApi.loginOptions(qq)
    // 812-B5: 后端下发 Base64URL 字符串 → 浏览器要求的 ArrayBuffer（challenge/allowCredentials[].id）
    const credential = await navigator.credentials.get({ publicKey: toCredentialRequestOptions(options) })
    if (!credential) throw new Error('cancelled')
    // 812-B5: 上传侧统一转 base64url JSON（与后端 verifyLogin 的 Base64URL 解码口径一致）
    const result = await webauthnApi.loginVerify(publicKeyCredentialToJSON(credential as PublicKeyCredential))
    // REQ-043 I6-e: Passkey 登录同样走 store 会话落地（原实现漏同步 store，跳转会被守卫拦截）
    store.applySession(result.artist, result.isAdmin)
    loginOk.value = true
    goAfterLogin(route)
  } catch (err) {
    // 812-B5: 取消/不支持/失败一律人话提示，禁止原始英文错误直出
    if (isWebAuthnCancellation(err) || (err instanceof Error && err.message === 'cancelled')) {
      noticeError.value = t('common.passkeyCancelled')
      return
    }
    if (isWebAuthnUnsupported(err)) {
      noticeError.value = t('common.passkeyNotSupported')
      return
    }
    // 824: Passkey 入口返回 TOTP_BIND_REQUIRED（绑定失效/未完成）——就地展示同一文案；
    // 此时用户本就未登录，不触发额外登出/报错噪音；清残留旗标防下次挂载重复展示
    if (isBackendError(err) && err.code === 'TOTP_BIND_REQUIRED') {
      clearTotpBindRequiredNotice()
      noticeError.value = t('errors.TOTP_BIND_REQUIRED')
      return
    }
    noticeError.value = t('common.passkeyFailed')
  } finally {
    passkeyLogging.value = false
  }
}

async function login() {
  noticeError.value = ''
  const qq = qqNumber.value.trim()
  const loginCode = code.value.trim()

  if (!qq) {
    errQq.value = true
    noticeError.value = t('login.enterQq')
    return
  }
  if (!/^\d+$/.test(qq)) {
    errQq.value = true
    noticeError.value = t('login.qqInvalid')
    return
  }
  if (!loginCode) {
    errCode.value = true
    noticeError.value = t('login.enterCode')
    return
  }
  if (!/^\d{6}$/.test(loginCode)) {
    errCode.value = true
    noticeError.value = t('login.codeInvalid')
    return
  }

  logging.value = true
  try {
    await store.login(qq, loginCode)
    // 成功反馈落按钮（石绿 + 文案），停留 500ms 让用户看见再跳
    loginOk.value = true
    goAfterLogin(route)
  } catch (err) {
    // 错误关联到具体字段；锁定类错误用后端 remainingLockMs 告知剩余时长
    // G-6（衔接批 F-9）: 旧登录码三码已退役，错误码按 REQ-027 TOTP 现状处理
    const e = err as ApiErrShape
    // 824: 绑定失效码若落到 TOTP 登录入口，清残留旗标（message 已经拦截器翻译，直接展示）
    if (e.code === 'TOTP_BIND_REQUIRED') clearTotpBindRequiredNotice()
    if (e.code === 'QQ_NOT_REGISTERED') errQq.value = true
    else if (e.code === 'TOTP_INVALID' || e.code === 'TOTP_NOT_BOUND') errCode.value = true
    const isLockError = e.code === 'TOTP_LOCKED'
    noticeError.value = isLockError && e.detail?.remainingLockMs
      ? t('login.locked', { minutes: Math.ceil(e.detail.remainingLockMs / 60000) })
      : e.message
  } finally {
    logging.value = false
  }
}
</script>

<style scoped>
/* ═══ 页面根：时辰底色 + 真纸纹理变量（token/缓动/圆角族在 artist-tokens.css） ═══ */

/* --lg-tex（真纸纹理 URL）由模板 :style 注入；纹理可见性修复在源图侧（压缩脚本像素级
   拉伸灰度百分位），op 保持 .5：斑驳约 6.5%，可见不显脏 */
.login-page {
  --lg-tex-op: 0.5;
  --lg-tex-blend: multiply;
  --lg-sheet-tex-op: 0.4;

  position: relative;
  min-height: 100vh;
  font-family: var(--f-b);
  color: var(--ink);
  background: var(--paper);
}

/* 注意：:global 必须整根选择器包进括号——:global(X) .y 混写会被编译器静默丢掉 .y（v0.49 潜伏至今） */
:global(html[data-artist-theme='ink'] .login-page) {
  --lg-tex-op: 0.2;       /* 暗主题改 overlay：只叠肌理不染色 */
  --lg-tex-blend: overlay;
  --lg-sheet-tex-op: 0.12;
}

/* ═══ 时辰底色：纸白底色随真实时间轻微变色 ═══
   ① 按 JS 算出的 data-daypart 定色温起点（偏移仅 ±2 级亮度，不破坏七色锁死的纸色家族）
   ② 停留期间一次性超慢漂移（240s，如天光缓缓西沉，不循环=宪法动效纪律）
   ③ 仅纸白主题参与；墨黑主题底色仍走 --paper */
@property --lg-drift { syntax: '<color>'; inherits: true; initial-value: #F0E6CF; }

.login-page { --lg-drift: #F0E6CF; }
.login-page[data-daypart='morning'] { --lg-drift: #F2E9D4; }
.login-page[data-daypart='dusk'] { --lg-drift: #EFE4C9; }
.login-page[data-daypart='night'] { --lg-drift: #EDE4CE; }

@keyframes lg-light-drift { to { --lg-drift: #EEE2C4; } }

:global(html[data-artist-theme='paper'] .login-page) {
  background: var(--lg-drift);
  animation: lg-light-drift 240s linear forwards;
}

/* ═══ 登录主体 ═══ */
.scene {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px 56px;
}

/* 入场：一次性渐显上移，错峰（远山晕染之后落定） */
@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.rise { animation: rise 0.4s var(--ease-out) backwards; }
.rise-1 { animation-delay: 0.4s; }
.rise-2 { animation-delay: 0.46s; }
.rise-3 { animation-delay: 0.52s; }
.rise-4 { animation-delay: 0.58s; }

/* ── 品牌区 ── */
.brand {
  text-align: center;
  margin-bottom: 32px;
}

.brand-logo {
  display: block;
  width: 68px;
  height: auto;
  margin: 0 auto 16px;
}

.brand-title {
  margin: 0 0 4px;
  font-family: var(--f-d);
  font-size: calc(var(--font-scale, 1) * 28px);
  font-weight: 400;
  letter-spacing: 0.3em;
  text-indent: 0.3em; /* 字距补偿，视觉居中 */
  color: var(--ink);
}

.brand-sub {
  margin: 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink2);
}

/* ── 表单：墨线输入（只画横线不画框；全项目 EP 惯例的有意例外——宪法「输入框只画横线」） ── */
.field { margin-bottom: 24px; }

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: calc(var(--font-scale, 1) * 12px);
  letter-spacing: 1px;
  color: var(--ink3);
  transition: color var(--dur-mid) var(--ease-out);
}

.field:focus-within .field-label { color: var(--hq); }

/* 墨线描入：聚焦时一笔花青从左侧描入（触发式、不循环） */
.field-input {
  width: 100%;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid var(--line2);
  border-radius: 0;
  background-color: transparent;
  background-image: linear-gradient(var(--hq), var(--hq));
  background-repeat: no-repeat;
  background-position: left bottom;
  background-size: 0% 1px;
  font-family: inherit;
  font-size: calc(var(--font-scale, 1) * 16px);
  color: var(--ink);
  caret-color: var(--hq);
  transition: background-size var(--dur-slow) var(--ease-out);
}

.field-input::placeholder { color: var(--ink3); }

.field-input:focus {
  outline: none;
  background-size: 100% 1px;
}

/* 键盘焦点可见性：花青焦点环（仅 :focus-visible，鼠标用户不见） */
.field-input:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 3px;
}

.field-input:disabled { opacity: 0.6; }

/* 错误态：朱砂一笔 */
.field-error .field-input {
  border-bottom-color: var(--zs);
  background-image: linear-gradient(var(--zs), var(--zs));
  background-size: 100% 1px;
}

.field-error .field-label { color: var(--zs); }

/* ── REQ-040: Passkey 登录按钮 ── */
.passkey-section {
  margin-bottom: 20px;
}
.passkey-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 0;
  border: 1px solid var(--line2);
  border-radius: var(--r-paper);
  background: var(--card);
  color: var(--ink);
  font-family: inherit;
  font-size: calc(var(--font-scale, 1) * 14px);
  cursor: pointer;
  transition: background-color var(--dur-fast), box-shadow var(--dur-fast);
}
.passkey-btn:hover:not(:disabled) {
  background: var(--hq-bg);
  box-shadow: var(--sh-1);
}
.passkey-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.passkey-btn .el-icon {
  font-size: 18px;
}
.passkey-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 12px);
}
.passkey-divider::before,
.passkey-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}

/* ── 登录按钮：一锭墨（手剪圆角 + 深浅不均 + 底缘厚墨） ── */
.login-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 0;
  border: 0;
  border-radius: var(--r-paper);
  background-color: var(--hq);
  background-image: linear-gradient(175deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.1));
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.16);
  color: #FFFFFF;
  font-family: inherit;
  font-size: calc(var(--font-scale, 1) * 15px);
  letter-spacing: 4px;
  text-indent: 4px;
  cursor: pointer;
  transition: background-color var(--dur-mid) var(--ease-out);
}

:global(html[data-artist-theme='ink'] .login-btn) { color: #171611; }

.login-btn:hover:not(:disabled) { background-color: var(--hq-d); }

.login-btn:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 3px;
}

.login-btn:disabled {
  cursor: default;
  opacity: 0.72;
}

/* 成功态：一汪石绿（500ms 后跳转） */
.login-btn.is-ok {
  background-color: var(--sl);
  opacity: 1;
}

/* 加载态：转环（功能性状态指示，非装饰循环） */
.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

:global(html[data-artist-theme='ink'] .btn-spinner) { border-color: rgba(23, 22, 17, 0.3); border-top-color: currentColor; }

@keyframes spin { to { transform: rotate(360deg); } }

/* ── 错误行：一行小字，淡入不弹跳 ── */
@keyframes note-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.notice {
  margin: 16px 0 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  line-height: 1.6;
  animation: note-in var(--dur-slow) var(--ease-out);
}

.notice-error { color: var(--zs); }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* ── 帮助：验证器推荐（button + grid-rows 0fr→1fr 展开动画） ── */
.help {
  margin-top: 24px;
  border-top: 1px dashed var(--line);
  padding-top: 16px;
}

.help-toggle {
  width: 100%;
  padding: 8px 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
  cursor: pointer;
  text-align: center;
  transition: color var(--dur-mid) var(--ease-out);
}

.help-toggle:hover { color: var(--ink); }

.help-toggle:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 2px;
}

.help-toggle::after {
  content: '＋';
  margin-left: 8px;
  color: var(--ink4);
}

.help-toggle[aria-expanded='true']::after { content: '－'; }

.help-body-wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s var(--ease-out);
}

.help-body-wrap.open { grid-template-rows: 1fr; }

.help-body {
  overflow: hidden;
  min-height: 0;
  opacity: 0;
  transition: opacity 0.28s var(--ease-out);
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
  line-height: 1.8;
}

.help-body-wrap.open .help-body {
  opacity: 1;
  padding-top: 12px;
}

.help-body p { margin: 0 0 8px; }
.help-body ul { margin: 0 0 8px 16px; padding: 0; }
.help-note { color: var(--ink3); }

/* 823：入驻第一步前置提醒（虚线纸签，与入驻入口虚线框同手法） */
.invite-prep {
  margin: 0 0 20px;
  padding: 12px 14px;
  border: 1px dashed var(--line2);
  border-radius: var(--r-paper);
  font-size: calc(var(--font-scale, 1) * 12px);
  line-height: 1.7;
  color: var(--ink2);
}

/* 823：扫码页安装引导折叠（复用 .help 同款，去掉顶部虚线分隔） */
.app-help { margin-top: 0; margin-bottom: 16px; border-top: 0; padding-top: 0; }

/* ─── REQ-039: 邀请码入驻（入口 + 叠加层，纸墨 token 复用登录表单样式） ─── */
.invite-entry {
  display: block;
  width: 100%;
  margin-top: 18px;
  padding: 10px 0;
  border: 1px dashed var(--line2);
  border-radius: var(--r-paper);
  background: transparent;
  font-family: inherit;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--hq);
  cursor: pointer;
  transition: background-color var(--dur-fast), box-shadow var(--dur-fast);
}
.invite-entry:hover {
  background: var(--hq-bg);
  box-shadow: var(--sh-1);
}
.invite-entry:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 3px;
}

/* 叠加层：覆盖主卡（主卡 position: relative），纸面同色 + 可滚动 */
.invite-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: var(--card);
  border-radius: var(--r-paper);
  overflow-y: auto;
  animation: note-in var(--dur-slow) var(--ease-out);
}
.invite-overlay-inner { padding: 32px 44px 40px; }
.invite-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
  cursor: pointer;
  transition: color var(--dur-fast);
}
.invite-back:hover { color: var(--ink); }
.invite-title {
  margin: 12px 0 4px;
  font-family: var(--f-d);
  font-size: calc(var(--font-scale, 1) * 22px);
  font-weight: 400;
  letter-spacing: 0.12em;
  color: var(--ink);
}
.invite-sub {
  margin: 0 0 24px;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
  line-height: 1.7;
}
.field-hint { margin: 6px 0 0; font-size: 11px; color: var(--ink3); }
/* v126①：首绑动态码轮换机制引导（与 step-desc 同色调，只写功能性陈述） */
.invite-totp-guide { margin: 6px 0 0; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); line-height: 1.6; }
.invite-step-title { margin: 20px 0 6px; font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); }
.invite-step-desc { margin: 0 0 14px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); line-height: 1.7; }
.invite-qr-wrap { display: flex; justify-content: center; margin: 4px 0 18px; }
.invite-qr {
  width: 200px;
  height: 200px;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  background: #fff;
}

/* ─── 824: TOTP 绑定失效提示 + 防刷新提示 + 找回入口 ─── */
/* 绑定失效提示（401 跳登录页后展示）：藤黄纸签——醒目但不惊悚，一次性淡入承 .notice */
.notice-bind {
  margin: 0 0 20px;
  padding: 12px 16px;
  border: 1px dashed var(--th);
  border-radius: var(--r-paper);
  background: var(--th-t);
  color: var(--ink);
}

/* 首绑第 2 步防刷新提示（藤黄=待确认/缓冲提醒语义色，醒目不吓人） */
.invite-warn {
  margin: 0 0 12px;
  padding: 12px 12px;
  border: 1px dashed var(--th);
  border-radius: var(--r-paper);
  background: var(--th-t);
  font-size: calc(var(--font-scale, 1) * 12px);
  line-height: 1.7;
  color: var(--ink2);
}

/* 找回入口：复用 .help 折叠 + 墨线输入，克制增量不堆特效 */
.invite-recover { margin-top: 24px; }
.invite-recover-desc { margin: 0 0 12px; }

/* 成功提示：石绿一行（与 notice-error 同族） */
.notice-ok { color: var(--sl); }

@media (max-width: 768px) {
  .invite-overlay-inner { padding: 24px 24px 28px; }
}

/* ═══ 768 竖屏 ═══ */
@media (max-width: 768px) {
  .brand-title { font-size: calc(var(--font-scale, 1) * 24px); }

  /* 移动端点按热区：墨线输入纵向加厚 */
  .field-input { padding: 12px 0; }
}

/* ═══ 无障碍：尊重系统减少动态效果 ═══ */
@media (prefers-reduced-motion: reduce) {
  .rise, .notice { animation: none; }
  .login-page { animation: none !important; } /* 时辰漂移直出 */
  .btn-spinner { animation: none; }
  .field-input, .help-body-wrap, .help-body, .login-btn, .field-label, .help-toggle {
    transition-duration: 0.01ms;
  }
}
</style>
