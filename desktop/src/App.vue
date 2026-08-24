<script setup lang="ts">
import { onMounted, ref } from "vue";
// 业务代码只认 desktop-bridge，不直接 import Tauri API（逃生门纪律）
import { isDesktop, ping, pickDirectory, BridgeUnavailableError, checkAndDownloadUpdate, installPendingUpdate } from "./bridge";

const desktop = isDesktop();
const pingResult = ref("");
const pickedDir = ref("");

onMounted(async () => {
  if (!desktop) return;
  try {
    pingResult.value = await ping();
  } catch {
    pingResult.value = "失败";
  }
  // 更新通道（825）：启动静默检查+下载（验签失败拒装），失败全静默不打扰；
  // 下载完成后择机提示重启生效（静默语义拍板口径）
  try {
    const result = await checkAndDownloadUpdate();
    if (result === "downloaded") {
      if (window.confirm("新版本已下载，现在重启完成更新？")) {
        await installPendingUpdate();
      }
    }
  } catch {
    // 端点未配置/无网络/验签拒装：静默降级，不影响主流程
  }
});

async function chooseDir() {
  try {
    const dir = await pickDirectory("选择委托归档目录");
    pickedDir.value = dir ?? "（已取消）";
  } catch (e) {
    if (e instanceof BridgeUnavailableError) {
      pickedDir.value = e.message;
    } else {
      throw e;
    }
  }
}
</script>

<template>
  <main class="container">
    <h1>拾绘桌面版</h1>
    <p class="status">
      运行环境：{{ desktop ? "Tauri 桌面壳" : "纯浏览器（原生能力不可用）" }}
    </p>
    <p v-if="desktop" class="status">
      前后端通路：{{ pingResult ? `正常（应用版本 ${pingResult}）` : "检测中…" }}
    </p>
    <div class="row">
      <button type="button" @click="chooseDir">选择目录（测试系统对话框）</button>
    </div>
    <p v-if="pickedDir" class="status">{{ pickedDir }}</p>
  </main>
</template>

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: #0f0f0f;
  background-color: #f6f6f6;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

.container {
  margin: 0;
  padding-top: 10vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.status {
  color: #555;
}

.row {
  display: flex;
  justify-content: center;
  margin-top: 1em;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  color: #0f0f0f;
  background-color: #ffffff;
}

button:hover {
  border-color: #396cd8;
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #f6f6f6;
    background-color: #2f2f2f;
  }

  .status {
    color: #aaa;
  }

  button {
    color: #ffffff;
    background-color: #0f0f0f98;
  }
}
</style>
