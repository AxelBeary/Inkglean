<template>
  <!-- REQ-039 + 824: 入驻叠加层（四步：文书必读 → 验证器预告 → 信息表单 → TOTP 首绑）
       824 自 Login.vue 抽出成组件（巨型文件防阀瘦身 + 入驻领地独立；行为不变）；
       覆盖主卡（主卡 position: relative），真纸纹理走 --lg-tex 同 PaperCard 主纸口径 -->
  <div
    ref="overlayRef"
    class="invite-overlay" role="dialog" aria-modal="true" :aria-label="t('invite.title')"
    @keydown.tab="onInviteKeydown"
  >
    <div class="invite-overlay-inner">
      <button class="invite-back" type="button" @click="emit('close')">← {{ t('invite.back') }}</button>
      <h2 class="invite-title">{{ t('invite.title') }}</h2>
      <p class="invite-sub">{{ t('invite.subtitle') }}</p>

      <!-- 824: 四步纸签进度（当前步实心花青，走过步描边着色） -->
      <ol class="invite-steps">
        <li
          v-for="(tag, i) in inviteStepTags" :key="i"
          :class="{ active: inviteStep === i + 1, done: inviteStep > i + 1 }"
        >
          {{ tag }}
        </li>
      </ol>

      <!-- 824 步骤 1：两份文书同窗必读（滑到底解锁勾选；文案事实源 compliance，只渲染不复制） -->
      <div v-if="inviteStep === 1">
        <p class="invite-step-title">{{ t('invite.docsTitle') }}</p>
        <p class="invite-step-desc">{{ t('invite.docsDesc') }}</p>
        <div class="invite-docs" tabindex="-1" @scroll="onDocsScroll">
          <template v-for="(sec, i) in privacySections" :key="`p${i}`">
            <h3 class="invite-doc-h">{{ sec.title }}</h3>
            <p v-for="(par, j) in sec.paragraphs" :key="j">{{ par }}</p>
            <ul v-if="sec.items">
              <li v-for="(it, k) in sec.items" :key="k">{{ it }}</li>
            </ul>
          </template>
          <p class="invite-doc-note">{{ t('compliance.privacy.note') }}</p>
          <div class="invite-doc-divider">{{ t('invite.docDivider') }}</div>
          <template v-for="(sec, i) in termsSections" :key="`t${i}`">
            <h3 class="invite-doc-h">{{ sec.title }}</h3>
            <p v-for="(par, j) in sec.paragraphs" :key="j">{{ par }}</p>
            <ul v-if="sec.items">
              <li v-for="(it, k) in sec.items" :key="k">{{ it }}</li>
            </ul>
          </template>
          <p class="invite-doc-note">{{ t('compliance.terms.note') }}</p>
        </div>
        <p class="invite-scroll-hint" :class="{ done: policyReached }">
          {{ policyReached ? t('invite.scrollHintDone') : t('invite.scrollHint') }}
        </p>
        <label class="invite-agree" :class="{ locked: !policyReached }">
          <input v-model="policyAgreed" type="checkbox" :disabled="!policyReached">
          <span>{{ t('invite.agreeLabel') }}</span>
        </label>
        <button class="login-btn" type="button" :disabled="!policyAgreed" @click="inviteStep = 2">
          {{ t('invite.docsNext') }}
        </button>
      </div>

      <!-- 824 步骤 2：验证器预告独立步（823 前置提醒升格；推荐口径同源 authApp；软回应不强制安装） -->
      <div v-else-if="inviteStep === 2">
        <p class="invite-step-title">{{ t('invite.prepTitle') }}</p>
        <p class="invite-prep">{{ t('invite.prepDesc') }}</p>
        <div class="invite-app-list">
          <p>{{ t('authApp.desc') }}</p>
          <p>{{ t('authApp.alts') }}</p>
          <p class="help-note">{{ t('authApp.miniProgram') }}</p>
        </div>
        <button id="invite-prep-next" class="login-btn" type="button" @click="inviteStep = 3">
          {{ t('invite.prepNext') }}
        </button>
      </div>

      <!-- 824 步骤 3：入驻信息（原步骤 1；前置提醒已升格为独立步骤 2） -->
      <form v-else-if="inviteStep === 3" novalidate @submit.prevent="submitInvite">
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

      <!-- 824 步骤 4：TOTP 首绑（原步骤 2；复用 SetupWizard 同款二维码生成） -->
      <div v-else>
        <p class="invite-step-title">{{ t('invite.step2Title') }}</p>
        <p class="invite-step-desc">{{ t('invite.step2Desc') }}</p>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../../stores/artist'
import { inviteApi } from '../../../api/index'

const emit = defineEmits<{ (e: 'close'): void }>()

const { t, tm } = useI18n()
const router = useRouter()
const store = useArtistStore()

/** 后端 API 错误形状（与登录页 Login.vue 同口径；仅用于 catch 内分支读取） */
interface ApiErrShape {
  code?: string
  message: string
  detail?: { stale?: boolean; remainingAttempts?: number; remainingLockMs?: number }
}

// ─── 入驻流程状态（组件随 v-if 挂载即全新，无需重置逻辑） ───
const overlayRef = ref<HTMLDivElement | null>(null)
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
// 823：扫码页「还没装验证器 App？」折叠开关（与登录页 helpOpen 同款交互，状态独立）
const inviteAppHelpOpen = ref(false)

// ─── 824: 步骤 1 文书必读（滑底/勾选；纸签与文书章节事实源 compliance，只渲染不复制） ───
const policyReached = ref(false)
const policyAgreed = ref(false)
/** compliance.privacy/terms.sections 的章节形状（标题/段落/可选条目列表） */
interface DocSection { title: string; paragraphs: string[]; items?: string[] }
const inviteStepTags = computed(() => [t('invite.tagDocs'), t('invite.tagPrep'), t('invite.tagInfo'), t('invite.tagBind')])
const privacySections = computed(() => tm('compliance.privacy.sections') as unknown as DocSection[])
const termsSections = computed(() => tm('compliance.terms.sections') as unknown as DocSection[])

/** 824: 文书窗滑到底判定（距底 < 24px 即达）——解锁同意勾选，防「秒点下一步」跳过阅读 */
function onDocsScroll(e: Event) {
  if (policyReached.value) return
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) policyReached.value = true
}

onMounted(() => {
  // 初始聚焦：文书窗（tabindex=-1 可聚焦，读屏从正文起）
  ;(overlayRef.value?.querySelector('.invite-docs') as HTMLElement | null)?.focus()
})

/** b1: 邀请流程错误状态清零（两步提交共用） */
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
  const overlay = overlayRef.value
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

/** 824: 四步表单切换后聚焦对应控件（预告按钮/邀请码输入/动态码输入） */
watch(inviteStep, (step) => {
  nextTick(() => {
    const sel = step === 2 ? '#invite-prep-next' : step === 3 ? '#invite-code' : step === 4 ? '#invite-totp' : '.invite-docs'
    ;(overlayRef.value?.querySelector(sel) as HTMLElement | null)?.focus()
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
    inviteQr.value = await generateInviteQr(res.otpauthUri)
    inviteStep.value = 4
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
</script>

<style scoped>
/* ═══ 叠加层骨架（覆盖主卡；824: ::before 同 PaperCard 主纸口径补真纸纹理——此前纯底色盖住
   主卡纹理层致入驻态底纹消失） ═══ */
.invite-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: var(--card);
  border-radius: var(--r-paper);
  overflow-y: auto;
  animation: note-in var(--dur-slow) var(--ease-out);
}
.invite-overlay::before {
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
.invite-overlay-inner { position: relative; padding: 34px 44px 40px; }
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

/* ─── 824: 四步入驻（纸签进度 + 文书同窗必读 + 验证器预告） ─── */
.invite-steps {
  display: flex;
  gap: 6px;
  margin: 0 0 20px;
  padding: 0;
  list-style: none;
}
.invite-steps li {
  flex: 1;
  padding: 6px 2px;
  border: 1px solid var(--line2);
  border-radius: var(--r-s-hand);
  background: var(--paper2);
  font-size: calc(var(--font-scale, 1) * 11px);
  line-height: 1.4;
  color: var(--ink4);
  text-align: center;
  transition: background-color var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.invite-steps li.done { border-color: var(--hq); background: var(--hq-bg); color: var(--hq); }
.invite-steps li.active { border-color: var(--hq-d); background: var(--hq); color: var(--card); }

/* 文书窗：两份文书同窗全文，滑到底解锁勾选 */
.invite-docs {
  max-height: 280px;
  overflow-y: auto;
  padding: 16px 18px;
  border: 1px solid var(--line2);
  border-radius: var(--r-paper);
  background: var(--paper2);
  font-size: calc(var(--font-scale, 1) * 12px);
  line-height: 1.8;
  color: var(--ink2);
}
.invite-docs:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
.invite-doc-h { margin: 14px 0 6px; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); }
.invite-doc-h:first-child { margin-top: 0; }
.invite-docs p { margin: 0 0 8px; }
.invite-docs ul { margin: 0 0 8px 16px; padding: 0; }
.invite-doc-note { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 11px); }
.invite-doc-divider {
  margin: 16px -18px;
  padding: 8px 18px;
  border-top: 1px solid var(--line2);
  border-bottom: 1px solid var(--line2);
  background: var(--hq-bg);
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--hq);
  text-align: center;
  letter-spacing: 0.08em;
}
.invite-scroll-hint {
  margin: 10px 0;
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink4);
  text-align: center;
  transition: color var(--dur-fast);
}
.invite-scroll-hint.done { color: var(--hq); }
.invite-agree {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0 0 16px;
  font-size: calc(var(--font-scale, 1) * 12px);
  line-height: 1.6;
  color: var(--ink2);
}
.invite-agree input { margin-top: 3px; accent-color: var(--hq); }
.invite-agree.locked { color: var(--ink4); }

/* 验证器预告：推荐口径盒（同源 authApp 词条） */
.invite-app-list {
  margin: 0 0 18px;
  padding: 14px 16px;
  border: 1px solid var(--line2);
  border-radius: var(--r-paper);
  background: var(--paper2);
  font-size: calc(var(--font-scale, 1) * 12px);
  line-height: 1.8;
  color: var(--ink2);
}
.invite-app-list p { margin: 0 0 8px; }
.invite-app-list p:last-child { margin-bottom: 0; }

/* 823：验证器预告强提醒（虚线纸签，与入驻入口虚线框同手法） */
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
.field-hint { margin: 6px 0 0; font-size: 11px; color: var(--ink3); }
/* v126①：首绑动态码轮换机制引导（与 step-desc 同色调，只写功能性陈述） */
.invite-totp-guide { margin: 6px 0 0; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); line-height: 1.6; }

/* ═══ 表单样式：与登录页同款口径的副本（登录页 scoped 样式不跨组件生效；
   后续如抽「登录表单样式」公共文件可消重） ═══ */
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

.field-input:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 3px;
}

.field-input:disabled { opacity: 0.6; }

.field-error .field-input {
  border-bottom-color: var(--zs);
  background-image: linear-gradient(var(--zs), var(--zs));
  background-size: 100% 1px;
}

.field-error .field-label { color: var(--zs); }

/* 主按钮：一锭墨（同登录页口径） */
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

/* 错误行：一行小字，淡入不弹跳 */
@keyframes note-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.notice {
  margin: 16px 0 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  line-height: 1.6;
  animation: note-in var(--dur-slow) var(--ease-out);
}

.notice-error { color: var(--zs); }

/* 帮助折叠：与登录页同款口径副本（步骤 4 安装引导用） */
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
.help-note { color: var(--ink3); }

@media (max-width: 768px) {
  .invite-overlay-inner { padding: 24px 24px 28px; }

  /* 移动端点按热区：墨线输入纵向加厚 */
  .field-input { padding: 12px 0; }
}

/* ═══ 无障碍：尊重系统减少动态效果 ═══ */
@media (prefers-reduced-motion: reduce) {
  .notice { animation: none; }
  .btn-spinner { animation: none; }
  .field-input, .help-body-wrap, .help-body, .login-btn, .field-label, .help-toggle {
    transition-duration: 0.01ms;
  }
}
</style>
