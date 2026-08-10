<template>
  <div class="login-page" :style="{ '--lg-tex': `url(${paperTexUrl})` }">
    <!-- v0.46 纸墨登录页（原型 login-v0.3.html v0.6 定稿安装）
         宪法落位：纸艺山水 / 手剪纸角 / 纸叠厚度 / 真纸纹理 / 克制动效（一次性、不循环） -->

    <!-- 撕毛边位移滤镜：把 clip-path 直边扰动成有机毛边（北极星参考 ref-nie 剪纸手法） -->
    <svg class="svg-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <filter id="loginTornEdge" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>

    <!-- 纸艺山水：折纸山脉（拉伸层）+ 小亭（独立定尺寸，竖屏不形变） -->
    <div class="mountains" aria-hidden="true">
      <svg class="mt-range" viewBox="0 0 1440 360" preserveAspectRatio="none">
        <path class="mt-far" d="M0,236 L150,128 L296,206 L470,88 L648,196 L830,110 L1010,200 L1188,124 L1330,196 L1440,150 L1440,360 L0,360 Z" />
        <rect class="mt-mist" x="0" y="228" width="1440" height="30" />
        <path class="mt-mid" d="M0,286 L210,182 L392,268 L586,164 L788,272 L986,190 L1178,278 L1332,214 L1440,262 L1440,360 L0,360 Z" />
        <path class="mt-near" d="M0,330 L260,240 L470,318 L700,236 L930,326 L1150,252 L1330,322 L1440,286 L1440,360 L0,360 Z" />
      </svg>
      <div class="pavilion-wrap">
        <svg viewBox="-24 -8 48 40">
          <g class="pavilion">
            <path d="M-22,10 Q-18,6 -15,6 Q-6,-3 0,-5 Q6,-3 15,6 Q18,6 22,10 L17,10 Q7,3 0,1 Q-7,3 -17,10 Z" />
            <rect x="-9" y="10" width="2.5" height="16" />
            <rect x="6.5" y="10" width="2.5" height="16" />
            <rect x="-14" y="26" width="28" height="3" />
          </g>
        </svg>
      </div>
    </div>

    <div class="scene">
      <div class="card-wrap">
        <!-- 纸叠：第三张撕毛边 + 第二张微斜 + 主纸 -->
        <div class="sheet-c" aria-hidden="true"><div class="sheet-c-cut"></div></div>
        <div class="sheet-b" aria-hidden="true"></div>

        <main ref="cardRef" class="card" :aria-labelledby="'login-title'">
          <!-- 细粒噪点层（程序纹理，真纸纹理经 --lg-tex 变量进 background） -->
          <div class="grain-layer" aria-hidden="true"></div>

          <!-- 偏好区：裸字 + 朱砂笔点（纸白/墨黑 与 中/EN），与后台同逻辑 -->
          <div class="prefs rise rise-1">
            <div class="pref-group" role="group" :aria-label="t('login.prefThemeGroup')">
              <button type="button" :aria-pressed="themeStore.artistTheme === 'paper'" @click="setTheme('paper')">{{ t('login.themePaper') }}</button>
              <button type="button" :aria-pressed="themeStore.artistTheme === 'ink'" @click="setTheme('ink')">{{ t('login.themeInk') }}</button>
            </div>
            <div class="pref-sep" aria-hidden="true"></div>
            <div class="pref-group" role="group" :aria-label="t('login.prefLangGroup')">
              <button type="button" :aria-pressed="locale === 'zh-CN'" @click="switchLang('zh-CN')">中</button>
              <button type="button" :aria-pressed="locale === 'en'" @click="switchLang('en')">EN</button>
            </div>
          </div>

          <!-- 品牌区：朱砂印（斑驳、盖得不正）+ 绘约（文楷）+ 副标 -->
          <div class="brand rise rise-2">
            <div class="brand-seal" aria-hidden="true">{{ t('menu.logoSeal') }}</div>
            <h1 id="login-title" class="brand-title">{{ t('login.brandTitle') }}</h1>
            <p class="brand-sub">{{ t('login.subtitle') }}</p>
          </div>

          <!-- REQ-027: QQ 号 + TOTP 动态口令（机制不变，错误改内联朱砂一行，不弹 toast） -->
          <form class="rise rise-3" novalidate @submit.prevent="login">
            <div class="field" :class="{ 'field-error': errQq }">
              <label class="field-label" for="login-qq">{{ t('login.qqLabel') }}</label>
              <input
                id="login-qq" v-model="qqNumber" class="field-input" type="text" inputmode="numeric"
                autocomplete="username" :placeholder="t('login.qqPlaceholder')"
                @input="errQq = false"
              >
            </div>

            <div class="field" :class="{ 'field-error': errCode }">
              <label class="field-label" for="login-code">{{ t('login.codeLabel') }}</label>
              <input
                id="login-code" v-model="code" class="field-input" type="text" inputmode="numeric"
                maxlength="6" autocomplete="one-time-code" :placeholder="t('login.codePlaceholder')"
                @input="errCode = false"
              >
            </div>

            <button class="login-btn" type="submit" :disabled="logging">
              {{ logging ? t('login.logging') : t('login.login') }}
            </button>

            <p v-if="noticeError" class="notice notice-error" role="alert">{{ noticeError }}</p>
            <p v-if="noticeOk" class="notice notice-ok" aria-live="polite">{{ noticeOk }}</p>
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
        </main>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist.js'
import { useThemeStore } from '../../stores/theme.js'
import { setLocale } from '../../i18n/index.js'
import paperTexUrl from '../../assets/paper-tex.webp'

const { t, locale } = useI18n()
const router = useRouter()
const store = useArtistStore()
const themeStore = useThemeStore()

// v0.38 机制不动：登录是后台入口，挂载纸墨 token 作用域（客户端零影响）
onMounted(() => themeStore.enterArtistScope())
onUnmounted(() => themeStore.leaveArtistScope())

const qqNumber = ref('')
const code = ref('')
const logging = ref(false)
const helpOpen = ref(false)
const errQq = ref(false)
const errCode = ref(false)
const noticeError = ref('')
const noticeOk = ref('')
const cardRef = ref(null)

/** 主题切换：直写 themeStore.artistTheme（持久化 + DOM 属性由 store watch 应用），
 *  550ms 统一 token 缓动见下方全局样式（材质连续，不硬切） */
function setTheme(name) {
  themeStore.artistTheme = name
}

/** 语言切换：WAAPI 单次交叉淡出 + 切换期锁卡片高度（防布局跳动/二次闪烁），
 *  160ms 中点换 locale；busy 锁拦截连点。reduced-motion 直切。 */
let langBusy = false
function switchLang(next) {
  if (next === locale.value || langBusy) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setLocale(next)
    return
  }
  const card = cardRef.value
  if (!card) { setLocale(next); return }
  langBusy = true
  const h = card.offsetHeight
  card.style.height = h + 'px'
  card.style.overflow = 'hidden'
  const anim = card.animate(
    [{ opacity: 1 }, { opacity: 0.35, offset: 0.42 }, { opacity: 1 }],
    { duration: 380, easing: 'cubic-bezier(.45, .05, .25, 1)' }
  )
  setTimeout(() => setLocale(next), 160)
  anim.onfinish = () => {
    card.style.height = ''
    card.style.overflow = ''
    langBusy = false
  }
}

async function login() {
  noticeError.value = ''
  noticeOk.value = ''
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
    noticeOk.value = t('login.loginSuccess')
    router.push(store.isAdmin ? '/admin' : '/dashboard')
  } catch (err) {
    noticeError.value = err.message
  } finally {
    logging.value = false
  }
}
</script>

<!-- 全局块：登录页专属 token / @property 注册 / 主题统一缓动 / 纹理 URL。
     @property 与 html 过渡规则是全局的，视觉批铺开时迁入 artist-tokens.css。
     注：artist-tokens.css 的旧兼容映射把 --bg-page 等指向纸墨 token，
     页面底色直接消费 --paper 本体，确保吃到 550ms token 缓动。 -->
<style>
.login-page {
  /* --lg-tex（真纸纹理 URL）由模板 :style 注入（script 导入的 webp 资源地址） */
  --lg-tex-op: 0.5;
  --lg-tex-blend: multiply;
  --lg-sheet-tex-op: 0.35;
}

html[data-artist-theme='ink'] .login-page {
  --lg-tex-op: 0.14;      /* 暗主题改 overlay：只叠肌理不染色 */
  --lg-tex-blend: overlay;
  --lg-sheet-tex-op: 0.1;
}

/* 手剪纸不规则圆角（全后台视觉批基线：纸不是机器倒的角） */
html[data-artist-theme] {
  --r-paper: 3px 5px 3px 4px / 4px 3px 5px 3px;
  --r-s-hand: 2px 3px 2px 3px / 3px 2px 3px 2px;
}

/* 主题 token 注册为可动画属性：切换时变量本身 550ms 缓动，
   所有下游颜色/渐变/纹理同时间轴重绘——材质连续「纸还是那张纸」 */
@property --paper   { syntax: '<color>'; inherits: true; initial-value: #F5F4EF; }
@property --paper2  { syntax: '<color>'; inherits: true; initial-value: #FBFAF6; }
@property --card    { syntax: '<color>'; inherits: true; initial-value: #FFFFFF; }
@property --ink     { syntax: '<color>'; inherits: true; initial-value: #262520; }
@property --ink2    { syntax: '<color>'; inherits: true; initial-value: #5A564B; }
@property --ink3    { syntax: '<color>'; inherits: true; initial-value: #757062; }
@property --ink4    { syntax: '<color>'; inherits: true; initial-value: #807B6C; }
@property --line    { syntax: '<color>'; inherits: true; initial-value: #E7E4D9; }
@property --line2   { syntax: '<color>'; inherits: true; initial-value: #DAD6C8; }
@property --hq      { syntax: '<color>'; inherits: true; initial-value: #33526E; }
@property --hq-d    { syntax: '<color>'; inherits: true; initial-value: #28425B; }
@property --hq-t    { syntax: '<color>'; inherits: true; initial-value: #E9EFF4; }
@property --zs      { syntax: '<color>'; inherits: true; initial-value: #BC3A2B; }
@property --sl      { syntax: '<color>'; inherits: true; initial-value: #2F7D54; }

html[data-artist-theme] {
  transition:
    --paper 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --paper2 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --card 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --ink 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --ink2 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --ink3 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --ink4 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --line 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --line2 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --hq 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --hq-d 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --hq-t 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --zs 0.55s cubic-bezier(0.45, 0.05, 0.25, 1),
    --sl 0.55s cubic-bezier(0.45, 0.05, 0.25, 1);
}

.login-page {
  position: relative;
  min-height: 100vh;
  font-family: var(--f-b);
  color: var(--ink);
  background: var(--paper);
}

/* 页面底：极淡纸纤维 */
.login-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    repeating-linear-gradient(0deg, rgba(128, 123, 108, 0.06) 0, rgba(128, 123, 108, 0.06) 1px, transparent 1px, transparent 3px),
    repeating-linear-gradient(90deg, rgba(128, 123, 108, 0.04) 0, rgba(128, 123, 108, 0.04) 1px, transparent 1px, transparent 4px);
}
</style>

<style scoped>
/* ═══ 纸艺山水：底部折纸山脉（北极星） ═══ */
.mountains {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  height: 36vh;
  min-height: 200px;
  pointer-events: none;
}

.mountains svg { display: block; }

.mt-range { width: 100%; height: 100%; }

.svg-defs { position: absolute; }

/* 小亭：锁定山脊交点，定宽不形变 */
.pavilion-wrap {
  position: absolute;
  left: 68.5%;
  bottom: 48%;
  width: 44px;
  transform: translateX(-50%);
}

.pavilion-wrap svg { width: 100%; height: auto; }

.mt-far { fill: color-mix(in srgb, var(--ink) 5%, transparent); }
.mt-mid { fill: color-mix(in srgb, var(--ink) 8%, transparent); }
.mt-near { fill: color-mix(in srgb, var(--ink) 11%, transparent); }
.mt-mist { fill: color-mix(in srgb, var(--paper2) 55%, transparent); }
.pavilion { fill: color-mix(in srgb, var(--ink) 26%, transparent); }

/* 入场：山脉逐层升起 + 雾横漂入（一次性） */
@keyframes mt-rise { from { transform: translateY(36px); } to { transform: translateY(0); } }
@keyframes mist-in { from { transform: translateX(-36px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

.mt-far  { animation: mt-rise 0.6s var(--ease-out) 0.05s backwards; }
.mt-mid  { animation: mt-rise 0.6s var(--ease-out) 0.15s backwards; }
.mt-near { animation: mt-rise 0.6s var(--ease-out) 0.25s backwards; }
.mt-mist { animation: mist-in 0.9s ease-out 0.3s backwards; }
.pavilion-wrap { animation: fade-in 0.6s ease 0.55s backwards; }

/* ═══ 登录主体 ═══ */
.scene {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px 40px;
}

/* 入场：一次性渐显上移，错峰 */
@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.rise { animation: rise 0.4s var(--ease-out) backwards; }
.rise-1 { animation-delay: 0.32s; }
.rise-2 { animation-delay: 0.38s; }
.rise-3 { animation-delay: 0.44s; }
.rise-4 { animation-delay: 0.5s; }

/* ── 纸叠：三张手放的纸（入场逐张落定） ── */
@keyframes sheet-b { from { opacity: 0; transform: rotate(0deg); } to { opacity: 1; transform: rotate(0.9deg); } }
@keyframes sheet-c { from { opacity: 0; transform: rotate(0deg); } to { opacity: 1; transform: rotate(-1.1deg); } }

.card-wrap {
  position: relative;
  width: 100%;
  max-width: 400px;
}

/* 第三张：底边撕毛（clip-path 粗撕 + feTurbulence 位移滤镜 = 真毛边） */
.sheet-c {
  position: absolute;
  left: 0;
  right: 16px;
  top: 16px;
  bottom: -12px;
  z-index: -2;
  filter: url(#loginTornEdge);
  transform: rotate(-1.1deg);
  animation: sheet-c 0.5s var(--ease-out) 0.08s backwards;
}

.sheet-c-cut {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--paper);
  border-radius: var(--r-s-hand);
  box-shadow: 0 4px 10px rgba(38, 37, 32, 0.06);
  clip-path: polygon(0 0, 100% 0, 100% 88%, 95% 91%, 89% 87%, 82% 92%, 74% 88%, 66% 93%, 58% 89%, 49% 93%, 41% 88%, 33% 92%, 25% 88%, 17% 93%, 9% 89%, 4% 92%, 0 88%);
}

/* 第二张：微斜垫底 */
.sheet-b {
  position: absolute;
  left: 8px;
  right: 4px;
  top: 8px;
  bottom: -6px;
  z-index: -1;
  background: var(--paper2);
  border-radius: var(--r-s-hand);
  box-shadow: 0 2px 6px rgba(38, 37, 32, 0.07);
  transform: rotate(0.9deg);
  animation: sheet-b 0.5s var(--ease-out) 0.02s backwards;
}

/* 底层两张纸的纹理（入场/窄屏会露出，素纸会穿帮） */
.sheet-c-cut::after,
.sheet-b::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: var(--lg-tex);
  background-size: 512px 512px;
  opacity: var(--lg-sheet-tex-op);
  mix-blend-mode: var(--lg-tex-blend);
  pointer-events: none;
}

/* 主纸：手剪圆角 + 真纸纹理 + 噪点 + 下缘纸边 */
.card {
  position: relative;
  background: var(--card);
  border-radius: var(--r-paper);
  padding: 32px 40px 36px;
  box-shadow: 0 1px 2px rgba(38, 37, 32, 0.05), 0 14px 34px rgba(38, 37, 32, 0.14);
  animation: fade-in 0.4s ease 0.16s backwards;
}

/* 卡面真纸纹理（ambientCG Paper001，CC0，经 --lg-tex 注入）+ 混合模式随主题 */
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: var(--lg-tex);
  background-size: 512px 512px;
  opacity: var(--lg-tex-op);
  mix-blend-mode: var(--lg-tex-blend);
  pointer-events: none;
}

/* 细粒噪点单独一层（程序纹理） */
.grain-layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.04;
  mix-blend-mode: multiply;
  pointer-events: none;
}

:global(html[data-artist-theme='ink']) .grain-layer { mix-blend-mode: screen; }

/* 下缘纸边（厚度） */
.card::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  border-radius: var(--r-s-hand);
  background: linear-gradient(180deg, color-mix(in srgb, var(--ink) 5%, transparent), color-mix(in srgb, var(--ink) 12%, transparent));
  pointer-events: none;
}

/* ── 偏好区：裸字 + 朱砂笔点（去 SaaS 分段控件） ── */
.prefs {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
}

.pref-group { display: flex; gap: 4px; }

.pref-sep {
  width: 1px;
  height: 16px;
  margin: 0 8px;
  background: var(--line2);
}

.pref-group button {
  position: relative;
  padding: 4px 8px 8px;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink3);
  cursor: pointer;
  transition: color 0.2s ease;
}

.pref-group button:hover { color: var(--ink); }

/* 选中 = 墨色加深 + 底下一枚朱砂笔点（宪法五.1 笔点语言） */
.pref-group button[aria-pressed='true'] { color: var(--ink); }

.pref-group button::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--zs);
  opacity: 0;
  transform: translateX(-50%) scale(0);
}

@keyframes dot-pop {
  0%   { opacity: 0; transform: translateX(-50%) scale(0.2); }
  70%  { opacity: 1; transform: translateX(-50%) scale(1.35); }
  100% { opacity: 1; transform: translateX(-50%) scale(1); }
}

.pref-group button[aria-pressed='true']::after {
  animation: dot-pop 0.3s var(--ease-out);
  opacity: 1;
  transform: translateX(-50%) scale(1);
}

/* ── 品牌区 ── */
.brand {
  text-align: center;
  margin-bottom: 32px;
}

/* 朱砂印：印泥不匀（径向浓淡）+ 盖得不正，入场「盖章」 */
@keyframes stamp {
  0%   { opacity: 0; transform: scale(0.88) rotate(-6deg); }
  62%  { opacity: 1; transform: scale(1.05) rotate(-2.4deg); }
  100% { opacity: 1; transform: scale(1) rotate(-2.4deg); }
}

.brand-seal {
  width: 44px;
  height: 44px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-s-hand);
  background-color: var(--zs);
  background-image:
    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.2), transparent 46%),
    radial-gradient(circle at 72% 78%, rgba(0, 0, 0, 0.1), transparent 52%);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(38, 37, 32, 0.18);
  color: #FFFFFF;
  font-family: var(--f-d);
  font-size: calc(var(--font-scale, 1) * 24px);
  line-height: 1;
  transform: rotate(-2.4deg);
  animation: stamp 0.45s var(--ease-out) 0.5s backwards;
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

/* ── 表单：墨线输入（只画横线不画框） ── */
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
  padding: 8px 0;
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

/* 错误态：朱砂一笔 */
.field-error .field-input {
  border-bottom-color: var(--zs);
  background-image: linear-gradient(var(--zs), var(--zs));
  background-size: 100% 1px;
}

.field-error .field-label { color: var(--zs); }

/* ── 登录按钮：一锭墨（手剪圆角 + 深浅不均 + 底缘厚墨） ── */
.login-btn {
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

html[data-artist-theme='ink'] .login-btn { color: #171611; }

.login-btn:hover { background-color: var(--hq-d); }

.login-btn:disabled {
  cursor: default;
  opacity: 0.72;
}

/* ── 错误 / 成功行：一行小字，淡入不弹跳 ── */
@keyframes note-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.notice {
  margin: 16px 0 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  line-height: 1.6;
  animation: note-in 0.3s var(--ease-out);
}

.notice-error { color: var(--zs); }
.notice-ok { color: var(--sl); }

/* ── 帮助：验证器推荐（button + grid-rows 0fr→1fr 展开动画） ── */
.help {
  margin-top: 24px;
  border-top: 1px dashed var(--line);
  padding-top: 16px;
}

.help-toggle {
  width: 100%;
  padding: 0;
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
  .mountains { height: 26vh; min-height: 148px; }

  .pavilion-wrap { width: 32px; }

  .card { padding: 28px 24px 32px; }

  .brand-title { font-size: calc(var(--font-scale, 1) * 24px); }
}

/* ═══ 无障碍：尊重系统减少动态效果 ═══ */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
