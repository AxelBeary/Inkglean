<script setup lang="ts">
// 工程模板·桌面宿主壳（工具箱波5 · F1a）：母版复印件机制的管理面。
// 口径（REQ-014 §F1a）：母版存「我的文档\拾绘\templates\」，选图即复制入库，母版永不被改动；
// 全局默认 + 档位级覆盖（一档一文件）；建单时自动复制副本「客户名-档位名.扩展名」到委托文件夹。
// 模板更换只影响之后的新单；解绑只删绑定不删母版。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLocalTemplatesStore, GLOBAL_KEY } from '../../stores/localTemplates'
import { useLocalLedgerStore } from '../../stores/localLedger'
import { extractFileName } from '../../stores/localFiles'
import { useToolToast } from '../../tools/host'
import { isDesktop } from '../../bridge'

const router = useRouter()
const toast = useToolToast()
const templates = useLocalTemplatesStore()
const ledger = useLocalLedgerStore()

const busy = ref(false)

onMounted(async () => {
  if (!templates.loaded) await templates.loadAll()
  if (!ledger.loaded) await ledger.loadAll()
})

function goHome() { void router.push({ name: 'home' }) }

/** 档位列表：既有绑定 ∪ 记账里出现过的档位（去重去空，保持首现顺序） */
const titles = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of Object.keys(templates.bindings)) {
    if (key && !seen.has(key)) { seen.add(key); out.push(key) }
  }
  for (const o of ledger.orders) {
    const t = o.title.trim()
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out
})

function boundName(key: string): string {
  const p = templates.bindings[key]
  return p ? extractFileName(p) : ''
}

async function pickAndBind(key: string) {
  if (busy.value || !isDesktop()) return
  busy.value = true
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: false,
      title: key ? `为「${key}」选择模板文件` : '选择全局默认模板文件'
    })
    if (typeof picked === 'string' && picked) {
      const ok = await templates.bind(key, picked)
      if (ok) toast.show('模板已入库（复制为母版，原文件不动）')
      else toast.show('模板入库失败，请重试', 'err')
    }
  } catch {
    toast.show('模板入库失败，请重试', 'err')
  } finally {
    busy.value = false
  }
}

async function doUnbind(key: string) {
  await templates.unbind(key)
  toast.show('已解绑（母版仍在模板库，可重新绑定）')
}
</script>

<template>
  <div class="tool-page">
    <header class="tool-bar">
      <button type="button" class="back" @click="goHome">← 回首页</button>
      <span class="badge">工具箱</span>
    </header>

    <div class="tpl-card">
      <h2 class="tpl-title">工程模板</h2>
      <p class="tpl-sub">
        记一笔时自动建工程文件：模板复制为「客户名-档位名」副本放进委托文件夹，模板本体永不被改动
      </p>

      <p v-if="templates.unavailable" class="tpl-empty">本地数据层仅在桌面壳内可用</p>

      <template v-else>
        <!-- 全局默认 -->
        <div class="tpl-row tpl-row--global">
          <div class="tpl-key">
            <span class="k">全局默认</span>
            <span class="kd">未绑档位级模板的单子用它</span>
          </div>
          <span v-if="boundName(GLOBAL_KEY)" class="tpl-file" :title="templates.bindings[GLOBAL_KEY]">{{ boundName(GLOBAL_KEY) }}</span>
          <span v-else class="tpl-none">未设置</span>
          <button type="button" class="mini" :disabled="busy" @click="pickAndBind(GLOBAL_KEY)">
            {{ boundName(GLOBAL_KEY) ? '更换' : '选择模板' }}
          </button>
          <button v-if="boundName(GLOBAL_KEY)" type="button" class="mini mini--dim" :disabled="busy" @click="doUnbind(GLOBAL_KEY)">解绑</button>
        </div>

        <!-- 档位级绑定 -->
        <p class="sec">档位级模板（一档一文件，优先于全局默认）</p>
        <p v-if="titles.length === 0" class="tpl-empty">还没有档位——先去本地记账记几笔（内容如：头像、半身）</p>
        <div v-for="t in titles" :key="t" class="tpl-row">
          <span class="tpl-key-name" :title="t">{{ t }}</span>
          <span v-if="boundName(t)" class="tpl-file" :title="templates.bindings[t]">{{ boundName(t) }}</span>
          <span v-else class="tpl-none">跟随全局默认</span>
          <button type="button" class="mini" :disabled="busy" @click="pickAndBind(t)">
            {{ boundName(t) ? '更换' : '绑定' }}
          </button>
          <button v-if="boundName(t)" type="button" class="mini mini--dim" :disabled="busy" @click="doUnbind(t)">解绑</button>
        </div>
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

.tpl-card {
  max-width: 640px; background: var(--card); border: 1px solid rgba(38, 37, 32, .06);
  border-radius: var(--r-paper); padding: 20px 24px 22px;
}
.tpl-title { font-family: var(--f-d); font-size: 19px; font-weight: 700; letter-spacing: .06em; color: var(--ink); }
.tpl-sub { font-size: 12px; color: var(--ink4); margin: 4px 0 14px; }
.tpl-empty { font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); margin: 8px 0; }
.sec { font-size: 11px; letter-spacing: .12em; color: var(--ink4); margin: 16px 0 6px; }

.tpl-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 0; min-width: 0;
}
.tpl-row + .tpl-row { border-top: 1px solid rgba(38, 37, 32, .06); }
.tpl-row--global { background: var(--paper2); border-radius: var(--r-s-hand); padding: 10px 12px; }
.tpl-key { display: flex; flex-direction: column; gap: 2px; flex: none; width: 168px; }
.tpl-key .k { font-size: 13px; font-weight: 600; color: var(--ink2); }
.tpl-key .kd { font-size: 11px; color: var(--ink4); }
.tpl-key-name {
  font-size: 13px; font-weight: 600; color: var(--ink2); flex: none; width: 168px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tpl-file {
  font-size: 12.5px; color: var(--ink3); flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tpl-none { font-size: 12px; color: var(--ink4); flex: 1; min-width: 0; }
.mini {
  font-size: 12px; color: var(--ink2); padding: 4px 12px; flex: none;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--paper2);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.mini:hover:not(:disabled) { color: var(--hq-d); border-color: var(--hq); }
.mini:disabled { opacity: .55; cursor: wait; }
.mini--dim { color: var(--ink4); }
.mini--dim:hover:not(:disabled) { color: var(--zs-d); border-color: var(--zs-t); }

/* 纸签 toast（与其余工具页同款） */
.toast {
  position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 60;
  font-size: 12.5px; color: var(--ink2); padding: 8px 18px; white-space: nowrap;
  background: var(--card); border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  box-shadow: 0 2px 4px rgba(38, 37, 32, .08), 0 14px 28px -18px rgba(38, 37, 32, .5);
}
.toast--err { color: var(--zs-d); border-color: var(--zs-t); }
.toast-enter-active, .toast-leave-active { transition: opacity var(--dur-mid) var(--ease-out), transform var(--dur-mid) var(--ease-out); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }
</style>
