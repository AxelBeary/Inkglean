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

        <!-- REQ-039 + 824: 入驻叠加层（四步：文书必读 → 验证器预告 → 信息表单 → TOTP 首绑）；
             流程本体抽为 InviteOverlay 组件（巨型文件防阀瘦身），本页只留入口与显隐；
             824 防刷新恢复/首绑找回/防刷提示均随组件迁入 -->
        <InviteOverlay v-if="inviteView" @close="closeInvite" />
      </PaperCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist'
import { useLocaleSwitch } from '../../composables/useLocaleSwitch'
import LoginBackdrop from '../../components/artist/login/LoginBackdrop.vue'
import PaperCard from '../../components/artist/login/PaperCard.vue'
import LoginPrefs from '../../components/artist/login/LoginPrefs.vue'
import InviteOverlay from '../../components/artist/login/InviteOverlay.vue'
import { inviteApi } from '../../api/index'
import paperTexUrl from '../../assets/paper-tex.webp'
import logoUrl from '../../assets/logo.webp'
// 824: 表单/按钮/帮助折叠样式与 InviteOverlay 共享（.login-page 前缀锁作用域，防双副本漂移）
import '../../styles/login-shared.css'
import { Lock } from '@element-plus/icons-vue'
import {
  toCredentialRequestOptions,
  publicKeyCredentialToJSON,
  isWebAuthnCancellation,
  isWebAuthnUnsupported,
  isBackendError
} from '../../utils/webauthn'
import {
  loadInviteTotpProgress,
  takeTotpBindRequiredNotice,
  clearTotpBindRequiredNotice
} from '../../utils/inviteProgress'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useArtistStore()

// L-5: 登录成功延迟跳转句柄——卸载时清理，防离开登录页后定时器仍触发导航
let loginNavTimer: number | null = null

/** 登录成功跳转：消费守卫带来的 ?redirect=（限站内路径，防开放跳转），兜底统一落地画师面板；停留 500ms 让用户看见成功反馈 */
function goAfterLogin(route: RouteLocationNormalizedLoaded) {
  const redirect = route.query.redirect
  // 812-B6: 管理员与普通画师默认落地一致为画师面板；手动访问 /admin 由 requiresAdmin 守卫放行
  const target = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/dashboard'
  if (loginNavTimer) clearTimeout(loginNavTimer)
  loginNavTimer = setTimeout(() => router.push(target), 500)
}

// L-5: 卸载清理延迟跳转定时器（对齐生命周期钩子收口）
onUnmounted(() => { if (loginNavTimer) clearTimeout(loginNavTimer) })

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
const errQq = ref(false)
const errCode = ref(false)
const noticeError = ref('')
const paperCardRef = ref<InstanceType<typeof PaperCard> | null>(null)
const inviteEntryRef = ref<HTMLButtonElement | null>(null)

/** 后端 API 错误形状（code/detail 附在抛出的错误对象上）：仅用于 catch 内分支读取 */
interface ApiErrShape {
  code?: string
  message: string
  detail?: { stale?: boolean; remainingAttempts?: number; remainingLockMs?: number }
}

// ─── REQ-039 + 824: 邀请码入驻（入口与显隐在本页；四步流程本体在 InviteOverlay 组件内） ───
const inviteEnabled = ref(false)
const inviteView = ref(false)
// 824: TOTP 绑定失效提示（401 TOTP_BIND_REQUIRED 跳登录页前写旗标，挂载时消费展示，展示后清除；展示位在本页登录表单上方）
const bindNotice = ref('')

const { switchLang } = useLocaleSwitch(() => paperCardRef.value?.getCardEl())
const onSwitchLang = (next: string) => switchLang(next, locale.value)

onMounted(async () => {
  // 824: 消费绑定失效旗标（401 TOTP_BIND_REQUIRED 跳转前写入；展示后清除，只展示一次）
  if (takeTotpBindRequiredNotice()) {
    bindNotice.value = t('errors.TOTP_BIND_REQUIRED')
  }
  // 824: 防刷新——有进行中的首绑（建号已成功但绑定未完成）就打开叠加层，
  // 由组件自行恢复二维码页；不依赖入驻入口开关：账号既已创建，即使入驻关闭也恢复续绑
  if (loadInviteTotpProgress()) {
    inviteView.value = true
  }
  // REQ-039: 入驻模式判定（manual 时登录页不显示入口）
  try {
    const res = await inviteApi.status()
    inviteEnabled.value = res.enabled
  } catch { /* 状态查询失败静默——入口不显示，登录不受影响 */ }
})

function openInvite() {
  inviteView.value = true
}

function closeInvite() {
  inviteView.value = false
  // 回焦：关闭叠加层后焦点还给「邀请码入驻」入口按钮（防刷新状态由组件在关闭时自行清理）
  inviteEntryRef.value?.focus()
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

/* 表单（墨线输入）/主按钮/错误行/帮助折叠样式已迁入 styles/login-shared.css（与 InviteOverlay 共享） */

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

/* ─── REQ-039: 邀请码入驻入口（叠加层本体已抽至 InviteOverlay 组件，样式随迁） ─── */
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

/* 824: TOTP 绑定失效提示（401 跳登录页后展示）：藤黄纸签——醒目但不惊悚，一次性淡入承 .notice；
   叠加层其余样式已随 InviteOverlay 组件迁出 */
.notice-bind {
  margin: 0 0 20px;
  padding: 12px 16px;
  border: 1px dashed var(--th);
  border-radius: var(--r-paper);
  background: var(--th-t);
  color: var(--ink);
}
/* ═══ 768 竖屏 ═══ */
@media (max-width: 768px) {
  .brand-title { font-size: calc(var(--font-scale, 1) * 24px); }
}

/* ═══ 无障碍：尊重系统减少动态效果（表单/按钮类规则在 login-shared.css） ═══ */
@media (prefers-reduced-motion: reduce) {
  .rise { animation: none; }
  .login-page { animation: none !important; } /* 时辰漂移直出 */
}
</style>
