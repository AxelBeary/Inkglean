<script setup lang="ts">
// 桌面登录页（825 波0 地基批）：首发仅 TOTP（REQ-014 拍板）。
// 后端 /api/auth/desktop/login（v73 记账式会话）：401 错误文案直接来自服务端（同网页登录口径）。
// 凭证落 Windows 系统保险箱（DPAPI），页面无任何明文持久化。
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { isDesktop, BridgeUnavailableError } from "../bridge";
import TitleBar from "../components/shell/TitleBar.vue";

const router = useRouter();
const auth = useAuthStore();

const qq = ref("");
const code = ref("");
const loading = ref(false);
const errorText = ref("");

// 纯浏览器环境无保险箱（逃生门纪律）：给出启动方式提示，不放行登录
const desktopShell = isDesktop();

async function submit() {
  if (loading.value) return;
  errorText.value = "";
  const qqNumber = qq.value.trim();
  const sixDigit = code.value.trim();
  if (!/^\d{5,15}$/.test(qqNumber)) {
    errorText.value = "请输入 QQ 号（5~15 位数字）";
    return;
  }
  if (!/^\d{6}$/.test(sixDigit)) {
    errorText.value = "请输入验证器里的 6 位数字";
    return;
  }
  loading.value = true;
  try {
    await auth.login(qqNumber, sixDigit);
    await router.push({ name: "home" });
  } catch (e) {
    if (e instanceof BridgeUnavailableError) {
      errorText.value = "保险箱不可用：请用桌面壳启动（npm run tauri dev）";
    } else {
      const api = (e as { api?: { error?: string } }).api;
      errorText.value = api?.error ?? "登录失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

// 双模式入口（方向 A）：「暂不登录 · 本地模式」——不调任何云端接口，数据仅存本机
async function goLocal() {
  auth.enterLocalMode();
  await router.push({ name: "home" });
}
</script>

<template>
  <TitleBar />
  <main class="login-page">
    <div class="login-card">
      <div class="brand">
        <span class="seal">拾</span>
        <h1>拾绘桌面版</h1>
      </div>
      <p class="sub">用验证器登录，90 天内免重复（每周活跃自动顺延）</p>

      <div class="field">
        <label for="qq">QQ 号</label>
        <input
          id="qq" v-model="qq" type="text" inputmode="numeric" autocomplete="username"
          placeholder="入驻时的 QQ 号" maxlength="15"
        />
      </div>
      <div class="field">
        <label for="code">6 位验证码</label>
        <input
          id="code" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code"
          placeholder="验证器当前显示的 6 位数字" maxlength="6"
          @keyup.enter="submit"
        />
      </div>

      <p v-if="errorText" class="error">{{ errorText }}</p>
      <p v-if="!desktopShell" class="error">当前为纯浏览器环境，登录需桌面壳（npm run tauri dev）</p>

      <button type="button" class="btn-primary" :disabled="loading || !desktopShell" @click="submit">
        {{ loading ? "登录中…" : "登录" }}
      </button>
      <button type="button" class="btn-local" @click="goLocal">暂不登录 · 本地模式</button>
      <p class="local-hint">本地模式：数据仅存本机，不联网同步</p>
    </div>
  </main>
</template>

<style scoped>
/* 纸墨风登录：纸卡居中 + 朱砂小印，与网页登录页同语言 */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login-card {
  width: min(92vw, 400px);
  padding: 32px 28px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-paper);
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand h1 { font-family: var(--f-d); font-size: 24px; margin: 0; color: var(--ink); }
.seal {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: var(--zs); color: var(--white);
  font-family: var(--f-d); font-size: 20px;
  border-radius: var(--r-paper);
  transform: rotate(-4deg);
}
.sub { margin: 8px 0 24px; font-size: 13px; color: var(--ink3); }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 14px; color: var(--ink2); margin-bottom: 8px; }
.field input {
  width: 100%; box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper2);
  color: var(--ink);
  font-size: 16px;
  letter-spacing: 0.02em;
}
.field input:focus { outline: 2px solid var(--hq); outline-offset: -1px; }
.error { color: var(--zs); font-size: 13px; margin: 0 0 12px; }
.btn-primary {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: var(--r-m);
  background: var(--hq);
  color: var(--card);
  font-size: 16px;
  cursor: pointer;
  transition: background-color var(--dur-fast);
}
.btn-primary:hover:not(:disabled) { background: var(--hq-d); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-local {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border: 1px dashed var(--line2);
  border-radius: var(--r-m);
  background: none;
  color: var(--ink2);
  font-size: 14px;
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.btn-local:hover { color: var(--ink); border-color: var(--ink4); }
.local-hint { margin: 10px 0 0; font-size: 12px; color: var(--ink4); text-align: center; }
</style>
