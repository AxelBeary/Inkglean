<script setup lang="ts">
// 桌面首页骨架（825 波0 地基批）：7 板块（二轮研判拍板），复用网页端「拖排 + 显隐」机制口径。
// 波0 交付布局机制本体（拖排/显隐/本地持久化），板块数据内容归后续波次（波1/波2）接入。
// 布局偏好拍板口径：登录态复用 dashboard_prefs 云端同步（后续波接），本波先本地存本机。
import { computed, onMounted, ref, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import { checkAndDownloadUpdate, installPendingUpdate } from "../bridge";

const auth = useAuthStore();

// ─── 7 板块定义（顺序为默认排布）───
interface PanelDef { key: string; label: string; desc: string }
const PANELS: PanelDef[] = [
  { key: "schedule", label: "排期看板", desc: "卷轴排期与截稿倒计时" },
  { key: "todo", label: "账本待办", desc: "定金尾款与今日待办" },
  { key: "order", label: "订单列表", desc: "订单与详情速览" },
  { key: "income", label: "收入概览", desc: "本月收入与状态挂牌" },
  { key: "message", label: "留言审核", desc: "客户留言待审" },
  { key: "stats", label: "统计卡", desc: "画画时间与摸鱼对比" },
  { key: "status", label: "状态挂牌", desc: "开稿/休息一键挂牌" }
];

// ─── 布局持久化：顺序 + 显隐，坏数据静默回默认 ───
const LAYOUT_KEY = "shihui-desktop-home-layout";
interface HomeLayout { order: string[]; hidden: string[] }

function defaultLayout(): HomeLayout {
  return { order: PANELS.map(p => p.key), hidden: [] };
}

function loadLayout(): HomeLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return defaultLayout();
    const d = JSON.parse(raw) as Partial<HomeLayout>;
    const known = new Set(PANELS.map(p => p.key));
    const order = Array.isArray(d.order) ? d.order.filter(k => known.has(k)) : [];
    const hidden = Array.isArray(d.hidden) ? d.hidden.filter(k => known.has(k)) : [];
    // 新板块/缺失板块补到尾部，防定义变更后布局丢板块
    for (const p of PANELS) if (!order.includes(p.key)) order.push(p.key);
    return { order, hidden };
  } catch {
    return defaultLayout();
  }
}

const layout = ref<HomeLayout>(loadLayout());
watch(layout, v => localStorage.setItem(LAYOUT_KEY, JSON.stringify(v)), { deep: true });

const visiblePanels = computed(() =>
  layout.value.order
    .filter(k => !layout.value.hidden.includes(k))
    .map(k => PANELS.find(p => p.key === k))
    .filter((p): p is PanelDef => !!p)
);

// ─── 拖排（原生 HTML5，不引第三方拖拽库）───
const dragKey = ref<string | null>(null);

function onDragStart(key: string) { dragKey.value = key; }
function onDrop(targetKey: string) {
  const from = dragKey.value;
  dragKey.value = null;
  if (!from || from === targetKey) return;
  const order = [...layout.value.order];
  const fi = order.indexOf(from);
  const ti = order.indexOf(targetKey);
  if (fi < 0 || ti < 0) return;
  order.splice(fi, 1);
  order.splice(ti, 0, from);
  layout.value.order = order;
}

// ─── 显隐管理（折叠面板，勾选即存）───
const manageOpen = ref(false);
function togglePanel(key: string) {
  const hidden = new Set(layout.value.hidden);
  if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
  layout.value.hidden = [...hidden];
}

// ─── 更新检查（825 更新通道批挪入：登录态下启动静默检查，失败全静默）───
onMounted(async () => {
  try {
    const result = await checkAndDownloadUpdate();
    if (result === "downloaded" && window.confirm("新版本已下载，现在重启完成更新？")) {
      await installPendingUpdate();
    }
  } catch {
    // 端点未配置/无网络/验签拒装：静默降级
  }
});

async function logout() {
  await auth.logout();
}
</script>

<template>
  <div class="home">
    <!-- 顶栏：画师名牌 + 布局管理 + 登出 -->
    <header class="topbar">
      <div class="brand">
        <span class="seal">拾</span>
        <span class="name">{{ auth.artist?.name ?? "画师" }}</span>
      </div>
      <div class="topbar-actions">
        <button type="button" class="mini-btn" @click="manageOpen = !manageOpen">
          {{ manageOpen ? "收起板块管理" : "板块管理" }}
        </button>
        <button type="button" class="mini-btn" @click="logout">退出登录</button>
      </div>
    </header>

    <!-- 板块显隐管理（折叠区） -->
    <section v-if="manageOpen" class="manage">
      <p class="manage-hint">勾选要在首页显示的板块；板块卡片可拖拽换顺序。</p>
      <div class="manage-list">
        <label v-for="p in PANELS" :key="p.key" class="manage-item">
          <input type="checkbox" :checked="!layout.hidden.includes(p.key)" @change="togglePanel(p.key)" />
          <span>{{ p.label }}</span>
        </label>
      </div>
    </section>

    <!-- 7 板块栅格（波0 为占位骨架，数据内容波1/波2 接入） -->
    <main class="board">
      <section
        v-for="p in visiblePanels" :key="p.key"
        class="panel"
        draggable="true"
        :class="{ 'panel--dragging': dragKey === p.key }"
        @dragstart="onDragStart(p.key)"
        @dragover.prevent
        @drop="onDrop(p.key)"
      >
        <div class="panel-head">
          <h2>{{ p.label }}</h2>
          <span class="grip" aria-hidden="true">⋮⋮</span>
        </div>
        <p class="panel-desc">{{ p.desc }}</p>
        <div class="panel-body">
          <p class="placeholder">骨架批占位——内容随后续波次接入</p>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home { min-height: 100vh; padding: 16px 20px 32px; }

/* 顶栏 */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 4px 16px;
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand .name { font-family: var(--f-d); font-size: 20px; color: var(--ink); }
.seal {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: var(--zs); color: var(--white);
  font-family: var(--f-d); font-size: 16px;
  border-radius: var(--r-paper);
  transform: rotate(-4deg);
}
.topbar-actions { display: flex; gap: 8px; }
.mini-btn {
  padding: 8px 16px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  color: var(--ink2);
  font-size: 13px;
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.mini-btn:hover { border-color: var(--hq); color: var(--hq); }

/* 板块管理折叠区 */
.manage {
  padding: 16px;
  margin-bottom: 16px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-paper);
}
.manage-hint { margin: 0 0 12px; font-size: 13px; color: var(--ink3); }
.manage-list { display: flex; flex-wrap: wrap; gap: 12px; }
.manage-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  font-size: 14px; color: var(--ink2);
  cursor: pointer;
}

/* 7 板块栅格：宽窗双列，窄窗塌单列（窄窗布局为优化项，先保底不破版） */
.board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 860px) {
  .board { grid-template-columns: 1fr; }
}
.panel {
  padding: 16px 20px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-paper);
  cursor: grab;
  transition: border-color var(--dur-fast);
}
.panel--dragging { opacity: 0.6; border-color: var(--hq); }
.panel-head { display: flex; align-items: center; justify-content: space-between; }
.panel-head h2 {
  margin: 0;
  font-family: var(--f-d); font-size: 18px; color: var(--ink);
}
.panel-head h2::before { content: none; }
.grip { color: var(--ink4); font-size: 14px; letter-spacing: 2px; }
.panel-desc { margin: 4px 0 12px; font-size: 13px; color: var(--ink3); }
.panel-body {
  min-height: 120px;
  display: flex; align-items: center; justify-content: center;
  background: var(--paper2);
  border: 1px dashed var(--line2);
  border-radius: var(--r-s);
}
.placeholder { margin: 0; font-size: 13px; color: var(--ink4); }
</style>
