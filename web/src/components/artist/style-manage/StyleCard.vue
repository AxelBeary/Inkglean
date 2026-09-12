<template>
  <!-- F-09 巨型文件拆分（施工员戊）：自 ArtStyleManager.vue 原样搬入的画风卡片
       （DOM 结构/class 名/i18n 键引用/样式值零改动；锁定判定、多画风开关、默认画风与作品集数据由父组件下发，
        所有写路径（拖拽排序、三态、增项拖启用/停用、CRUD）仍归父组件——本卡只把原生事件与用户意图 emit 上报
        （跨边界新增 emit 事件名，处理器本体与参数顺序照原样），M-12 与 L-13 守卫链因此不断） -->
  <el-card class="style-card" :class="{ 'style-card--locked': locked }" shadow="hover">
    <!-- 卡头：拖拽柄 + 名称 + 默认徽标（仅多画风关闭时显示）+ 启用开关 + 操作 -->
    <template #header>
      <div class="style-card-header">
        <span class="style-card-name">
          <span class="style-drag-handle" :title="$t('tiers.dragHint')">⠿</span>
          {{ style.name }}
          <!-- 默认徽标只在多画风关闭时显示（多画风开启时无默认概念；拖拽即可调序） -->
          <el-tag v-if="!multiStyleEnabled && styleCount > 1 && style.id === defaultStyleId" size="small" type="warning" effect="plain">{{ $t('styleManage.styleDefaultTag') }}</el-tag>
        </span>
        <div class="style-card-actions">
          <!-- 多画风关闭时：非默认画风可设为默认 -->
          <el-button
            v-if="!multiStyleEnabled && styleCount > 1 && style.id !== defaultStyleId"
            text size="small" type="warning"
            @click="emit('set-default')"
          >
            {{ $t('styleManage.setAsDefault') }}
          </el-button>
          <el-switch
            :model-value="!!style.is_active" size="small"
            :disabled="locked"
            :active-text="$t('styleManage.styleActive')"
            @change="(val: boolean | string | number) => emit('toggle-active', val)"
          />
          <el-button text size="small" :disabled="locked" @click="emit('edit')">{{ $t('common.edit') }}</el-button>
          <el-button text size="small" type="danger" :disabled="locked" @click="emit('remove')">{{ $t('common.delete') }}</el-button>
        </div>
      </div>
    </template>

    <!-- 锁定提示（F2: 开关关闭时非默认画风灰色不可编辑） -->
    <div class="style-card-body" :class="{ 'style-card-body--locked': locked }">
      <p v-if="locked" class="style-locked-hint">{{ $t('styleManage.styleLocked') }}</p>

      <!-- 描述 + 示例图 -->
      <p v-if="style.description" class="style-desc">{{ style.description }}</p>
      <div v-if="style.cover_image" class="style-cover">
        <el-image :src="`/uploads/${style.cover_image}`" fit="cover" class="style-cover-img" :alt="style.name" />
      </div>

      <!-- ── 尺寸区（v0.35 补漏 A3: 行列表 + 拖拽排序） ── -->
      <div class="style-section">
        <div class="section-head">
          <h4 class="section-title">{{ $t('styleManage.sizeTitle') }}</h4>
          <el-button size="small" :disabled="locked" @click="emit('add-size')">{{ $t('styleManage.sizeAddBtn') }}</el-button>
        </div>
        <draggable
          :model-value="style.sizes"
          item-key="id"
          handle=".size-drag-handle"
          ghost-class="ghost"
          class="size-row-list"
          @update:model-value="onSizesReorder"
          @end="emit('size-drag-end')"
        >
          <template #item="{ element: size }">
            <div
              class="size-row"
              :class="{ 'size-row--dim': size.display_status === 'closed' }"
              @dragover.prevent="emit('size-drag-over', $event)"
              @drop.prevent="emit('size-drop', size, $event)"
            >
              <!-- 第一行：拖拽柄 + 缩略图 + 名称/价/工期 + 三态 + 操作 -->
              <div class="size-row-top">
                <span class="size-drag-handle" :title="$t('tiers.dragHint')">⠿</span>
                <el-image v-if="sizeThumb(size)" :src="`/uploads/${sizeThumb(size)}`" fit="cover" class="size-thumb" />
                <span class="size-row-name">{{ size.name }}</span>
                <el-tag v-if="size.image_artwork_id" size="small" effect="plain" class="size-thumb-tag">{{ $t('styleManage.sizeFromArtworkTag') }}</el-tag>
                <span class="size-price">{{ formatYuanValue(size.base_price) }}</span>
                <span v-if="size.work_days" class="size-days">{{ $t('tiers.daysUnit', { n: size.work_days }) }}</span>
                <!-- 右组：三态 + 操作成组右对齐，换行时整体靠右不错位 -->
                <div class="size-row-end">
                  <!-- SPEC-PRICE-2: 尺寸三态（后端 display_status 落库，算价/下单同步拒单） -->
                  <div class="size-status-seg">
                    <button
                      v-for="st in statusOptions" :key="st.value"
                      class="seg-btn" :class="[`seg-${st.value}`, { on: (size.display_status || 'available') === st.value }]"
                      :disabled="locked"
                      @click="emit('set-size-status', size, st.value)"
                    >
                      <i></i>{{ st.label }}
                    </button>
                  </div>
                  <div class="size-row-actions">
                    <el-button text size="small" :disabled="locked" @click="emit('preview', size)">{{ $t('styleManage.previewBtn') }}</el-button>
                    <el-button text size="small" :disabled="locked" @click="emit('edit-size', size)">{{ $t('common.edit') }}</el-button>
                    <el-button text size="small" type="danger" :disabled="locked" @click="emit('remove-size', size)">{{ $t('common.delete') }}</el-button>
                  </div>
                </div>
              </div>
              <!-- 第二行：描述（有才显示） -->
              <p v-if="size.description" class="size-row-desc">{{ size.description }}</p>
              <!-- 第三行：已配增项摘要（REQ-036 任务5，实时更新） -->
              <div class="size-summary">
                <span class="sum-label">{{ $t('styleManage.sizeSummaryLabel') }}</span>
                <span
                  v-for="chip in sizeSummary(style, size)" :key="chip.id"
                  class="sum-chip" :class="chip.kind"
                  draggable="true" :title="$t('styleManage.addonDragBackHint')"
                  @dragstart="emit('chip-drag-start', size, chip, $event)"
                >{{ chip.name }} {{ chip.priceText }}</span>
                <span v-if="!sizeSummary(style, size).length" class="sum-empty">{{ $t('styleManage.sizeSummaryEmpty') }}</span>
              </div>
            </div>
          </template>
        </draggable>
        <el-empty v-if="!style.sizes.length" :description="$t('styleManage.sizeEmpty')" :image-size="40" />
      </div>

      <!-- ── 加购项池（REQ-036 批A: 双入口 + 池子胶囊 + 拖拽启用/停用） ── -->
      <div class="style-section">
        <div class="section-head">
          <h4 class="section-title">{{ $t('styleManage.addonTitle') }}</h4>
        </div>
        <!-- §2.1 双入口：新建（自动挂本画风+沉淀库） / 从已有挑选（原导入，已用项过滤） -->
        <div class="addon-pool-head">
          <el-button size="small" type="primary" plain :disabled="locked" @click="emit('addon-create')">
            {{ $t('styleManage.addonCreateBtn') }}
          </el-button>
          <el-button size="small" :disabled="locked" @click="emit('addon-import')">
            {{ $t('styleManage.addonPickBtn') }}
          </el-button>
        </div>
        <!-- §2.2 池子（单块三行：普通增项/用途/加急；拖到尺寸行=启用，点击胶囊=设置） -->
        <div
          class="addon-pool"
          :class="{ 'pool--drag-over': poolDragOver }"
          @dragover.prevent="emit('pool-drag-over', $event)"
          @dragleave="emit('pool-drag-leave')"
          @drop.prevent="emit('pool-drop', $event)"
        >
          <div v-for="grp in poolGroups(style)" :key="grp.cat" class="pool-row">
            <span class="pool-row-label" :class="`pool-label-${grp.cat}`">{{ categoryLabel($t, grp.cat) }}</span>
            <div class="pool-row-chips">
              <button
                v-for="sa in grp.items" :key="sa.id"
                class="addon-cap" :class="`cap-cat-${addonCategory(sa)}`"
                type="button"
                draggable="true"
                :title="$t('styleManage.addonCapHint')"
                @dragstart="emit('cap-drag-start', sa, $event)"
                @dragend="emit('cap-drag-end')"
                @click="emit('cap-settings', sa)"
              >
                <span class="cap-name">{{ sa.template_name }}</span>
                <span class="cap-price">{{ capPriceText(sa) }}</span>
                <span v-if="sa.template_control_type === 'quantity'" class="cap-tag cap-tag-quantity">{{ controlLabel(sa.template_control_type) }}</span>
              </button>
              <span v-if="!grp.items.length" class="pool-row-empty">{{ $t('styleManage.poolRowEmpty') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import draggable from 'vuedraggable'
import { useI18n } from 'vue-i18n'
import { formatYuanValue } from '../../../utils/money'
import { addonCategory, addonChipKind, addonPriceText, categoryLabel, controlLabel as controlLabelText } from '../addon-utils'
import type { ManagerArtwork, ManagerSa, ManagerSizeRow, ManagerStyleRow } from './types'

const { t } = useI18n()

const props = defineProps({
  /** 本卡画风行（父组件 styles 数组里的同一个响应式对象；尺寸拖拽排序写回归父组件，见 sizes-reorder） */
  style: { type: Object as PropType<ManagerStyleRow>, required: true },
  /** F2: 开关关闭时非默认画风灰色不可编辑（isLocked 判定留在父组件） */
  locked: Boolean,
  multiStyleEnabled: Boolean,
  /** 父组件 styles.length（默认徽标/设为默认判定，与原式 styles.length > 1 同口径） */
  styleCount: { type: Number, required: true },
  defaultStyleId: { type: Number as PropType<number | null>, required: true },
  /** SPEC-PRICE-2 尺寸三态选项（文案由父组件 computed 产出，单一来源） */
  statusOptions: {
    type: Array as PropType<Array<{ value: 'available' | 'showcase' | 'closed'; label: string }>>,
    required: true
  },
  /** 作品集（尺寸缩略图解析用，与原 sizeThumb 同源） */
  artworks: { type: Array as PropType<ManagerArtwork[]>, required: true },
  /** 池子 dragover 高亮（状态归父组件：onDropToSize/onDropToPool 的 finally 里复位） */
  poolDragOver: Boolean
})

const emit = defineEmits<{
  (e: 'set-default'): void
  (e: 'toggle-active', val: boolean | string | number): void
  (e: 'edit'): void
  (e: 'remove'): void
  (e: 'add-size'): void
  (e: 'sizes-reorder', sizes: ManagerSizeRow[]): void
  (e: 'size-drag-end'): void
  (e: 'size-drag-over', ev: DragEvent): void
  (e: 'size-drop', size: ManagerSizeRow, ev: DragEvent): void
  (e: 'set-size-status', size: ManagerSizeRow, value: 'available' | 'showcase' | 'closed'): void
  (e: 'preview', size: ManagerSizeRow): void
  (e: 'edit-size', size?: ManagerSizeRow): void
  (e: 'remove-size', size: ManagerSizeRow): void
  (e: 'chip-drag-start', size: ManagerSizeRow, chip: { id: number }, ev: DragEvent): void
  (e: 'addon-create'): void
  (e: 'addon-import'): void
  (e: 'cap-drag-start', sa: ManagerSa, ev: DragEvent): void
  (e: 'cap-drag-end'): void
  (e: 'cap-settings', sa: ManagerSa): void
  (e: 'pool-drag-over', ev: DragEvent): void
  (e: 'pool-drag-leave'): void
  (e: 'pool-drop', ev: DragEvent): void
}>()

/** 尺寸行拖拽排序：本卡不直写 props，按拆分前 v-model 的等价口径把新数组上报父组件写回。
 *  vuedraggable 在 end 之前同步发出 update:modelValue，故 @size-drag-end 到达时父级数组已重排。 */
function onSizesReorder(sizes: unknown[]) {
  emit('sizes-reorder', sizes as ManagerSizeRow[])
}

/** 尺寸缩略图：image_artwork_id 有值 → 作品集实图；否则独立上传图（渲染优先级与客户端一致） */
function sizeThumb(size: ManagerSizeRow) {
  if (size.image_artwork_id) {
    const art = props.artworks.find(a => a.id === size.image_artwork_id)
    if (art) return art.image_path
  }
  return size.image || null
}

// ─── 控件类型标签（addon-utils 单一来源，不再本地重复定义） ───
function controlLabel(type: string) {
  return controlLabelText(t, type)
}

/** 池子三类分组（增项/用途/加急，顺序固定）——读后端真实 category 字段 */
function poolGroups(style: ManagerStyleRow) {
  return ['add', 'usage', 'rush'].map(cat => ({ cat, items: style.addons.filter(sa => addonCategory(sa) === cat) }))
}

/** 画风级生效价文本（池子胶囊 / 摘要 chip）：本身价 or 画风覆盖价 */
function capPriceText(sa: ManagerSa) {
  return addonPriceText(sa, null, t)
}

/**
 * 某尺寸已启用增项摘要（实时更新）：画风级启用 && 尺寸级未隐藏
 * 返回 [{ id, name, kind, priceText }] — kind: add/qty/pct（三种计价形态视觉区分）
 */
function sizeSummary(style: ManagerStyleRow, size: ManagerSizeRow) {
  const ov = size._overrides || {}
  return style.addons
    .filter(sa => !!sa.is_enabled && !(ov[sa.id]?.is_hidden))
    .map(sa => ({
      id: sa.id,
      name: sa.template_name,
      kind: addonChipKind(sa),
      priceText: addonPriceText(sa, ov[sa.id]?.price_override ?? null, t)
    }))
}
</script>

<style scoped>
/* ═══ 以下样式自 ArtStyleManager.vue 原样搬入（选择器/值零改动；仅 .ghost 因 scoped 作用域一份变两份，各自加注） ═══ */
/* A3: 拖拽幽灵（尺寸行列表在本卡；父组件画风栅格另留一份，作用域各自成立） */
.ghost { opacity: 0.4; }

.style-card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.style-card-name { font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700; font-family: var(--f-d); color: var(--ink); display: flex; align-items: center; gap: 8px; }
.style-card-actions { display: flex; align-items: center; gap: 4px; }
/* A3: 画风卡片拖拽柄 */
.style-drag-handle { cursor: grab; font-size: calc(var(--font-scale, 1) * 16px); color: var(--ink3); padding: 0 2px; }
.style-drag-handle:hover { color: var(--hq); }
.style-drag-handle:active { cursor: grabbing; }
/* F2: 开关关闭时非默认画风灰色 */
.style-card--locked { opacity: 0.65; }
.style-card-body--locked { pointer-events: none; }
.style-locked-hint {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--th);
  background: var(--th-t);
  padding: 6px 10px; border-radius: var(--r-s); margin: 0 0 10px;
}
.style-desc { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); margin: 0 0 12px; line-height: 1.6; }
.style-cover { margin-bottom: 12px; }
.style-cover-img { width: 120px; height: 80px; border-radius: var(--r-m); border: 1px solid var(--line); }

.style-section { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--line); }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.section-head .section-title { margin: 0; }
.section-title { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); margin: 0 0 10px; }
/* 价格数字墨色不上色铁律（REQ §1.1），文楷落款感 */
.size-price { font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 600; font-family: var(--f-d); }

/* A3: 尺寸行列表（替代原 el-table，支持拖拽） */
.size-row-list { display: flex; flex-direction: column; gap: 8px; }
.size-row {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px; border-radius: var(--r-m);
  background: var(--paper2); border: 1px solid var(--line);
}
/* 第一行：拖拽柄+缩略图+名称/价/工期 ｜ 右组（三态+操作） */
.size-row-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
/* 右组：三态+操作成组，始终右对齐；换行时整组靠右不错位 */
.size-row-end { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.size-drag-handle { cursor: grab; font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink3); flex-shrink: 0; }
.size-drag-handle:hover { color: var(--hq); }
.size-drag-handle:active { cursor: grabbing; }
.size-row-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); }
.size-days { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.size-row-actions { display: flex; gap: 4px; flex-shrink: 0; }
/* 尺寸缩略图（仅有图时渲染，不再放丑占位块） */
.size-thumb { width: 44px; height: 34px; border-radius: var(--r-s); border: 1px solid var(--line); flex-shrink: 0; }
.size-thumb-tag { transform: scale(0.9); }
.size-row-desc {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ═══ 加购项池（单块三行：普通增项/用途/加急） ═══ */
.addon-pool-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.addon-pool {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px;
  background: var(--paper2); border: 1px dashed var(--line2); border-radius: var(--r-m);
  transition: border-color 0.18s, background 0.18s;
}
.addon-pool.pool--drag-over { border-color: var(--hq); border-style: solid; background: var(--hq-t); }
/* 行：左侧固定宽类别标 + 右侧胶囊流 */
.pool-row { display: flex; align-items: flex-start; gap: 12px; }
.pool-row-label {
  flex: none; width: 64px; padding-top: 4px;
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600; color: var(--ink2);
}
.pool-label-usage { color: var(--zhe); }
.pool-label-rush { color: var(--zs); }
.pool-row-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 28px; }
.pool-row-empty { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); padding-top: 4px; }
.addon-cap {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 12px; border-radius: var(--r-pill);
  background: var(--card); border: 1px solid var(--line); box-shadow: var(--sh-1);
  cursor: pointer; user-select: none; transition: border-color var(--dur-fast), transform var(--dur-fast);
  font: inherit; color: inherit; text-align: inherit;
}
.addon-cap:hover { border-color: var(--hq); }
.addon-cap:active { transform: scale(0.97); }
.addon-cap .cap-name { font-size: calc(var(--font-scale, 1) * 12.5px); font-weight: 600; color: var(--ink); }
.addon-cap .cap-price { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); font-variant-numeric: tabular-nums; }
.addon-cap .cap-tag {
  font-size: calc(var(--font-scale, 1) * 10.5px); padding: 2px 8px; border-radius: var(--r-s);
  background: var(--line); color: var(--ink3); flex: none;
}
.addon-cap .cap-tag.cap-tag-quantity { background: var(--sl-t); color: var(--sl); }
/* 类别色（SPEC-PRICE-2）：普通=中性 / 用途=赭石 / 加急=朱砂 */
.addon-cap.cap-cat-usage { border-color: color-mix(in srgb, var(--zhe) 45%, transparent); }
.addon-cap.cap-cat-usage .cap-price { color: var(--zhe); }
.addon-cap.cap-cat-rush { border-color: color-mix(in srgb, var(--zs) 45%, transparent); }
.addon-cap.cap-cat-rush .cap-price { color: var(--zs); }

/* ═══ 尺寸三态（石绿/藤黄/朱砂；选中态色块填充提可见度） ═══ */
.size-status-seg { display: inline-flex; flex-shrink: 0; border: 1px solid var(--line2); border-radius: var(--r-m); padding: 4px; gap: 4px; background: var(--paper2); }
.seg-btn {
  border: none; background: transparent; padding: 4px 12px; font-size: calc(var(--font-scale, 1) * 11.5px);
  border-radius: var(--r-s); color: var(--ink2); cursor: pointer; font-family: var(--f-b);
  display: inline-flex; align-items: center; gap: 4px; transition: var(--dur-fast);
}
.seg-btn i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; background: var(--ink4); }
.seg-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.seg-available i { background: var(--sl); }
.seg-showcase i { background: var(--th); }
.seg-closed i { background: var(--zs); }
.seg-btn.on { font-weight: 600; }
.seg-btn.seg-available.on { background: var(--sl-t); color: var(--sl); }
.seg-btn.seg-showcase.on { background: var(--th-t); color: var(--th); }
.seg-btn.seg-closed.on { background: var(--zs-t); color: var(--zs); }
/* 关闭态整行弱化 */
.size-row--dim { opacity: 0.55; }

/* ═══ REQ-036 批A: 尺寸摘要行（§2.7 实时更新，三种计价形态视觉区分） ═══ */
.size-summary {
  margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line2);
  display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
}
.sum-label { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); padding-top: 4px; flex: none; }
.sum-chip {
  font-size: calc(var(--font-scale, 1) * 11px); padding: 2px 8px; border-radius: var(--r-pill);
  background: var(--hq-t); color: var(--hq); border: 1px solid transparent; cursor: grab;
  animation: chipIn var(--dur-mid) var(--ease-out) backwards;
}
.sum-chip.add { background: var(--paper2); color: var(--ink2); border: 1px solid var(--line); }
.sum-chip.qty { background: var(--sl-t); color: var(--sl); }
.sum-chip.pct { background: var(--zhe-t); color: var(--zhe); }
.sum-empty { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); }
@keyframes chipIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
</style>
