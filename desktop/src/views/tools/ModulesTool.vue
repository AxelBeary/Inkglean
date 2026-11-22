<script setup lang="ts">
// 模块管理页（档②波17 三件）：规范 v0.3 §四展示强制点——
// 按 manifest 逐条列能力（联网/读写/联动/后台/设置项 + reason 人话）+ 四态标识
// （正常/停用/失效/灰牌）+ 停用/启用/查看报错/移除四件操作 + 设置项壳统一渲染。
// 转义纪律（审计 M9）：一切来自 manifest 的文案走文本插值（天然转义），永不 v-html。
// 移除口径（F1 哲学）：模块目录即插件本体，壳不删文件，给提示让画师到文件夹处理。
// v0.4 模块包：导入/导出 + 三件摘要校验 + 静态体检 + 来源徽章（吸纳 OFM 扩展模式，见 pack.ts 头注）。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useModulesStore } from '../../modules/store'
import type { ModuleEntry } from '../../modules/registry'
import type { ModuleState } from '../../modules/types'
import type { ModuleSource } from '../../modules/store'
import type { ScanFinding } from '../../modules/pack'
import { verifyPack } from '../../modules/pack'
import { exportModulePack, installModulePack, pickPackFile } from '../../modules/packIo'
import { useToolToast } from '../../tools/host'
import { confirmDialog } from '../../tools/confirm'
import { installSampleModule } from '../../bridge/modules'

const router = useRouter()
const toast = useToolToast()
const store = useModulesStore()

/** 报错详情展开态（查看报错操作） */
const expandedReasons = ref<Set<string>>(new Set())
/** 体检详情展开态（静态扫描命中） */
const expandedScan = ref<Set<string>>(new Set())
/** 上次导入失败的原因（列出全部，不只剩第一条） */
const importProblems = ref<string[]>([])

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

function sourceLabel(s: ModuleSource): string {
  switch (s) {
    case 'official': return '官方'
    case 'pack': return '导入包'
    case 'edited': return '导入后已改'
    case 'local': return '本地文件'
  }
}

function entryId(e: ModuleEntry): string {
  return e.manifest?.id ?? e.dirName
}

function toggleEnabled(e: ModuleEntry) {
  const id = entryId(e)
  const cur = store.stateOf(e)
  if (cur === 'invalid') return // 失效态不可启用（待更新/移除）
  // F0044: 按钮文案按 stateOf!=='ok' 显示"启用"，动作必须一致——灰牌(grey)点击也应是启用(清违规重来)，
  // 旧写法 cur!=='grey' 让灰牌点了反而 setEnabled(false) 执行停用
  store.setEnabled(id, cur !== 'ok')
}

function toggleReasons(e: ModuleEntry) {
  const id = entryId(e)
  const next = new Set(expandedReasons.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expandedReasons.value = next
}

function toggleScan(e: ModuleEntry) {
  const id = entryId(e)
  const next = new Set(expandedScan.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expandedScan.value = next
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

function findingsOf(e: ModuleEntry): ScanFinding[] {
  return store.findings[e.dirName] ?? []
}

function fingerprintOf(e: ModuleEntry): string {
  return store.fingerprints[e.dirName]?.short ?? ''
}

function scanLabel(e: ModuleEntry): string {
  const n = findingsOf(e).length
  return n === 0 ? '体检：未发现可疑调用' : `体检：${n} 条可疑调用`
}

// ─── 模块包：导入（验包 → 画师确认 → 落盘 → 重扫） ───
const importing = ref(false)
async function importPack() {
  if (importing.value) return
  importing.value = true
  importProblems.value = []
  try {
    const picked = await pickPackFile()
    if (!picked) return
    // 目录名取包内 manifest 的 id（verifyPack 传 null）；多余条目/摘要不符一律拒装
    const verdict = verifyPack(null, picked.files)
    if (!verdict.ok) {
      importProblems.value = verdict.reasons
      toast.show('装不了这个包：' + (verdict.reasons[0] ?? '未知原因'), 'err')
      return
    }
    const meta = verdict.meta
    const name = meta?.module.name || verdict.id
    const version = meta?.module.version || '0.0.0'
    const scanLine = verdict.findings.length === 0
      ? '体检：未发现可疑调用'
      : `体检：${verdict.findings.length} 条可疑调用（${verdict.findings.map(f => f.token).slice(0, 4).join('、')}）——装后仍跑在沙箱帧里，断网且碰不到本机库`
    const ok = await confirmDialog({
      title: '安装模块包',
      message: [
        `模块：${name}（${verdict.id}）v${version}`,
        '来源：模块包（三条摘要校验通过：manifest 语义摘要 + 两件字节摘要）',
        scanLine,
        '',
        '摘要只防误改与传输损坏，不防恶意作者；模块一律跑在沙箱帧里（断网、碰不到本机库与凭据）。'
      ].join('\n')
    })
    if (!ok) return
    await installModulePack(verdict.id, {
      manifestText: verdict.manifestText,
      entryCode: verdict.entryCode,
      packText: verdict.packText
    })
    store.markPackInstalled(verdict.id, verdict.digests, verdict.findings.length)
    await store.scan()
    toast.show(`已安装「${name}」，回首页可见`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '导入失败'
    importProblems.value = [msg]
    toast.show(msg, 'err')
  } finally {
    importing.value = false
  }
}

// ─── 模块包：导出（读当前两件 → 组清单 → 另存为） ───
const exportingId = ref('')
async function exportPack(e: ModuleEntry) {
  if (exportingId.value) return
  exportingId.value = e.dirName
  try {
    const savedPath = await exportModulePack(e.dirName)
    if (!savedPath) { toast.show('已取消导出'); return }
    toast.show('已导出模块包：' + savedPath)
  } catch (err) {
    toast.show(err instanceof Error ? err.message : '导出失败', 'err')
  } finally {
    exportingId.value = ''
  }
}
</script>

<template>
  <div class="tool-page">
    <header class="tool-bar">
      <button type="button" class="back" @click="goHome">← 回首页</button>
      <span class="badge">工具箱</span>
      <span v-if="countText" class="count">{{ countText }}</span>
      <button type="button" class="rescan" :disabled="installing" @click="installSample">装示例模块</button>
      <button type="button" class="rescan" :disabled="importing" @click="importPack">导入模块包</button>
      <button type="button" class="rescan" @click="rescan">重新扫描</button>
    </header>

    <div class="mod-card">
      <h2 class="mod-title">模块管理</h2>
      <p class="mod-sub">
        模块放在「我的文档\拾绘\modules」，每个模块一个文件夹（内含 manifest.json 与 panel.js）；
        改文件下次启动生效，本页「重新扫描」可刷新清单。
        模块包（<code>.zip</code>）＝同一套文件 + 一条摘要清单，导入前会先验三件摘要与静态体检。
      </p>

      <ul v-if="importProblems.length > 0" class="import-problems">
        <li v-for="(r, i) in importProblems" :key="i">{{ r }}</li>
      </ul>

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
            <span v-if="e.manifest" class="m-src" :class="`m-src--${store.sourceOf(e)}`">{{ sourceLabel(store.sourceOf(e)) }}</span>
            <span v-else class="m-src m-src--local">未知</span>
            <span class="m-state">{{ stateLabel(store.stateOf(e)) }}</span>
          </header>
          <p v-if="e.manifest?.description" class="m-desc">{{ e.manifest.description }}</p>

          <!-- 指纹与体检（v0.4 模块包：来源壳判定 + 语义摘要 + 静态扫描） -->
          <p v-if="fingerprintOf(e)" class="m-fp" :title="`manifest 语义摘要：${store.fingerprints[e.dirName]?.manifest ?? ''}`">
            指纹 #{{ fingerprintOf(e) }}
            <span class="m-fp-dot">·</span>
            <button type="button" class="scan-toggle" :disabled="findingsOf(e).length === 0" @click="toggleScan(e)">
              {{ scanLabel(e) }}
            </button>
          </p>
          <ul v-if="expandedScan.has(entryId(e))" class="scan-list">
            <li v-for="(f, i) in findingsOf(e)" :key="i">第 {{ f.line }} 行 {{ f.token }}（{{ f.why }}）</li>
          </ul>

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

          <!-- 操作区：停用/启用 + 导出 + 移除提示 -->
          <footer class="mod-foot">
            <button
              v-if="store.stateOf(e) !== 'invalid'"
              type="button"
              class="op"
              @click="toggleEnabled(e)"
            >
              {{ store.stateOf(e) === 'ok' ? '停用' : '启用' }}
            </button>
            <button
              v-if="store.stateOf(e) !== 'invalid'"
              type="button"
              class="op op--ghost"
              :disabled="exportingId === e.dirName"
              @click="exportPack(e)"
            >
              {{ exportingId === e.dirName ? '导出中…' : '导出模块包' }}
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
.tool-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
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
.rescan + .rescan { margin-left: 0; }
.rescan:hover { color: var(--ink); border-color: var(--ink4); }
.rescan:disabled { opacity: .5; }

.mod-card {
  max-width: 640px; background: var(--card); border: 1px solid rgba(var(--ink-rgb), .06);
  border-radius: var(--r-paper); padding: 20px 24px 22px;
}
.mod-title { font-family: var(--f-d); font-size: 19px; font-weight: 700; letter-spacing: .06em; color: var(--ink); }
.mod-sub { font-size: 12px; color: var(--ink4); margin: 4px 0 14px; line-height: 1.6; }
.mod-sub code { font-size: 11.5px; color: var(--ink3); }
.mod-empty { font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }

.import-problems { margin: 0 0 12px; padding: 8px 8px 8px 24px; border: 1px solid var(--zs-t); background: var(--zs-t); border-radius: var(--r-s-hand); }
.import-problems li { font-size: 12px; color: var(--zs-d); line-height: 1.6; }

.mods { display: flex; flex-direction: column; gap: 12px; }
.mod { border: 1px solid rgba(var(--ink-rgb), .08); border-radius: var(--r-s-hand); padding: 12px 14px; }
.mod--disabled { opacity: .62; }
.mod--invalid { border-color: var(--zs-t); }
.mod--grey { opacity: .5; filter: grayscale(.4); }

.mod-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.m-name { font-family: var(--f-d); font-size: 15px; font-weight: 700; color: var(--ink); }
.m-ver { font-size: 11px; color: var(--ink4); }
.m-src {
  font-size: 10.5px; color: var(--zhe); border: 1px solid var(--zhe-t); background: var(--zhe-t);
  padding: 1px 7px; border-radius: var(--r-pill);
}
.m-src--official { color: var(--hq-d); border-color: var(--hq-t2); background: var(--hq-t); }
.m-src--pack { color: var(--sl); border-color: var(--sl-t); background: var(--sl-t); }
.m-src--edited { color: var(--zs-d); border-color: var(--zs-t); background: var(--zs-t); }
.m-src--local { color: var(--ink3); border-color: var(--line2); background: var(--paper2); }
.m-state { margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: var(--r-pill); }
.mod--ok .m-state { color: var(--sl); background: var(--sl-t); }
.mod--disabled .m-state { color: var(--ink3); background: rgba(var(--ink-rgb), .08); }
.mod--invalid .m-state { color: var(--zs-d); background: var(--zs-t); }
.mod--grey .m-state { color: var(--ink3); background: rgba(var(--ink-rgb), .08); }

.m-desc { font-size: 12.5px; color: var(--ink2); margin-top: 6px; line-height: 1.6; }
.m-fp { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0 0; font-size: 11px; color: var(--ink4); font-variant-numeric: tabular-nums; }
.m-fp-dot { color: var(--line2); }
.scan-toggle { font-size: 11px; color: var(--ink3); padding: 1px 8px; border: 1px solid var(--line2); border-radius: var(--r-pill); background: var(--paper2); }
.scan-toggle:disabled { cursor: default; color: var(--sl); border-color: var(--sl-t); background: var(--sl-t); opacity: 1; }
.scan-list { margin: 8px 0 0; padding-left: 16px; }
.scan-list li { font-size: 11.5px; color: var(--ink3); line-height: 1.6; }
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

.mod-foot { margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.op {
  font-size: 12px; color: var(--ink2); padding: 4px 14px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--paper2);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.op:hover { color: var(--ink); border-color: var(--ink4); }
.op:disabled { opacity: .5; }
.op--ghost { color: var(--ink3); }
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
