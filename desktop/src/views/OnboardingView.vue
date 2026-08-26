<script setup lang="ts">
// 首次启动引导（本地核心环波12）：REQ-014「桌面体验设置」口径——
// 首启走向导，覆盖模式选择 + 开机自启/关闭行为偏好 + 文件口径说明，
// 全部可跳过（每步右上「跳过引导」）、后续墨笔菜单里可改。
// 读失败口径见 tools/onboarding（宁可错过引导，不困住用户）。
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { markOnboarded } from '../tools/onboarding'
import {
  getAutostart, setAutostart, readCloseBehaviorPref, writeCloseBehaviorPref, setCloseBehavior
} from '../bridge/window'
import type { CloseBehavior } from '../bridge/window'
import { isDesktop } from '../bridge'

const router = useRouter()
const auth = useAuthStore()

const step = ref(1)
const chosenLocal = ref(false)
const desktop = isDesktop()
const autostart = ref<boolean | null>(null)
const closeBehavior = ref<CloseBehavior>(readCloseBehaviorPref())

onMounted(() => {
  if (desktop) {
    getAutostart().then(v => { autostart.value = v }).catch(() => { autostart.value = null })
  }
})

// ─── 步骤一：模式选择 ───
function chooseLocal() {
  chosenLocal.value = true
  step.value = 2
}
function chooseCloud() {
  chosenLocal.value = false
  step.value = 2
}

// ─── 步骤二：开机自启 + 关闭行为 ───
async function toggleAutostart() {
  if (autostart.value === null) return
  const target = !autostart.value
  try {
    await setAutostart(target)
    autostart.value = target
  } catch { /* 设置失败：回显不变，引导里不纠缠 */ }
}
async function chooseClose(b: CloseBehavior) {
  closeBehavior.value = b
  writeCloseBehaviorPref(b)
  if (desktop) setCloseBehavior(b).catch(() => { /* 同步失败静默，落盘已生效 */ })
}

// ─── 完成 / 跳过：都尊重已选模式（未选默认走登录页） ───
async function finish() {
  markOnboarded()
  if (chosenLocal.value) {
    auth.enterLocalMode()
    await router.push({ name: 'home' })
  } else {
    await router.push({ name: 'login' })
  }
}
function skip() {
  void finish()
}
</script>

<template>
  <div class="ob-page">
    <div class="ob-card">
      <button v-if="step < 3" type="button" class="ob-skip" @click="skip">跳过引导 →</button>

      <!-- 步骤一：欢迎 + 模式选择 -->
      <template v-if="step === 1">
        <h1 class="ob-title">拾绘</h1>
        <p class="ob-sub">画师的接稿小书房——记账、排文件、出图、数时间，都在这张案头上</p>
        <div class="ob-modes">
          <button type="button" class="ob-mode" @click="chooseLocal">
            <span class="m-name">本地直接用</span>
            <span class="m-desc">不登录，数据仅存本机——记账、文件、模板、计时全能用</span>
          </button>
          <button type="button" class="ob-mode" @click="chooseCloud">
            <span class="m-name">登录使用</span>
            <span class="m-desc">同步你的约稿小店——留言、订单、排期与网页版同源</span>
          </button>
        </div>
        <p class="ob-note">之后想换：登录页随时有「暂不登录 · 本地模式」，登录态里也能切出</p>
      </template>

      <!-- 步骤二：开机自启 + 关闭行为 -->
      <template v-else-if="step === 2">
        <h2 class="ob-title2">桌面习惯</h2>
        <p class="ob-sub">两项小事，之后墨笔菜单里随时能改</p>
        <div class="ob-rows">
          <button
            v-if="autostart !== null"
            type="button"
            class="ob-row"
            :aria-pressed="autostart"
            @click="toggleAutostart"
          >
            <span class="r-name">开机自动启动</span>
            <span class="r-desc">安静到托盘，不打扰</span>
            <span class="inksw" :class="{ on: autostart }" aria-hidden="true"></span>
          </button>
          <div class="ob-row ob-row--static">
            <span class="r-name">关闭时</span>
            <span class="r-desc">退出的去向</span>
            <span class="r-opts">
              <button type="button" class="opt" :class="{ on: closeBehavior === 'quit' }" @click="chooseClose('quit')">直接退出</button>
              <button type="button" class="opt" :class="{ on: closeBehavior === 'tray' }" @click="chooseClose('tray')">最小化到托盘</button>
            </span>
          </div>
        </div>
        <div class="ob-foot">
          <button type="button" class="ob-back" @click="step = 1">← 上一步</button>
          <button type="button" class="ob-next" @click="step = 3">下一步</button>
        </div>
      </template>

      <!-- 步骤三：文件口径 + 开始 -->
      <template v-else>
        <h2 class="ob-title2">文件的事，说清楚</h2>
        <div class="ob-points">
          <p><b>工程文件归你管。</b>拾绘只记位置、不搬不动你的 CSP/PSD——Everything 能搜、别的软件能开。</p>
          <p><b>模板与备份有固定家。</b>工程模板在「我的文档\拾绘\templates」，自动备份在「我的文档\拾绘\backups」。</p>
          <p><b>数据仅存本机。</b>记账、档案、画画时间永不上传；「数据导出」随时导一份安心。</p>
        </div>
        <div class="ob-foot ob-foot--end">
          <button type="button" class="ob-back" @click="step = 2">← 上一步</button>
          <button type="button" class="ob-next" @click="finish">
            {{ chosenLocal ? '开始使用（本地模式）' : '去登录' }}
          </button>
        </div>
      </template>

      <!-- 步进墨点 -->
      <div class="ob-dots" aria-hidden="true">
        <i v-for="n in 3" :key="n" :class="{ on: step === n }"></i>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ob-page {
  min-height: 100vh; background: var(--paper);
  display: flex; align-items: center; justify-content: center; padding: 32px;
}
.ob-card {
  position: relative; width: min(560px, 100%);
  background: var(--card); border: 1px solid rgba(38, 37, 32, .08); border-radius: var(--r-paper);
  padding: 34px 38px 46px;
}
.ob-skip {
  position: absolute; top: 14px; right: 16px;
  font-size: 12px; color: var(--ink4); padding: 4px 8px; border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), background var(--dur-fast);
}
.ob-skip:hover { color: var(--ink2); background: rgba(38, 37, 32, .05); }

.ob-title { font-family: var(--f-d); font-size: 34px; font-weight: 700; letter-spacing: .18em; color: var(--ink); text-align: center; }
.ob-title2 { font-family: var(--f-d); font-size: 22px; font-weight: 700; letter-spacing: .1em; color: var(--ink); text-align: center; }
.ob-sub { font-size: 13px; color: var(--ink3); text-align: center; margin: 10px 0 22px; }
.ob-note { font-size: 11.5px; color: var(--ink4); text-align: center; margin-top: 16px; }

/* 步骤一：模式两张纸签 */
.ob-modes { display: flex; gap: 14px; }
.ob-mode {
  flex: 1; display: flex; flex-direction: column; gap: 6px; text-align: left;
  padding: 16px 18px; background: var(--paper2);
  border: 1px solid var(--line); border-radius: var(--r-s-hand);
  transition: border-color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast) var(--ease-out);
}
.ob-mode:hover { border-color: var(--hq); background: var(--hq-t); transform: translateY(-1px); }
.ob-mode .m-name { font-family: var(--f-d); font-size: 16px; font-weight: 700; color: var(--ink); }
.ob-mode .m-desc { font-size: 12px; color: var(--ink3); line-height: 1.5; }

/* 步骤二：习惯两行 */
.ob-rows { display: flex; flex-direction: column; gap: 10px; }
.ob-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
  transition: border-color var(--dur-fast);
}
.ob-row:hover { border-color: var(--ink4); }
.ob-row--static { cursor: default; }
.r-name { font-size: 13.5px; font-weight: 600; color: var(--ink2); flex: none; }
.r-desc { font-size: 12px; color: var(--ink4); flex: 1; }
.r-opts { display: flex; gap: 8px; flex: none; }
.opt {
  font-size: 12px; color: var(--ink3); padding: 4px 12px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--card);
  transition: color var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.opt.on { color: var(--hq-d); border-color: var(--hq); background: var(--hq-t); }
/* 墨开关（与墨笔菜单同款） */
.inksw {
  flex: none; position: relative; width: 32px; height: 18px; border-radius: var(--r-pill);
  background: var(--line2); transition: background var(--dur-mid) var(--ease-out);
}
.inksw::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--card); transition: left var(--dur-mid) var(--ease-out);
}
.inksw.on { background: var(--hq); }
.inksw.on::after { left: 16px; }

/* 步骤三：口径三条 */
.ob-points { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
.ob-points p { font-size: 13px; color: var(--ink3); line-height: 1.7; }
.ob-points b { color: var(--ink); font-weight: 600; }

/* 底部操作 */
.ob-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 24px; }
.ob-foot--end { justify-content: space-between; }
.ob-back {
  font-size: 12.5px; color: var(--ink4); padding: 6px 12px; border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), background var(--dur-fast);
}
.ob-back:hover { color: var(--ink2); background: rgba(38, 37, 32, .05); }
.ob-next {
  font-size: 13.5px; font-weight: 500; color: var(--hq-d); padding: 8px 24px;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast);
}
.ob-next:hover { color: var(--hq); background: var(--hq-t2); border-color: var(--hq); }

/* 步进墨点 */
.ob-dots { display: flex; justify-content: center; gap: 8px; margin-top: 22px; }
.ob-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--line2); transition: background var(--dur-mid); }
.ob-dots i.on { background: var(--hq); }
</style>
