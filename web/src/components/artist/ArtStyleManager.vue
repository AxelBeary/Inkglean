<template>
  <div class="style-manager" v-loading="loading">
    <!-- 顶部工具栏：标题 + 开关 + 状态徽章 ｜ 新建画风主入口 -->
    <div class="style-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">{{ $t('styleManage.multiStyle') }}</span>
        <el-switch v-model="multiStyleEnabled" :loading="switchSaving" :aria-label="$t('styleManage.multiStyle')" @change="onMultiStyleChange" />
        <span class="toolbar-status" :class="multiStyleEnabled ? 'status-on' : 'status-off'">
          {{ multiStyleEnabled ? $t('styleManage.toolbarStatusOn') : $t('styleManage.toolbarStatusOff') }}
        </span>
      </div>
      <el-button type="primary" class="create-style-btn" @click="openCreateStyle">
        + {{ $t('styleManage.createStyleBtn') }}
      </el-button>
    </div>
    <p class="toolbar-hint">{{ multiStyleEnabled ? $t('styleManage.multiStyleHintOn') : $t('styleManage.multiStyleHintOff') }}</p>

    <!-- v0.35 补漏 A3: 画风卡片拖拽排序（flex class 放 draggable 自身——v0.26 教训） -->
    <draggable
      v-if="styles.length"
      v-model="styles"
      item-key="id"
      handle=".style-drag-handle"
      ghost-class="ghost"
      class="style-grid"
      @end="onStyleDragEnd"
    >
      <template #item="{ element: style }">
        <el-card class="style-card" :class="{ 'style-card--locked': isLocked(style) }" shadow="hover">
          <!-- 卡头：拖拽柄 + 名称 + 默认徽标（仅多画风关闭时显示）+ 启用开关 + 操作 -->
          <template #header>
            <div class="style-card-header">
              <span class="style-card-name">
                <span class="style-drag-handle" :title="$t('tiers.dragHint')">⠿</span>
                {{ style.name }}
                <!-- 默认徽标只在多画风关闭时显示（多画风开启时无默认概念；拖拽即可调序） -->
                <el-tag v-if="!multiStyleEnabled && styles.length > 1 && style.id === defaultStyleId" size="small" type="warning" effect="plain">{{ $t('styleManage.styleDefaultTag') }}</el-tag>
              </span>
              <div class="style-card-actions">
                <!-- 多画风关闭时：非默认画风可设为默认 -->
                <el-button
                  v-if="!multiStyleEnabled && styles.length > 1 && style.id !== defaultStyleId"
                  text size="small" type="warning"
                  @click="setAsDefault(style)"
                >
                  {{ $t('styleManage.setAsDefault') }}
                </el-button>
                <el-switch
                  :model-value="!!style.is_active" size="small"
                  :disabled="isLocked(style)"
                  :active-text="$t('styleManage.styleActive')"
                  @change="(val: boolean | string | number) => toggleActive(style, val)"
                />
                <el-button text size="small" :disabled="isLocked(style)" @click="openEditStyle(style)">{{ $t('common.edit') }}</el-button>
                <el-button text size="small" type="danger" :disabled="isLocked(style)" @click="confirmDeleteStyle(style)">{{ $t('common.delete') }}</el-button>
              </div>
            </div>
          </template>

          <!-- 锁定提示（F2: 开关关闭时非默认画风灰色不可编辑） -->
          <div class="style-card-body" :class="{ 'style-card-body--locked': isLocked(style) }">
            <p v-if="isLocked(style)" class="style-locked-hint">{{ $t('styleManage.styleLocked') }}</p>

            <!-- 描述 + 示例图 -->
            <p v-if="style.description" class="style-desc">{{ style.description }}</p>
            <div v-if="style.cover_image" class="style-cover">
              <el-image :src="`/uploads/${style.cover_image}`" fit="cover" class="style-cover-img" :alt="style.name" />
            </div>

            <!-- ── 尺寸区（v0.35 补漏 A3: 行列表 + 拖拽排序） ── -->
            <div class="style-section">
              <div class="section-head">
                <h4 class="section-title">{{ $t('styleManage.sizeTitle') }}</h4>
                <el-button size="small" :disabled="isLocked(style)" @click="openSizeDialog(style)">{{ $t('styleManage.sizeAddBtn') }}</el-button>
              </div>
              <draggable
                v-model="style.sizes"
                item-key="id"
                handle=".size-drag-handle"
                ghost-class="ghost"
                class="size-row-list"
                @end="onSizeDragEnd(style)"
              >
                <template #item="{ element: size }">
                  <div
                    class="size-row"
                    :class="{ 'size-row--dim': size.display_status === 'closed' }"
                    @dragover.prevent="onSizeDragOver"
                    @drop.prevent="onDropToSize(style, size, $event)"
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
                            :disabled="isLocked(style)"
                            @click="setSizeStatus(style, size, st.value)"
                          >
                            <i></i>{{ st.label }}
                          </button>
                        </div>
                        <div class="size-row-actions">
                          <el-button text size="small" :disabled="isLocked(style)" @click="openPreview(style, size)">{{ $t('styleManage.previewBtn') }}</el-button>
                          <el-button text size="small" :disabled="isLocked(style)" @click="openSizeDialog(style, size)">{{ $t('common.edit') }}</el-button>
                          <el-button text size="small" type="danger" :disabled="isLocked(style)" @click="confirmDeleteSize(style, size)">{{ $t('common.delete') }}</el-button>
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
                        @dragstart="onChipDragStart(style, size, chip, $event)"
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
                <el-button size="small" type="primary" plain :disabled="isLocked(style)" @click="openCreateAddon(style)">
                  {{ $t('styleManage.addonCreateBtn') }}
                </el-button>
                <el-button size="small" :disabled="isLocked(style)" @click="openImportDialog(style)">
                  {{ $t('styleManage.addonPickBtn') }}
                </el-button>
              </div>
              <!-- §2.2 池子（单块三行：普通增项/用途/加急；拖到尺寸行=启用，点击胶囊=设置） -->
              <div
                class="addon-pool"
                :class="{ 'pool--drag-over': poolDragOver }"
                @dragover.prevent="onPoolDragOver"
                @dragleave="onPoolDragLeave"
                @drop.prevent="onDropToPool(style, $event)"
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
                      @dragstart="onCapDragStart(style, sa, $event)"
                      @dragend="onCapDragEnd"
                      @click="openAddonSettings(style, sa)"
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
    </draggable>
    <!-- 812-B B7: 无画风空态引导 + 直达既有创建入口 -->
    <el-empty v-else-if="!loading" :description="$t('styleManage.styleEmpty')" :image-size="80">
      <div class="style-empty-guide">
        <p class="style-empty-guide-text">{{ $t('styleManage.styleEmptyGuide') }}</p>
        <el-button type="primary" class="style-empty-cta" @click="openCreateStyle">
          {{ $t('styleManage.styleEmptyCta') }}
        </el-button>
      </div>
    </el-empty>

    <!-- REQ-043 I6-a: 画风/尺寸/导入弹窗拆为子组件（纯搬移，零行为变化） -->
    <StyleEditDialog v-model="styleDialogVisible" :style="editingStyle" @saved="load" />
    <SizeEditDialog
      v-model="sizeDialogVisible"
      :style-id="editingSizeStyleId"
      :size="editingSize"
      :artworks="artworks"
      @saved="load"
      @row-patch="onRowPatch"
    />
    <AddonImportDialog v-model="importDialogVisible" :style="importStyle" :templates="addonTemplates" @imported="load" />

    <!-- REQ-036 批A (任务2): [+ 新建增项] 弹窗 —— created=建库+挂载, attached=直接挂载同名库模板 -->
    <AddonCreateDialog
      v-model="createDialogVisible"
      :style-id="createDialogStyleId"
      :templates="addonTemplates"
      @created="onAddonCreated"
      @attached="onAddonAttached"
    />

    <!-- REQ-036 批A (任务5): 预览弹窗 —— 顾客视角只读（状态标签 + 构成 + 合计 + 公式） -->
    <AddonPreviewDialog v-model="previewVisible" :style="previewStyle" :size="previewSize" />

    <!-- REQ-036 批A (任务4): 胶囊三层弹窗 —— 模板级/画风级/尺寸级 + 移除解绑 -->
    <AddonSettingsDialog v-model="settingsVisible" :style="settingsStyle" :sa="settingsSa" @saved="onSettingsSaved" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { artistApi } from '../../api/index'
import type { AddonTemplate } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
// REQ-036 批A: 增项直觉化子组件（新建/预览/三层设置）+ SPEC-PRICE-2 共享纯函数
import AddonCreateDialog from './AddonCreateDialog.vue'
import AddonPreviewDialog from './AddonPreviewDialog.vue'
import AddonSettingsDialog from './AddonSettingsDialog.vue'
// REQ-043 I6-a: 画风/尺寸/导入弹窗子组件
import StyleEditDialog from './StyleEditDialog.vue'
import SizeEditDialog from './SizeEditDialog.vue'
import AddonImportDialog from './AddonImportDialog.vue'
import { formatYuanValue } from '../../utils/money'
import { addonCategory, addonChipKind, addonPriceText, categoryLabel, controlLabel as controlLabelText } from './addon-utils'

const { t } = useI18n()

/** 增项胶囊行（StyleAddonWithTemplate 消费子集） */
interface ManagerSa {
  id: number
  addon_template_id: number
  is_enabled: number | boolean
  template_name: string
  template_control_type: string
  template_price_mode: string
  template_default_price: number
  template_category: string
  price_override?: number | null
}
/** 尺寸行（StyleSize 消费子集 + 前端挂载的 _overrides 缓存） */
interface ManagerSizeRow {
  id: number
  name: string
  base_price: number
  sort_order: number
  image?: string | null
  image_artwork_id?: number | null
  description?: string | null
  work_days?: number | null
  display_status?: string | null
  _overrides?: Record<number, { price_override: number | null; is_hidden: boolean }>
}
/** 画风卡片行（ArtStyleWithDetails 消费子集） */
interface ManagerStyleRow {
  id: number
  name: string
  description?: string | null
  cover_image?: string | null
  sort_order: number
  is_active: number
  sizes: ManagerSizeRow[]
  addons: ManagerSa[]
}
/** 作品集条目（缩略图解析用） */
interface ManagerArtwork {
  id: number
  image_path: string
}
/** AddonCreateDialog created 事件载荷 */
interface AddonCreatedPayload {
  name: string
  control_type: 'switch' | 'quantity'
  price_mode: 'fixed' | 'percent'
  default_price: number
  category: 'add' | 'usage' | 'rush'
  unit_label?: string | null
  max_quantity?: number | null
}

const styles = ref<ManagerStyleRow[]>([])
const artworks = ref<ManagerArtwork[]>([]) // 作品集（尺寸图"从作品集挑" + 缩略图解析）
const addonTemplates = ref<AddonTemplate[]>([]) // 增项库全量（A4 导入弹窗候选）
const loading = ref(true)

// ─── v0.35 波1 (F2): 多画风开关 ───
const multiStyleEnabled = ref(false)
const switchSaving = ref(false)

/** 默认画风 = 排序最前的启用画风（动态顺延，与后端公开接口规则一致） */
const defaultStyleId = computed(() => styles.value.find(s => s.is_active)?.id ?? null)

/** 开关关闭时，非默认画风灰色不可编辑（F2 验收 2） */
function isLocked(style: ManagerStyleRow) {
  return !multiStyleEnabled.value && style.id !== defaultStyleId.value
}

/**
 * 多画风开关（SPEC-PRICE-2 防呆）：
 * - 关闭时若只剩最后一个启用画风 → 拦截（关了也没有可切换的默认，徒增困惑）
 * - 关闭成功后默认画风（首个启用）自动置顶
 */
async function onMultiStyleChange(val: string | number | boolean) {
  if (!val) {
    const enabled = styles.value.filter(s => !!s.is_active)
    if (enabled.length <= 1) {
      ElMessage.warning(t('styleManage.multiStyleLastGuard'))
      multiStyleEnabled.value = true // 回滚开关
      return
    }
  }
  switchSaving.value = true
  try {
    await artistApi.updateProfile({ multiStyleEnabled: !!val })
    if (!val) {
      const def = styles.value.find(s => !!s.is_active)
      if (def && styles.value[0]?.id !== def.id) await bringToFront(def)
    }
  } catch (err) {
    multiStyleEnabled.value = !val // 回滚开关
    ElMessage.error((err as Error).message)
  } finally {
    switchSaving.value = false
  }
}

/** 把指定画风移到数组首位并持久化 sort_order（设为默认 / 默认自动置顶共用） */
async function bringToFront(style: ManagerStyleRow) {
  const idx = styles.value.findIndex(s => s.id === style.id)
  if (idx <= 0) return
  const [moved] = styles.value.splice(idx, 1)
  styles.value.unshift(moved)
  try {
    for (let i = 0; i < styles.value.length; i++) {
      if (styles.value[i].sort_order !== i) {
        await artistApi.updateArtStyle(styles.value[i].id, { sort_order: i })
        styles.value[i].sort_order = i
      }
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
    await load() // 回滚前端顺序
  }
}

/** 设为默认（仅多画风关闭时可见）：置顶后它即默认（首个启用画风） */
async function setAsDefault(style: ManagerStyleRow) {
  await bringToFront(style)
  ElMessage.success(t('styleManage.defaultChanged'))
}

// ─── v0.35 补漏 A3: 拖拽排序（画风卡片 + 尺寸行双层） ───
// 260830 审计 L-13：排序在途锁——逐条 PUT 期间二次拖拽会就地改写数组，
// 循环按新下标继续写、两条请求互相抹平，服务端停在中间态且两边都不报错。
// 口径：在途时拒绝二次拖拽并重拉权威顺序；循环前快照 id 序列，不读实时数组。
const reordering = ref(false)

/** 画风卡片拖拽结束 — 逐条 PUT sort_order（后端无批量 reorder 端点） */
async function onStyleDragEnd() {
  if (reordering.value) { await load(); return }
  reordering.value = true
  const snapshot = styles.value.map(s => ({ id: s.id }))
  try {
    for (let i = 0; i < snapshot.length; i++) {
      await artistApi.updateArtStyle(snapshot[i].id, { sort_order: i })
      const cur = styles.value.find(s => s.id === snapshot[i].id)
      if (cur) cur.sort_order = i
    }
    ElMessage.success(t('tiers.reorderSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
    await load() // 回滚前端顺序
  } finally {
    reordering.value = false
  }
}

/** 尺寸行拖拽结束 — 逐条 PUT sort_order */
async function onSizeDragEnd(style: ManagerStyleRow) {
  if (reordering.value) { await load(); return }
  reordering.value = true
  const snapshot = style.sizes.map(s => ({ id: s.id }))
  try {
    for (let i = 0; i < snapshot.length; i++) {
      await artistApi.updateStyleSize(style.id, snapshot[i].id, { sort_order: i })
      const cur = style.sizes.find(s => s.id === snapshot[i].id)
      if (cur) cur.sort_order = i
    }
    ElMessage.success(t('tiers.reorderSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
    await load()
  } finally {
    reordering.value = false
  }
}

// ─── 控件类型标签（addon-utils 单一来源，不再本地重复定义） ───
function controlLabel(type: string) {
  return controlLabelText(t, type)
}

// ─── 画风 CRUD（表单/封面上传/保存已拆入 StyleEditDialog，此处只保留弹窗开关） ───
const styleDialogVisible = ref(false)
const editingStyle = ref<ManagerStyleRow | null>(null) // 编辑对象；null = 新建

function openCreateStyle() {
  editingStyle.value = null
  styleDialogVisible.value = true
}

function openEditStyle(style: ManagerStyleRow) {
  editingStyle.value = style
  styleDialogVisible.value = true
}

async function toggleActive(style: ManagerStyleRow, val: boolean | string | number) {
  try {
    await artistApi.updateArtStyle(style.id, { is_active: val as boolean })
    style.is_active = val ? 1 : 0
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function confirmDeleteStyle(style: ManagerStyleRow) {
  try {
    await ElMessageBox.confirm(
      t('styleManage.styleDeleteConfirm', { name: style.name }),
      t('styleManage.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await artistApi.deleteArtStyle(style.id)
    ElMessage.success(t('styleManage.styleDeleted'))
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

// ─── v0.35 波1 (F1): 尺寸 CRUD（表单/图上传/作品集挑选/保存已拆入 SizeEditDialog） ───
const sizeDialogVisible = ref(false)
const editingSizeStyleId = ref<number | undefined>(undefined) // 尺寸弹窗所属画风（与画风弹窗的 editingStyle 区分）
const editingSize = ref<ManagerSizeRow | null>(null) // 编辑对象；null = 新建

/** 尺寸缩略图：image_artwork_id 有值 → 作品集实图；否则独立上传图（渲染优先级与客户端一致） */
function sizeThumb(size: ManagerSizeRow) {
  if (size.image_artwork_id) {
    const art = artworks.value.find(a => a.id === size.image_artwork_id)
    if (art) return art.image_path
  }
  return size.image || null
}

function openSizeDialog(style: ManagerStyleRow, size?: ManagerSizeRow) {
  editingSizeStyleId.value = style.id
  editingSize.value = size || null
  sizeDialogVisible.value = true
}

/** 把即时保存的结果同步到列表（避免整体重载） */
function patchSizeRow(styleId: number, sizeId: number, patch: Record<string, unknown>) {
  const style = styles.value.find(s => s.id === styleId)
  if (!style) return
  const size = style.sizes.find(s => s.id === sizeId)
  if (size) Object.assign(size, patch)
}

/** SizeEditDialog 即时保存（上传/挑图/移除）成功后回写列表行，避免整体重载 */
function onRowPatch({ styleId, sizeId, patch }: { styleId: number; sizeId: number; patch: Record<string, unknown> }) {
  patchSizeRow(styleId, sizeId, patch)
}

async function confirmDeleteSize(style: ManagerStyleRow, size: ManagerSizeRow) {
  try {
    await ElMessageBox.confirm(
      t('styleManage.sizeDeleteConfirm', { name: size.name }),
      t('styleManage.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await artistApi.deleteStyleSize(style.id, size.id)
    ElMessage.success(t('styleManage.sizeDeleted'))
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

// ─── v0.35 补漏 A4: 从增项库导入（已拆入 AddonImportDialog，此处只保留弹窗开关） ───
const importDialogVisible = ref(false)
const importStyle = ref<ManagerStyleRow | null>(null)

function openImportDialog(style: ManagerStyleRow) {
  importStyle.value = style
  importDialogVisible.value = true
}

// ─── REQ-036 批A: 加购项池 + 拖拽 + 三态 + 摘要 + 弹窗（直觉化重构，替换 v0.35 A4/A5 行内交互） ───

/** 尺寸三态选项（SPEC-PRICE-2：后端真实枚举 available/showcase/closed，落库持久化） */
const statusOptions = computed<Array<{ value: 'available' | 'showcase' | 'closed'; label: string }>>(() => [
  { value: 'available', label: t('styleManage.sizeStatusOpen') },
  { value: 'showcase', label: t('styleManage.sizeStatusShow') },
  { value: 'closed', label: t('styleManage.sizeStatusClose') }
])

/** 三态切换：即时 PUT display_status 落库；失败回滚显示 */
async function setSizeStatus(style: ManagerStyleRow, size: ManagerSizeRow, value: 'available' | 'showcase' | 'closed') {
  const prev = size.display_status
  size.display_status = value // 乐观更新
  try {
    await artistApi.updateStyleSize(style.id, size.id, { display_status: value })
    ElMessage.success(t('common.saved'))
  } catch (err) {
    size.display_status = prev
    ElMessage.error((err as Error).message)
  }
}

/** 池子三类分组（增项/用途/加急，顺序固定）——读后端真实 category 字段 */
function poolGroups(style: ManagerStyleRow) {
  return ['add', 'usage', 'rush'].map(cat => ({ cat, items: style.addons.filter(sa => addonCategory(sa) === cat) }))
}

/** 02H 单选约束（用户原话「用途、加急分别只能选一个」）：启用目标 usage/rush 时，同画风其他同类项 is_enabled=false
 * 返回 setStyleAddons items（含目标项 is_enabled=true + 其他同类 false）；增项类(add)不互斥 */
function mutexAddonItems(style: ManagerStyleRow, targetSa: { id: number; addon_template_id: number; template_category?: string | null; is_enabled?: number | boolean }) {
  const cat = addonCategory(targetSa)
  if (cat === 'add') return null
  const items = style.addons.filter(sa => sa.id !== targetSa.id && addonCategory(sa) === cat && !!sa.is_enabled)
    .map(sa => ({ addon_template_id: sa.addon_template_id, is_enabled: false }))
  if (!items.length) return null
  return [{ addon_template_id: targetSa.addon_template_id, is_enabled: true }, ...items]
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

// ─── 新建增项（任务2）：表单 created → 建模板 + 挂本画风；attached → 直接挂载同名库模板 ───
const createDialogVisible = ref(false)
const createDialogStyleId = ref<number | undefined>(undefined)

function openCreateAddon(style: ManagerStyleRow) {
  createDialogStyleId.value = style.id
  createDialogVisible.value = true
}

/** created：库中无同名 → 新建模板并挂到本画风（自动沉淀） */
async function onAddonCreated(payload: AddonCreatedPayload) {
  const styleId = createDialogStyleId.value
  if (!styleId || !payload?.name) return
  try {
    const tpl = await artistApi.createAddonTemplate(payload)
    // 单选约束：新建用途/加急默认启用 → 同画风其他同类画风级停用（读真实 category）
    const styleObj = styles.value.find(s => s.id === styleId)
    const mutex = styleObj ? mutexAddonItems(styleObj, { id: -1, addon_template_id: tpl.id, template_category: payload.category, is_enabled: true }) : null
    if (mutex) { await artistApi.setStyleAddons(styleId, mutex) }
    await artistApi.setStyleAddons(styleId, [{ addon_template_id: tpl.id, is_enabled: true }])
    ElMessage.success(t('styleManage.addonCreatedAttached'))
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/** attached：库中已有同名 → 直接挂载该模板 */
async function onAddonAttached({ templateId }: { templateId: number }) {
  const styleId = createDialogStyleId.value
  if (!styleId || !templateId) return
  try {
    await artistApi.setStyleAddons(styleId, [{ addon_template_id: templateId, is_enabled: true }])
    ElMessage.success(t('styleManage.addonAttached'))
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

// ─── 预览弹窗（任务5）：顾客视角只读 ───
const previewVisible = ref(false)
const previewStyle = ref<ManagerStyleRow | null>(null)
const previewSize = ref<ManagerSizeRow | null>(null)

function openPreview(style: ManagerStyleRow, size: ManagerSizeRow) {
  previewStyle.value = style
  previewSize.value = size
  previewVisible.value = true
}

// ─── 三层设置弹窗（任务4）───
const settingsVisible = ref(false)
const settingsStyle = ref<ManagerStyleRow | null>(null)
const settingsSa = ref<ManagerSa | null>(null)

function openAddonSettings(style: ManagerStyleRow, sa: ManagerSa) {
  settingsStyle.value = style
  settingsSa.value = sa
  settingsVisible.value = true
}

function onSettingsSaved() {
  load()
}

// ─── 拖拽（任务3，原生 HTML5 drag）：池 → 尺寸行 = 启用；摘要 chip → 池 = 停用 ───
const dragPayload = ref<{ styleId: number; saId: number; fromSizeId: number | null } | null>(null) // { styleId, saId, fromSizeId|null }
const poolDragOver = ref(false)
const DRAG_MIME = 'text/x-addon-sa'

function onCapDragStart(style: ManagerStyleRow, sa: ManagerSa, e: DragEvent) {
  dragPayload.value = { styleId: style.id, saId: sa.id, fromSizeId: null }
  e.dataTransfer!.effectAllowed = 'copy'
  e.dataTransfer!.setData(DRAG_MIME, String(sa.id))
}

/** 摘要 chip 拖拽：记录来源尺寸，drop 到池 = 停用该尺寸 */
function onChipDragStart(style: ManagerStyleRow, size: ManagerSizeRow, chip: { id: number }, e: DragEvent) {
  dragPayload.value = { styleId: style.id, saId: chip.id, fromSizeId: size.id }
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData(DRAG_MIME, String(chip.id))
}

function onCapDragEnd() {
  dragPayload.value = null
}

/** 尺寸行 dragover：仅接受增项拖拽（避免干扰 vuedraggable 排序） */
function onSizeDragOver(e: DragEvent) {
  if (e.dataTransfer!.types.includes(DRAG_MIME)) e.preventDefault()
}

function onPoolDragOver(e: DragEvent) {
  if (e.dataTransfer!.types.includes(DRAG_MIME)) {
    e.preventDefault()
    poolDragOver.value = true
  }
}
function onPoolDragLeave() { poolDragOver.value = false }

/** 拖到尺寸行 = 启用该尺寸（仅决定启用，不动价格；已启用 → 提示不重复） */
async function onDropToSize(style: ManagerStyleRow, size: ManagerSizeRow, _e: DragEvent) {
  const payload = dragPayload.value
  if (!payload || payload.styleId !== style.id) return
  if (payload.fromSizeId === size.id) return // 从本尺寸拖回 → 无操作
  const sa = style.addons.find(s => s.id === payload.saId)
  if (!sa) return
  const ov = size._overrides || {}
  if (!ov[sa.id]?.is_hidden) {
    ElMessage.info(t('styleManage.addonAlreadyEnabled', { name: sa.template_name, size: size.name }))
    return
  }
  let mutexRestore: Array<{ addon_template_id: number; is_enabled: boolean }> | null = null
  try {
    // 单选约束：用途/加急类拖入尺寸启用 → 同画风其他同类画风级停用（顾客每单各选一个，后端兜底互斥）
    const mutex = mutexAddonItems(style, sa)
    if (mutex) {
      await artistApi.setStyleAddons(style.id, mutex)
      // 围剿 a1-14: 记录反向恢复载荷——若后续尺寸覆盖写失败，把这些刚停用的同类项重新启用
      mutexRestore = mutex
        .filter(m => m.addon_template_id !== sa.addon_template_id)
        .map(m => ({ addon_template_id: m.addon_template_id, is_enabled: true }))
      for (const m of mutex) {
        const other = style.addons.find(x => x.addon_template_id === m.addon_template_id)
        if (other) other.is_enabled = !!m.is_enabled
      }
    }
    await artistApi.setSizeOverrides(style.id, size.id, [{ style_addon_id: sa.id, price_override: ov[sa.id]?.price_override ?? null, is_hidden: false }])
    if (!size._overrides) size._overrides = {}
    size._overrides[sa.id] = { price_override: ov[sa.id]?.price_override ?? null, is_hidden: false }
    ElMessage.success(t('styleManage.addonEnabled', { size: size.name, name: sa.template_name }))
  } catch (err) {
    // 围剿 a1-14: mutex 已生效而后一步 setSizeOverrides 失败 → 反向恢复互斥项，再重载保证本地与后端一致
    if (mutexRestore?.length) {
      try {
        await artistApi.setStyleAddons(style.id, mutexRestore)
      } catch {
        // 反向恢复失败：交给重载兜底，仍提示原始错误
      }
    }
    await load()
    ElMessage.error((err as Error).message)
  } finally {
    dragPayload.value = null
    poolDragOver.value = false
  }
}

/** 拖回池 = 停用（来源尺寸记录在 fromSizeId） */
async function onDropToPool(style: ManagerStyleRow, _e: DragEvent) {
  const payload = dragPayload.value
  if (!payload || payload.styleId !== style.id) return
  if (!payload.fromSizeId) { dragPayload.value = null; return } // 池 → 池 = 无操作
  const size = style.sizes.find(s => s.id === payload.fromSizeId)
  const sa = style.addons.find(s => s.id === payload.saId)
  if (!size || !sa) { dragPayload.value = null; poolDragOver.value = false; return }
  const ov = size._overrides || {}
  try {
    await artistApi.setSizeOverrides(style.id, size.id, [{ style_addon_id: sa.id, price_override: ov[sa.id]?.price_override ?? null, is_hidden: true }])
    if (!size._overrides) size._overrides = {}
    size._overrides[sa.id] = { price_override: ov[sa.id]?.price_override ?? null, is_hidden: true }
    ElMessage.success(t('styleManage.addonDisabled', { size: size.name, name: sa.template_name }))
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    dragPayload.value = null
    poolDragOver.value = false
  }
}

/** 预载各尺寸覆盖 → size._overrides = { [styleAddonId]: { price_override, is_hidden } }（GET 只读端点）
 *  M-12（审计 260830）：写回绑定发起它的那次加载序号——晚到的预载不得写进已被新加载替换的孤儿对象
 *  （报告点名的 _overrides 残缺根因）。
 *  TODO(audit-260830): N×M 覆盖请求待后端批量接口（现逐 画风×尺寸 一个 GET；后端无一次性全量端点——
 *  getArtStyles 不含覆盖，getPublicStyles 为顾客算价端点，不暴露原始覆盖记录，故本批不切换） */
async function preloadOverrides(styleList: ManagerStyleRow[], seq: number) {
  await Promise.all(styleList.map(async style => {
    await Promise.all((style.sizes || []).map(async size => {
      try {
        const overrides = await artistApi.getSizeOverrides(style.id, size.id)
        if (seq !== loadSeq) return // 晚到即丢弃：不写孤儿对象（M-12）
        size._overrides = {}
        for (const o of overrides) {
          size._overrides[o.style_addon_id] = { price_override: o.price_override, is_hidden: !!o.is_hidden }
        }
      } catch {
        if (seq !== loadSeq) return
        size._overrides = {}
      }
    }))
  }))
}

// ─── 初始化 ───
// M-12（审计 260830）: load 序号守卫——8 处变更路径 + 弹窗 @saved + reload 并发触发 load() 时，
// 晚到的旧响应不得整体覆盖新数据；预载随同一序号绑定，防写回孤儿对象
let loadSeq = 0
async function load() {
  const mySeq = ++loadSeq
  loading.value = true
  try {
    const [styleList, profile, artworkList, templates] = await Promise.all([
      artistApi.getArtStyles(),
      artistApi.getProfile(),
      artistApi.getArtworks(),
      artistApi.getAddonTemplates()
    ])
    if (mySeq !== loadSeq) return // 晚到即旧快照，整体丢弃
    styles.value = styleList as unknown as ManagerStyleRow[]
    multiStyleEnabled.value = !!profile.multi_style_enabled
    artworks.value = artworkList
    addonTemplates.value = templates
    await preloadOverrides(styles.value, mySeq) // REQ-036: 预载覆盖（池/摘要/弹窗依赖 size._overrides）
  } catch (err) {
    if (mySeq !== loadSeq) return
    ElMessage.error((err as Error).message)
  } finally {
    if (mySeq === loadSeq) loading.value = false // 过期响应不得提前熄灭新请求的 loading
  }
}

onMounted(load)

// REQ-036 批A (任务1-1): 暴露 reload —— TierManage 切回「画风与价格」tab 时调用，修复增项库建模板后切回不刷新
defineExpose({ reload: load })
</script>

<style scoped>
/* ═══ 顶部工具栏：标题+开关+状态徽章 ｜ 新建画风主入口 ═══ */
.style-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  margin-bottom: 8px; padding: 16px 20px;
  background: var(--card); border: 1px solid var(--line); border-radius: var(--r-l);
}
.toolbar-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.toolbar-title { font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700; color: var(--ink); font-family: var(--f-d); }
/* 状态徽章：开=石绿软底 / 关=藤黄软底（语义色一眼可辨） */
.toolbar-status {
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600;
  padding: 4px 12px; border-radius: var(--r-pill);
}
.toolbar-status.status-on { background: var(--sl-t); color: var(--sl); }
.toolbar-status.status-off { background: var(--th-t); color: var(--th); }
/* 新建画风：页面唯一最强主操作 */
.create-style-btn { font-size: calc(var(--font-scale, 1) * 15px); font-weight: 600; padding: 12px 24px; height: auto; }
.toolbar-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin: 0 0 16px; line-height: 1.6; padding: 0 4px; }

/* 812-B B7: 无画风空态引导 */
.style-empty-guide { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.style-empty-guide-text { margin: 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); line-height: 1.5; }
.style-empty-cta { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; }

/* 分栏阈值 680px：宽屏才分两列，避免单块过窄；
   824 响应式巡逻：minmax 下限取 min(680px,100%)——容器不足 680 时列宽跟容器缩，
   防卡片硬撑 680 溢出裁切（768 实测删除钮被切） */
.style-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(680px, 100%), 1fr)); gap: 20px; align-items: start; }
@media (max-width: 760px) { .style-grid { grid-template-columns: 1fr; } }
/* A3: 拖拽幽灵 */
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

.addon-tpl-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 500; color: var(--ink); }

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
