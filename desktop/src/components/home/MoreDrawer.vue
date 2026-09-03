<script setup lang="ts">
// 更多抽屉（9/4 主页重设计落码波1 · 路B）：右侧滑出，收纳「长卷只摆常用的，其余收这里」。
// 开关状态由 Home 持有（props.open + emit close）；本组件只管渲染与关闭交互（遮罩点击 / Esc）。
// 条目一律走 moreDrawer.ts 纯函数组装（可测），组件只渲染——纪律：文案文本插值，永不 v-html；
//   只列桌面端真有的条目（不造原型里的「统计」「客户快查」死条目）。
// 诚实简化（施工图 §五-5）：抽屉**不内联渲染 ModuleFrame 沙箱帧**，模块详情在首页插件列与管理页看；
//   模块条点击一律跳模块管理页。
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useModulesStore } from '../../modules/store'
import { buildMoreDrawer } from './moreDrawer'
import type { DrawerItem } from './moreDrawer'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (_e: 'close'): void }>()

const router = useRouter()
const auth = useAuthStore()
const modulesStore = useModulesStore()

const sections = computed(() => {
  const mods = modulesStore.entries.map(e => ({
    name: e.manifest?.name ?? e.dirName,
    state: modulesStore.stateOf(e)
  }))
  return buildMoreDrawer(mods, auth.mode)
})

function close(): void {
  emit('close')
}
function go(item: DrawerItem): void {
  emit('close')
  void router.push(item.to)
}

// Esc 关（自己加监听，卸载时移除；只在开着时响应，不抢别的组件的 Esc）
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) close()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- 遮罩：点击关；开着才可点（pointer-events 由 .open 切换，照原型） -->
  <div class="drawer-mask" :class="{ open }" @click="close"></div>
  <!-- 抽屉：常驻 DOM + 位移隐藏（保住滑出动效），故关着时必须 inert：
       否则 Tab 焦点会走进屏幕外的条目，且与 aria-hidden 相冲（WebView2/Chromium 自 102 支持 inert） -->
  <aside
    class="drawer"
    :class="{ open }"
    role="dialog"
    aria-label="更多板块与插件"
    :aria-hidden="!open"
    :inert="!open"
  >
    <h3>更多</h3>
    <p class="dsub">长卷只摆常用的；这些都收在这里，用时点开。</p>
    <template v-for="s in sections" :key="s.sec">
      <p class="dsec">{{ s.sec }}</p>
      <button
        v-for="(it, i) in s.items"
        :key="`${s.sec}-${i}`"
        type="button"
        class="d-item"
        @click="go(it)"
      >
        <span class="di-ico" aria-hidden="true">{{ it.ico }}</span>
        <span class="di-txt">
          <span class="di-name">{{ it.name }}</span>
          <span class="di-desc">{{ it.desc }}</span>
        </span>
        <span class="di-go" aria-hidden="true">›</span>
      </button>
    </template>
  </aside>
</template>

<style scoped>
/* 照原型 .drawer-mask / .drawer / .d-item 逐段移植；窗高吃 --app-h 不写 100vh（字号 zoom 超窗） */
.drawer-mask {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(var(--ink-rgb), .28);
  opacity: 0; pointer-events: none;
  transition: opacity var(--dur-mid) var(--ease-out);
}
.drawer-mask.open { opacity: 1; pointer-events: auto; }

.drawer {
  position: fixed; top: 0; right: 0; z-index: 51;
  width: min(400px, 88vw); height: var(--app-h);
  display: flex; flex-direction: column; padding: 16px 18px; overflow-y: auto;
  background: var(--paper);
  box-shadow: -12px 0 40px -18px rgba(var(--ink-rgb), .5);
  transform: translateX(100%);
  transition: transform var(--dur-mid) var(--ease-out);
}
.drawer.open { transform: none; }

.drawer h3 { font-family: var(--f-d); font-size: 17px; font-weight: 700; margin-bottom: 4px; color: var(--ink); }
.dsub { font-size: 12px; color: var(--ink4); margin-bottom: 14px; line-height: 1.6; }
.dsec { font-size: 11px; letter-spacing: .12em; color: var(--ink4); margin: 14px 0 6px; }

.d-item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  padding: 10px 12px; margin-bottom: 8px;
  background: var(--card); border-radius: var(--r-s-hand);
  box-shadow: 0 0 0 1px rgba(var(--ink-rgb), .05);
  transition: background var(--dur-fast) var(--ease-out);
}
.d-item:hover { background: var(--paper2); }
.di-ico {
  flex: none; width: 26px; height: 26px; border-radius: var(--r-s-hand);
  background: var(--hq-t); color: var(--hq-d);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--f-d); font-size: 14px;
}
.di-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.di-name { font-size: 13.5px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 单行铁律：描述列 min-width:0 + 截断（826 终验教训，禁窄列竖叠） */
.di-desc { font-size: 11.5px; color: var(--ink4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.di-go { flex: none; font-size: 12px; color: var(--hq-d); }
</style>
