<script setup lang="ts">
// 数据导出·桌面宿主壳（本地核心环波9 + 波10）：REQ-014「数据迁移与备份」——
// 导出纯手动一键（数据包＝库+设置+文件清单）；导入＝替换策略（不合并），
// 有本地数据时先自动备份再替换（冲突强提醒口径），工程文件关联复用 F1 重新指路。
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLocalLedgerStore } from '../../stores/localLedger'
import { useLocalFilesStore } from '../../stores/localFiles'
import { useLocalProfileStore } from '../../stores/localProfile'
import { useLocalTemplatesStore } from '../../stores/localTemplates'
import { runExport } from '../../tools/exportData'
import { parseBackup, pickBackupFile, readBackup, runImport } from '../../tools/importData'
import { useToolToast } from '../../tools/host'
import { isDesktop } from '../../bridge'

const router = useRouter()
const toast = useToolToast()
const ledger = useLocalLedgerStore()
const filesStore = useLocalFilesStore()
const profile = useLocalProfileStore()
const templates = useLocalTemplatesStore()

const busy = ref(false)

onMounted(async () => {
  if (!ledger.loaded) await ledger.loadAll()
  if (!filesStore.loaded) await filesStore.loadAll()
  if (!profile.loaded) await profile.load()
  if (!templates.loaded) await templates.loadAll()
})

function goHome() { void router.push({ name: 'home' }) }

async function doExport() {
  if (busy.value || !isDesktop()) return
  busy.value = true
  try {
    const allFiles = Object.values(filesStore.files).flat()
    const r = await runExport(allFiles, ledger.orders)
    if (r.ok) toast.show(`已导出（${r.counts.orders} 笔账 · ${r.counts.files} 个文件关联）`)
    else if (r.path === 'cancelled') { /* 用户收手，不提示 */ }
    else toast.show('导出失败，请重试', 'err')
  } catch {
    toast.show('导出失败，请重试', 'err')
  } finally {
    busy.value = false
  }
}

// ─── 导入（波10）：替换策略 + 冲突强提醒 + 替换前自动备份 ───
async function doImport() {
  if (busy.value || !isDesktop()) return
  busy.value = true
  try {
    const path = await pickBackupFile()
    if (!path) return // 用户取消，不提示
    const b64 = await readBackup(path)
    const preview = await parseBackup(b64)
    if (!preview.ok) {
      toast.show(preview.reason, 'err')
      return
    }
    // 冲突强提醒（REQ 口径）：有本地数据时先说清替换后果，取消即罢手
    if (ledger.orders.length > 0) {
      const msg = `⚠️ 你本地已有 ${ledger.orders.length} 笔记账。导入将替换它们。\n替换前会把当前数据自动备份为备份包，万一后悔可恢复。\n\n确定替换？`
      if (!window.confirm(msg)) return
    }
    const allFiles = Object.values(filesStore.files).flat()
    const r = await runImport(allFiles, ledger.orders, preview)
    if (!r.ok) {
      toast.show(r.reason, 'err')
      return
    }
    // 重载各 store 让界面吃到新数据（库连接已在导入时重建）
    await ledger.loadAll()
    await filesStore.loadAll()
    await profile.load()
    await templates.loadAll()
    toast.show(r.backupPath ? '导入成功（替换前数据已自动备份）' : '导入成功')
  } catch {
    toast.show('导入失败，请重试', 'err')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tool-page">
    <header class="tool-bar">
      <button type="button" class="back" @click="goHome">← 回首页</button>
      <span class="badge">工具箱</span>
    </header>

    <div class="exp-card">
      <h2 class="exp-title">数据导出</h2>
      <p class="exp-sub">把本地数据打包成一个备份文件（zip），数据仅存本机——导一份，安心一份</p>

      <p v-if="!isDesktop()" class="exp-empty">导出仅在桌面壳内可用</p>

      <template v-else>
        <!-- 包里有什么 -->
        <div class="exp-list">
          <div class="exp-row">
            <span class="k">本地数据库</span>
            <span class="v">
              记账 {{ ledger.orders.length }} 笔 · 档案 {{ profile.profile.nickname ? '已建' : '未建' }} · 模板绑定 {{ Object.keys(templates.bindings).length }} 条
            </span>
          </div>
          <div class="exp-row">
            <span class="k">文件清单</span>
            <span class="v">{{ Object.values(filesStore.files).flat().length }} 个工程文件的路径与所属委托（本体不打包）</span>
          </div>
          <div class="exp-row">
            <span class="k">本地设置</span>
            <span class="v">布局偏好 / 关闭行为 / 工具草稿</span>
          </div>
          <div class="exp-row">
            <span class="k">不包含</span>
            <span class="v dim">平台缓存图片（登录重新拉）· 工程文件本体（自行搬运最快）</span>
          </div>
        </div>

        <button type="button" class="ok" :disabled="busy" @click="doExport">
          {{ busy ? '打包中…' : '选择位置并导出' }}
        </button>
        <p class="exp-hint">💡 将导出位置选到坚果云 / OneDrive 同步文件夹，可实现自动云备份</p>

        <!-- 导入（波10）：替换口径，与导出成对成环 -->
        <div class="exp-div"></div>
        <h3 class="exp-title2">数据导入</h3>
        <p class="exp-sub">
          从备份包恢复将 <b>替换</b> 当前本地数据（不合并）；已有数据会先自动备份，工程文件找不到的可在记账文件区重新指路。
        </p>
        <button type="button" class="ok ok--ghost" :disabled="busy" @click="doImport">
          {{ busy ? '处理中…' : '选择备份包并导入' }}
        </button>
      </template>
    </div>

    <transition name="toast">
      <div v-if="toast.visible.value" class="toast" :class="`toast--${toast.kind.value}`" role="status">
        {{ toast.text.value }}
      </div>
    </transition>
  </div>
</template>

<style scoped>
.tool-page { min-height: 100vh; background: var(--paper); padding: 18px clamp(16px, 6vw, 72px) 48px; }
.tool-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.back {
  font-size: 12.5px; color: var(--ink3); padding: 5px 12px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.back:hover { color: var(--ink); border-color: var(--ink4); }
.badge {
  font-size: 11px; color: var(--hq-d); padding: 3px 9px;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
}

.exp-card {
  max-width: 560px; background: var(--card); border: 1px solid rgba(var(--ink-rgb), .06);
  border-radius: var(--r-paper); padding: 20px 24px 22px;
}
.exp-title { font-family: var(--f-d); font-size: 19px; font-weight: 700; letter-spacing: .06em; color: var(--ink); }
.exp-sub { font-size: 12px; color: var(--ink4); margin: 4px 0 14px; }
.exp-empty { font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }

.exp-list { display: flex; flex-direction: column; gap: 0; margin-bottom: 16px; }
.exp-row {
  display: flex; align-items: baseline; gap: 12px; padding: 8px 0;
}
.exp-row + .exp-row { border-top: 1px solid rgba(var(--ink-rgb), .06); }
.exp-row .k { flex: none; width: 84px; font-size: 12.5px; color: var(--ink3); }
.exp-row .v { font-size: 12.5px; color: var(--ink2); }
.exp-row .v.dim { color: var(--ink4); }

.ok {
  font-size: 13px; color: var(--hq-d); font-weight: 500; padding: 8px 22px;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.ok:hover:not(:disabled) { color: var(--hq); background: var(--hq-t2); border-color: var(--hq); }
.ok:disabled { opacity: .55; cursor: wait; }
.ok--ghost { background: var(--paper2); color: var(--ink2); border-color: var(--line2); }
.ok--ghost:hover:not(:disabled) { color: var(--ink); background: rgba(var(--ink-rgb), .05); border-color: var(--ink4); }
.exp-hint { margin-top: 10px; font-size: 11.5px; color: var(--ink4); }
.exp-div { height: 1px; background: rgba(var(--ink-rgb), .08); margin: 18px 0 14px; }
.exp-title2 { font-family: var(--f-d); font-size: 15px; font-weight: 700; letter-spacing: .06em; color: var(--ink); }
.exp-sub b { color: var(--zs-d); }

/* 纸签 toast（与其余工具页同款） */
.toast {
  position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 60;
  font-size: 12.5px; color: var(--ink2); padding: 8px 18px; white-space: nowrap;
  background: var(--card); border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  box-shadow: 0 2px 4px rgba(var(--ink-rgb), .08), 0 14px 28px -18px rgba(var(--ink-rgb), .5);
}
.toast--err { color: var(--zs-d); border-color: var(--zs-t); }
.toast-enter-active, .toast-leave-active { transition: opacity var(--dur-mid) var(--ease-out), transform var(--dur-mid) var(--ease-out); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }
</style>
