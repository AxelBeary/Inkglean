<template>
  <!-- 自定义首页批一（v70）：「自定义我的首页」抽屉
       交互/视觉事实源 = workspace/temp/proto-dashboard-drag-820.html 的抽屉部分。
       读写口径：打开即拉 artistApi.getDashboardPrefs()；任何改动立即 PUT 完整对象
       （后写覆盖先写）；失败由 useDashboardPrefs 统一 ElMessage 报错并回滚本地。 -->
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    size="380px"
    :with-header="false"
    :destroy-on-close="false"
    class="prefs-drawer"
    @update:model-value="onVisibleChange"
  >
    <div class="dp-inner">
      <div class="dp-head">
        <h2 class="dp-title">{{ t('dashboardPrefs.title') }}</h2>
        <button type="button" class="dp-close" :aria-label="t('dashboardPrefs.close')" @click="close">×</button>
      </div>

      <p class="dp-tip">{{ t('dashboardPrefs.tip') }}</p>

      <div v-if="loadFailed" class="dp-loadfail">
        <span>{{ t('dashboardPrefs.loadFailed') }}</span>
        <el-button size="small" @click="load">{{ t('dashboardPrefs.retry') }}</el-button>
      </div>

      <div v-else v-loading="loading" class="dp-list">
        <div
          v-for="id in visibleOrder"
          :key="id"
          class="d-item"
          :class="{ off: isHidden(id), dragging: dragId === id, 'drop-before': isDropTarget(id, true), 'drop-after': isDropTarget(id, false) }"
          draggable="true"
          @dragstart="onDragStart($event, id)"
          @dragover.prevent="onDragOver($event, id)"
          @dragleave="onDragLeave(id)"
          @drop.prevent="onDrop(id)"
          @dragend="clearDrag"
        >
          <div class="d-row1">
            <span class="d-grip" aria-hidden="true">⠿</span>
            <span class="d-name">{{ t(nameKey(id)) }}</span>
            <button
              type="button"
              class="ink-switch"
              :class="{ on: !isHidden(id) }"
              role="switch"
              :aria-checked="!isHidden(id)"
              :aria-label="t('dashboardPrefs.toggleAria', { name: t(nameKey(id)) })"
              @click="toggleVisible(id)"
            ></button>
          </div>

          <div class="d-row2">
            <span class="d-sub">{{ t('dashboardPrefs.widthLabel') }}</span>
            <span class="seg">
              <button type="button" :class="{ on: widthOf(id) === 'half' }" @click="setWidth(id, 'half')">{{ t('dashboardPrefs.widthHalf') }}</button>
              <button type="button" :class="{ on: widthOf(id) === 'full' }" @click="setWidth(id, 'full')">{{ t('dashboardPrefs.widthFull') }}</button>
            </span>

            <template v-if="hasDensity(id)">
              <span class="d-sub">{{ t('dashboardPrefs.densityLabel') }}</span>
              <span class="seg">
                <button type="button" :class="{ on: densityOf(id) === 3 }" @click="setDensity(id, 3)">{{ t('dashboardPrefs.density3') }}</button>
                <button type="button" :class="{ on: densityOf(id) === 5 }" @click="setDensity(id, 5)">{{ t('dashboardPrefs.density5') }}</button>
                <button type="button" :class="{ on: densityOf(id) === 0 }" @click="setDensity(id, 0)">{{ t('dashboardPrefs.densityAll') }}</button>
              </span>
            </template>
          </div>

          <!-- 开张任务：系统控制优先于自定义——完成后自动消失 -->
          <div v-if="id === 'onboarding'" class="d-note">{{ t('dashboardPrefs.onboardingNote') }}</div>
        </div>
      </div>

      <!-- 批二（子代理 E）：可添加的板块（板块库）——optional 且当前 hidden 的板块列在此处，
           点「＋ 加上首页」=从 hidden 移除并 append 到 order 尾部；主列表里关掉开关则自动回库；
           prefs 未到位（加载/失败）时不露出库区，避免误导空态 -->
      <div v-if="prefs" class="dp-cat">
        <div class="dp-cat-title">{{ t('dashboardPrefs.catalogTitle') }}</div>
        <div v-if="!catalogItems.length" class="dp-cat-empty">{{ t('dashboardPrefs.catalogEmpty') }}</div>
        <template v-else>
          <div v-for="meta in catalogItems" :key="meta.id" class="cat-item">
            <span class="cat-name">{{ t(meta.nameKey) }}</span>
            <button type="button" class="cat-add" :disabled="saving" @click="addFromCatalog(meta.id)">{{ t('dashboardPrefs.catalogAdd') }}</button>
          </div>
        </template>
        <p class="dp-cat-note">{{ t('dashboardPrefs.catalogNote') }}</p>
      </div>

      <div class="dp-foot">
        <button type="button" class="dp-btn" :disabled="saving" @click="onReset">{{ t('dashboardPrefs.reset') }}</button>
        <button type="button" class="dp-btn dp-btn-primary" @click="close">{{ t('dashboardPrefs.done') }}</button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DASHBOARD_PREFS_KEY,
  useDashboardPrefs,
  getDashboardModuleMeta,
  DASHBOARD_MODULE_METAS,
  reorderModules,
  toggleModuleHidden,
  normalizeDensity
} from '../../../utils/dashboard-prefs'
import type { DashboardModuleMeta } from '../../../utils/dashboard-prefs'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

const { t } = useI18n()

// 与偏好页宽度控件共用同一份 prefs 拉取/保存控制器（provide/inject）；
// 独立挂载（无 provider）时自建一份，保证组件可单独使用与测试。
const ctrl = inject(DASHBOARD_PREFS_KEY) ?? useDashboardPrefs()
const { prefs, loading, loadFailed, saving } = ctrl
const load = ctrl.load

// 打开时拉取服务端归一化 prefs（每次打开都取新鲜态）
watch(() => props.modelValue, (open) => { if (open) void ctrl.load() }, { immediate: true })

function close() { emit('update:modelValue', false) }
function onVisibleChange(v: boolean) { emit('update:modelValue', v) }

/** 主列表：基础板块 + 已添加的可选板块；服务端前瞻保留的未知 id 跳过渲染（不从 order 丢弃）；
 *  批二：optional 且 hidden 的板块不在主列表，进底部板块库 */
const visibleOrder = computed(() => (prefs.value?.order ?? []).filter(id => {
  const meta = getDashboardModuleMeta(id)
  return !!meta && !(meta.optional && isHidden(id))
}))

/** 板块库：DASHBOARD_MODULE_METAS 中 optional 且当前 hidden 的板块（库序 = 登记表序） */
const catalogItems = computed<DashboardModuleMeta[]>(() => {
  const hidden = prefs.value?.hidden ?? []
  return DASHBOARD_MODULE_METAS.filter(m => m.optional && hidden.includes(m.id))
})

function nameKey(id: string): string {
  return getDashboardModuleMeta(id)?.nameKey ?? 'dashboardPrefs.moduleUnknown'
}
function isHidden(id: string): boolean {
  return prefs.value?.hidden.includes(id) ?? false
}
function widthOf(id: string): 'half' | 'full' {
  return prefs.value?.width[id] === 'full' ? 'full' : 'half'
}
function densityOf(id: string): number {
  return normalizeDensity(prefs.value?.density[id])
}
function hasDensity(id: string): boolean {
  return getDashboardModuleMeta(id)?.hasDensity ?? false
}

function toggleVisible(id: string) {
  // 可选板块关掉开关 = 回库（toggleModuleHidden 追加回 hidden，主列表自然除名）
  void ctrl.mutate(d => { d.hidden = toggleModuleHidden(d.hidden, id) })
}
/** 从库里加上首页：从 hidden 移除并 append 到 order 尾部（order 缺失时补位） */
function addFromCatalog(id: string) {
  void ctrl.mutate(d => {
    d.hidden = d.hidden.filter(x => x !== id)
    if (!d.order.includes(id)) d.order = [...d.order, id]
  })
}
function setWidth(id: string, w: 'half' | 'full') {
  void ctrl.mutate(d => { d.width = { ...d.width, [id]: w } })
}
function setDensity(id: string, n: number) {
  void ctrl.mutate(d => { d.density = { ...d.density, [id]: n } })
}

// ─── 抽屉内拖拽换位（HTML5 drag；纵列按上下半判定插入前/后） ───
const dragId = ref<string | null>(null)
const dropInfo = ref<{ id: string; before: boolean } | null>(null)

function onDragStart(e: DragEvent, id: string) {
  dragId.value = id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* 部分内核 setData 受限，忽略 */ }
  }
}
function onDragOver(e: DragEvent, id: string) {
  if (!dragId.value || dragId.value === id) return
  const el = e.currentTarget as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  const before = (e.clientY - rect.top) < rect.height / 2
  dropInfo.value = { id, before }
}
function onDragLeave(id: string) {
  if (dropInfo.value?.id === id) dropInfo.value = null
}
function onDrop(id: string) {
  const src = dragId.value
  const before = dropInfo.value?.before ?? true
  clearDrag()
  if (!src || src === id) return
  void ctrl.mutate(d => { d.order = reorderModules(d.order, src, id, before) })
}
function isDropTarget(id: string, before: boolean): boolean {
  return dropInfo.value?.id === id && dropInfo.value.before === before
}
function clearDrag() {
  dragId.value = null
  dropInfo.value = null
}

// ─── 恢复默认：PUT 空对象（服务端归一化为全默认）后重新拉取 ───
async function onReset() {
  await ctrl.resetDefaults()
}
</script>

<style scoped>
/* ═══ 抽屉纸墨视觉（token 同口径；圆角只用 --r-s/--r-m/--r-l 与既有纸边手法） ═══ */
/* el-drawer 传送到 body，面板本体走 :deep 覆盖 */
.prefs-drawer :deep(.el-drawer) {
  background: var(--paper2);
  border-left: 1px solid var(--line2);
  box-shadow: var(--sh-2);
}
.prefs-drawer :deep(.el-drawer__body) {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.dp-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.dp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 2px solid var(--ink);
}
.dp-title {
  font-family: var(--f-d);
  font-size: calc(var(--font-scale, 1) * 19px);
  font-weight: 700;
  color: var(--ink);
}
.dp-close {
  background: none;
  border: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--ink2);
  padding: 4px 8px;
  border-radius: var(--r-s);
  transition: background var(--dur-fast), color var(--dur-fast);
}
.dp-close:hover { background: var(--paper); color: var(--ink); }

.dp-tip {
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink3);
  line-height: 1.6;
  padding: 8px 16px 0;
}

.dp-loadfail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 16px;
  padding: 8px 12px;
  border: 1px solid var(--zs);
  background: var(--zs-t);
  color: var(--zs);
  border-radius: var(--r-m);
  font-size: calc(var(--font-scale, 1) * 13px);
}

.dp-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.d-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--card);
  border: 1px solid var(--line);
  /* 手绘纸边圆角（既有纸卡手法） */
  border-radius: 8px 12px 9px 11px / 11px 9px 12px 8px;
  padding: 8px 12px;
  cursor: grab;
  transition: box-shadow var(--dur-fast), opacity var(--dur-fast);
}
.d-item:hover { box-shadow: var(--sh-1); }
.d-item.dragging { opacity: 0.45; }
.d-item.drop-before { box-shadow: 0 -4px 0 0 var(--hq); }
.d-item.drop-after { box-shadow: 0 4px 0 0 var(--hq); }

.d-row1 { display: flex; align-items: center; gap: 8px; }
.d-row2 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-left: 24px;
}
.d-item.off .d-row2 { opacity: 0.4; pointer-events: none; }
.d-grip { color: var(--ink4); letter-spacing: 1px; font-size: 12px; user-select: none; }
.d-name { font-size: calc(var(--font-scale, 1) * 14px); flex: 1; color: var(--ink); }
.d-item.off .d-name { color: var(--ink4); }
.d-sub { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); }
.d-note {
  padding-left: 24px;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink4);
}

/* 档位小胶囊组（宽度半行/整行、行数 3/5/全部） */
.seg {
  display: inline-flex;
  border: 1px solid var(--line2);
  border-radius: var(--r-pill);
  overflow: hidden;
}
.seg button {
  font-family: var(--f-b);
  font-size: calc(var(--font-scale, 1) * 12px);
  padding: 4px 12px;
  border: none;
  background: var(--paper);
  color: var(--ink3);
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.seg button + button { border-left: 1px solid var(--line); }
.seg button.on { background: var(--hq); color: #fff; }

/* 纸墨开关（替代 el-switch，照原型 ink-switch） */
.ink-switch {
  width: 38px;
  height: 20px;
  border-radius: var(--r-pill);
  border: 1px solid var(--line2);
  background: var(--paper);
  position: relative;
  cursor: pointer;
  flex: none;
  padding: 0;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.ink-switch::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ink4);
  transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast);
}
.ink-switch.on { background: var(--hq-t); border-color: var(--hq); }
.ink-switch.on::after { transform: translateX(18px); background: var(--hq); }

/* ═══ 批二：可添加的板块（板块库）——原型 820 的 .drawer-cat 段 ═══ */
.dp-cat {
  border-top: 1px dashed var(--line2);
  padding: 12px 16px;
}
.dp-cat-title {
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink3);
  margin-bottom: 8px;
}
.dp-cat-empty {
  padding: 4px 0;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink4);
}
.cat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink);
}
.cat-item + .cat-item { border-top: 1px dashed var(--line); }
.cat-name { flex: 1; min-width: 0; }
.cat-add {
  margin-left: auto;
  flex: none;
  font-family: var(--f-b);
  font-size: calc(var(--font-scale, 1) * 12px);
  padding: 4px 12px;
  border: 1px solid var(--hq);
  color: var(--hq);
  background: none;
  border-radius: var(--r-pill);
  cursor: pointer;
  transition: background var(--dur-fast);
}
.cat-add:hover:not(:disabled) { background: var(--hq-t); }
.cat-add:disabled { opacity: 0.5; cursor: not-allowed; }
.dp-cat-note {
  margin: 8px 0 0;
  font-size: calc(var(--font-scale, 1) * 11px);
  line-height: 1.6;
  color: var(--ink4);
}

.dp-foot {
  padding: 12px 16px;
  border-top: 1px solid var(--line2);
  display: flex;
  gap: 8px;
}
.dp-btn {
  flex: 1;
  font-family: var(--f-b);
  font-size: calc(var(--font-scale, 1) * 14px);
  padding: 8px 16px;
  border-radius: var(--r-m);
  cursor: pointer;
  border: 1px solid var(--line2);
  background: var(--card);
  color: var(--ink);
  transition: box-shadow var(--dur-fast), background var(--dur-fast);
}
.dp-btn:hover:not(:disabled) { box-shadow: var(--sh-2); }
.dp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dp-btn-primary { background: var(--hq); border-color: var(--hq); color: #fff; }
.dp-btn-primary:hover:not(:disabled) { background: #28425B; box-shadow: none; }

/* 窄屏：抽屉占满（左右各留 12px），防 390px 屏挤出视口 */
@media (max-width: 600px) {
  .prefs-drawer :deep(.el-drawer) { width: calc(100% - 24px) !important; }
}
</style>
