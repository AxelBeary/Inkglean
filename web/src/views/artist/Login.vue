<template>
  <div class="login-page" :data-daypart="daypart" :style="{ '--lg-tex': `url(${paperTexUrl})` }">
    <!-- 纸墨登录页（2026-08-10 重构）：远山为幕 / 纸叠卡 / 墨线输入 / 克制动效（一次性、不循环）
         结构：LoginBackdrop（远山+季节背景）· PaperCard（纸叠卡壳）· LoginPrefs（主题/语言）
         全局 token（@property / 550ms 主题缓动 / 手剪圆角族）已迁入 artist-tokens.css「纸艺基线」节 -->

    <LoginBackdrop />

    <div class="scene">
      <PaperCard ref="paperCardRef">
        <LoginPrefs class="rise rise-1" @switch-lang="onSwitchLang" />

        <!-- 品牌区：logo（用户后续替换，保留引用）+ 绘约（文楷）+ 副标 -->
        <div class="brand rise rise-2">
          <img class="brand-logo" :src="logoUrl" alt="" aria-hidden="true">
          <h1 id="login-title" class="brand-title">{{ t('login.brandTitle') }}</h1>
          <p class="brand-sub">{{ t('login.subtitle') }}</p>
        </div>

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
              <p>{{ t('login.helpDesc') }}</p>
              <ul>
                <li>Google Authenticator</li>
                <li>Microsoft Authenticator</li>
                <li>2FAS</li>
              </ul>
              <p class="help-note">{{ t('login.helpNote') }}</p>
            </div>
          </div>
        </div>
      </PaperCard>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist.js'
import { useThemeStore } from '../../stores/theme.js'
import { useLocaleSwitch } from '../../composables/useLocaleSwitch.js'
import LoginBackdrop from '../../components/artist/login/LoginBackdrop.vue'
import PaperCard from '../../components/artist/login/PaperCard.vue'
import LoginPrefs from '../../components/artist/login/LoginPrefs.vue'
import paperTexUrl from '../../assets/paper-tex.webp'
import logoUrl from '../../assets/logo.webp'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useArtistStore()
const themeStore = useThemeStore()

// 登录是后台入口：挂载纸墨 token 作用域（客户端零影响）
onMounted(() => themeStore.enterArtistScope())
onUnmounted(() => themeStore.leaveArtistScope())

/** 时辰底色：按真实时间定纸白底色的色温（晨微暖/午标准/暮暖深/夜微冷），
 *  配合 CSS light-drift 一次性超慢漂移（不循环，宪法动效纪律）；墨黑主题不参与 */
const h = new Date().getHours()
const daypart = h >= 5 && h < 10 ? 'morning' : h >= 16 && h < 20 ? 'dusk' : (h >= 20 || h < 5) ? 'night' : 'noon'

const qqNumber = ref('')
const code = ref('')
const logging = ref(false)
const loginOk = ref(false)
const helpOpen = ref(false)
const errQq = ref(false)
const errCode = ref(false)
const noticeError = ref('')
const paperCardRef = ref(null)

const { switchLang } = useLocaleSwitch(() => paperCardRef.value?.getCardEl())
const onSwitchLang = (next) => switchLang(next, locale.value)

async function login() {
  noticeError.value = ''
  const qq = qqNumber.value.trim()
  const cd = code.value.trim()

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
  if (!cd) {
    errCode.value = true
    noticeError.value = t('login.enterCode')
    return
  }
  if (!/^\d{6}$/.test(cd)) {
    errCode.value = true
    noticeError.value = t('login.codeInvalid')
    return
  }

  logging.value = true
  try {
    await store.login(qq, cd)
    // 成功反馈落按钮（石绿 + 文案），停留 500ms 让用户看见再跳
    loginOk.value = true
    // 消费守卫带来的 ?redirect=（限站内路径，防开放跳转），兜底按身份分流
    const redirect = route.query.redirect
    const target = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
      ? redirect
      : store.isAdmin ? '/admin' : '/dashboard'
    setTimeout(() => router.push(target), 500)
  } catch (err) {
    // 错误关联到具体字段；锁定类错误用后端 remainingLockMs 告知剩余时长
    if (err.code === 'QQ_NOT_REGISTERED') errQq.value = true
    else if (err.code === 'CODE_INVALID' || err.code === 'CODE_EXPIRED') errCode.value = true
    const isLockError = err.code === 'TOTP_LOCKED' || err.code === 'CODE_TOO_MANY_ATTEMPTS'
    noticeError.value = isLockError && err.detail?.remainingLockMs
      ? t('login.locked', { minutes: Math.ceil(err.detail.remainingLockMs / 60000) })
      : err.message
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
@property --lg-drift { syntax: '<color>'; inherits: true; initial-value: #F5F4EF; }

.login-page { --lg-drift: #F5F4EF; }
.login-page[data-daypart='morning'] { --lg-drift: #F6F3EC; }
.login-page[data-daypart='dusk'] { --lg-drift: #F4F0E5; }
.login-page[data-daypart='night'] { --lg-drift: #F2F2EF; }

@keyframes lg-light-drift { to { --lg-drift: #F3EEE2; } }

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
  transition: color 0.2s ease;
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
  transition: background-size 0.35s var(--ease-out);
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
  transition: background-color 0.2s ease;
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
  animation: note-in 0.3s var(--ease-out);
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
  transition: color 0.2s ease;
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
  transition: opacity 0.28s ease;
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
