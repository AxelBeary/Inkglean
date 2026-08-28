<script setup lang="ts">
// 模块管理页（档②波17 三件）：规范 v0.3 §四展示强制点——
// 按 manifest 逐条列能力（联网/读写/联动/后台/设置项 + reason 人话）+ 四态标识
// （正常/停用/失效/灰牌）+ 停用/启用/查看报错/移除四件操作 + 设置项壳统一渲染。
// 转义纪律（审计 M9）：一切来自 manifest 的文案走文本插值（天然转义），永不 v-html。
// 移除口径（F1 哲学）：模块目录即插件本体，壳不删文件，给提示让画师到文件夹处理。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useModulesStore } from '../../modules/store'
import type { ModuleEntry } from '../../modules/registry'
import type { ModuleState } from '../../modules/types'
import { useToolToast } from '../../tools/host'
import { installSampleModule } from '../../bridge/modules'

const router = useRouter()
const toast = useToolToast()
const store = useModulesStore()

/** 报错详情展开态（查看报错操作） */
const expandedReasons = ref<Set<string>>(new Set())

onMounted(async () => {
  if (!store.scanned) await store.scan()
})

function goHome() { void router.push({ name: 'home' }) }

async function rescan() {
  await store.scan()
  toast.show('已重新扫描模块目录（文件变更下次启动才生效，扫描只认当前文件）')
}

// ─── 一键安装示例模块（波17 五件）：稿情气象台随壳内嵌，装了即是活样板 ───
const installing = ref(false)
async function installSample() {
  if (installing.value) return
  installing.value = true
  try {
    await installSampleModule()
    await store.scan()
    toast.show('示例模块「稿情气象台」已安装，回首页可见')
  } catch (e) {
    toast.show(e instanceof Error ? e.message : '安装失败', 'err')
  } finally {
    installing.value = false
  }
}

const countText = computed(() => {
  const ok = store.entries.filter(e => store.stateOf(e) === 'ok').length
  return store.entries.length === 0 ? '' : `${ok}/${store.entries.length} 个可用`
})

function stateLabel(s: ModuleState): string {
  switch (s) {
    case 'ok': return '正常'
    case 'disabled': return '已停用'
    case 'invalid': return '已失效'
    case 'grey': return '灰牌'
  }
}

function entryId(e: ModuleEntry): string {
  return e.manifest?.id ?? e.dirName
}

function toggleEnabled(e: ModuleEntry) {
  const id = entryId(e)
  const cur = store.stateOf(e)
  if (cur === 'invalid') return // 失效态不可启用（待更新/移除）
  store.setEnabled(id, cur !== 'ok' && cur !== 'grey')
}

function toggleReasons(e: ModuleEntry) {
  const id = entryId(e)
  const next = new Set(expandedReasons.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expandedReasons.value = next
}

/** 能力清单（人话展示，照 manifest 声明逐条列） */
function capsOf(e: ModuleEntry): string[] {
  const m = e.manifest
  if (!m) return []
  const caps: string[] = []
  const net = m.network.scope === 'none' ? '不联网' : m.network.scope === 'lan' ? '内网' : '外网（首发拒发）'
  caps.push(`联网：${net}${m.network.reason ? `——${m.network.reason}` : ''}`)
  const own = m.data.write.own ? '有私有存储（5MB 配额）' : '无私有存储'
  const shared = m.data.write.shared === 'none' ? '不写共享数据' : m.data.write.shared === 'ro' ? '只读共享数据' : '读写共享数据（首发拒发）'
  caps.push(`读写：${own}；${shared}${m.data.write.reason ? `——${m.data.write.reason}` : ''}`)
  if (m.data.views.length > 0) caps.push(`订阅视图：${m.data.views.join('、')}`)
  const link = [
    m.linkage.subscribes.length > 0 ? `订阅 ${m.linkage.subscribes.join('、')}` : '',
    m.linkage.emits.length > 0 ? `发布 ${m.linkage.emits.join('、')}` : ''
  ].filter(Boolean).join('；')
  caps.push(link ? `联动：${link}` : '联动：无')
  const life = m.runtime.lifecycle === 'resident'
    ? `常驻（首发按页面可见降级运行${m.runtime.wakeInterval ? `，唤醒 ${m.runtime.wakeInterval}` : ''}）`
    : '页面可见时运行'
  caps.push(`后台：${life}`)
  return caps
}
</script>

<template>
  <div class="tool-page">
    <header class="tool-bar">
      <button type="button" class="back" @click="goHome">← 回首页</button>
      <span class="badge">工具箱</span>
      <span v-if="countText" class="count">{{ countText }}</span>
      <button type="button" class="rescan" :disabled="installing" @click="installSample">装示例模块</button>
      <button type="button" class="rescan" @click="rescan">重新扫描</button>
    </header>

    <div class="mod-card">
      <h2 class="mod-title">模块管理</h2>
      <p class="mod-sub">
        模块放在「我的文档\拾绘\modules」，每个模块一个文件夹（内含 manifest.json 与 panel.js）；
        改文件下次启动生效，本页「重新扫描」可刷新清单。
      </p>

      <p v-if="store.unavailable" class="mod-empty">模块机制仅在桌面壳内可用</p>
      <p v-else-if="store.entries.length === 0" class="mod-empty">
        还没有模块——点上方「装示例模块」装个稿情气象台看看，
        或到「我的文档\拾绘\modules」建自己的模块文件夹（AI 可照规范直写）
      </p>

      <div v-else class="mods">
        <article
          v-for="e in store.entries"
          :key="e.dirName"
          class="mod"
          :class="`mod--${store.stateOf(e)}`"
        >
          <header class="mod-head">
            <span class="m-name">{{ e.manifest?.name ?? e.dirName }}</span>
            <span class="m-ver">{{ e.manifest?.version ?? '' }}</span>
            <span class="m-src">{{ e.manifest ? '外部' : '未知' }}</span>
            <span class="m-state">{{ stateLabel(store.stateOf(e)) }}</span>
          </header>
          <p v-if="e.manifest?.description" class="m-desc">{{ e.manifest.description }}</p>

          <!-- 能力清单（人话逐条） -->
          <ul v-if="store.stateOf(e) !== 'invalid'" class="caps">
            <li v-for="(c, i) in capsOf(e)" :key="i">{{ c }}</li>
          </ul>

          <!-- 报错/失效原因（查看报错） -->
          <button
            v-if="e.reasons.length > 0"
            type="button"
            class="reasons-toggle"
            :aria-expanded="expandedReasons.has(entryId(e))"
            @click="toggleReasons(e)"
          >
            {{ expandedReasons.has(entryId(e)) ? '收起原因' : `查看报错（${e.reasons.length}）` }}
          </button>
          <ul v-if="expandedReasons.has(entryId(e))" class="reasons">
            <li v-for="(r, i) in e.reasons" :key="i">{{ r }}</li>
          </ul>

          <!-- 设置项（壳统一渲染，模块永不自己画 UI） -->
          <div v-if="e.manifest && e.manifest.settings.length > 0 && store.stateOf(e) === 'ok'" class="settings">
            <div v-for="s in e.manifest.settings" :key="s.name" class="setting">
              <span class="s-title">{{ s.title }}</span>
              <span v-if="s.description" class="s-desc">{{ s.description }}</span>
              <span v-if="s.options && s.options.length > 0" class="s-opts">
                <button
                  v-for="opt in s.options"
                  :key="opt"
                  type="button"
                  class="s-opt"
                  :aria-pressed="store.getSetting(entryId(e), s.name, s.default ?? '') === opt"
                  @click="store.setSetting(entryId(e), s.name, opt)"
                >{{ opt }}</button>
              </span>
              <input
                v-else
                type="text"
                class="s-input"
                :value="store.getSetting(entryId(e), s.name, s.default ?? '')"
                @change="store.setSetting(entryId(e), s.name, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>

          <!-- 操作区：停用/启用 + 移除提示 -->
          <footer class="mod-foot">
            <button
              v-if="store.stateOf(e) !== 'invalid'"
              type="button"
              class="op"
              @click="toggleEnabled(e)"
            >
              {{ store.stateOf(e) === 'ok' ? '停用' : '启用' }}
            </button>
            <span class="op-hint">移除：到「我的文档\拾绘\modules」删除文件夹后重新扫描</span>
          </footer>
        </article>
      </div>
    </div>

    <transition name="toast">
      <div v-if="toast.visible.value" class="toast" :class="`toast--${toast.kind.value}`" role="status">
        {{ toast.text.value }}
      </div>
    </transition>
  </div>
</template>

<style scoped>
.tool-page { min-height: var(--app-h); background: var(--paper); padding: 18px clamp(16px, 6vw, 72px) 48px; } /* 827：--app-h 不写 100vh（字号 zoom 超窗） */
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
.count { font-size: 12px; color: var(--ink4); }
.rescan {
  margin-left: auto; font-size: 12px; color: var(--ink2); padding: 5px 12px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--paper2);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.rescan:hover { color: var(--ink); border-color: var(--ink4); }

.mod-card {
  max-width: 640px; background: var(--card); border: 1px solid rgba(var(--ink-rgb), .06);
  border-radius: var(--r-paper); padding: 20px 24px 22px;
}
.mod-title { font-family: var(--f-d); font-size: 19px; font-weight: 700; letter-spacing: .06em; color: var(--ink); }
.mod-sub { font-size: 12px; color: var(--ink4); margin: 4px 0 14px; line-height: 1.6; }
.mod-empty { font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }

.mods { display: flex; flex-direction: column; gap: 12px; }
.mod { border: 1px solid rgba(var(--ink-rgb), .08); border-radius: var(--r-s-hand); padding: 12px 14px; }
.mod--disabled { opacity: .62; }
.mod--invalid { border-color: var(--zs-t); }
.mod--grey { opacity: .5; filter: grayscale(.4); }

.mod-head { display: flex; align-items: center; gap: 8px; }
.m-name { font-family: var(--f-d); font-size: 15px; font-weight: 700; color: var(--ink); }
.m-ver { font-size: 11px; color: var(--ink4); }
.m-src {
  font-size: 10.5px; color: var(--zhe); border: 1px solid var(--zhe-t); background: var(--zhe-t);
  padding: 1px 7px; border-radius: var(--r-pill);
}
.m-state { margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: var(--r-pill); }
.mod--ok .m-state { color: var(--sl); background: var(--sl-t); }
.mod--disabled .m-state { color: var(--ink3); background: rgba(var(--ink-rgb), .08); }
.mod--invalid .m-state { color: var(--zs-d); background: var(--zs-t); }
.mod--grey .m-state { color: var(--ink3); background: rgba(var(--ink-rgb), .08); }

.m-desc { font-size: 12.5px; color: var(--ink2); margin-top: 6px; line-height: 1.6; }
.caps { margin: 8px 0 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }
.caps li { font-size: 12px; color: var(--ink3); line-height: 1.5; }

.reasons-toggle {
  margin-top: 8px; font-size: 12px; color: var(--zs-d); padding: 3px 10px;
  border: 1px solid var(--zs-t); border-radius: var(--r-s-hand); background: var(--zs-t);
}
.reasons { margin: 6px 0 0; padding-left: 16px; }
.reasons li { font-size: 12px; color: var(--zs-d); line-height: 1.5; }

.settings { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.setting { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.s-title { font-size: 12.5px; color: var(--ink2); }
.s-desc { font-size: 11px; color: var(--ink4); }
.s-opts { display: inline-flex; gap: 6px; }
.s-opt {
  font-size: 11.5px; color: var(--ink3); padding: 3px 10px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--paper2);
  transition: color var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.s-opt[aria-pressed="true"] { color: var(--hq-d); border-color: var(--hq); background: var(--hq-t); }
.s-input {
  font-size: 12px; color: var(--ink2); padding: 4px 10px; min-width: 140px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
}
.s-input:focus { outline: none; border-color: var(--hq); }

.mod-foot { margin-top: 10px; display: flex; align-items: center; gap: 10px; }
.op {
  font-size: 12px; color: var(--ink2); padding: 4px 14px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--paper2);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.op:hover { color: var(--ink); border-color: var(--ink4); }
.op-hint { font-size: 11px; color: var(--ink4); }

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
