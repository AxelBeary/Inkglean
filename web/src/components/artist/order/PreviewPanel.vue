<template>
  <!-- 迁移 v81 过程稿（契约 _CONTRACT.md §三）：订单级「对客户可见」开关 + 单图开关/备注 + 免费修改额度。
       与 GalleryPanel 同构（同 el-card/同上传磁贴/同失败提示口吻），但独立成卡：
       参考图是客户给的输入，过程稿是画师给的输出，混在一张卡里两种权限口径会打架。 -->
  <el-card class="od-card">
    <template #header>
      <CardHead :title="$t('preview.title')">
        <template #extra>
          <span class="preview-count">{{ previews.length }}</span>
        </template>
      </CardHead>
    </template>

    <div v-loading="loading">
      <!-- 加载失败：页内错误条 + 重试（对齐 LogPanel 的 module-error 口径，不弹 toast 吵人） -->
      <div v-if="loadError" class="module-error">
        <span>{{ $t('preview.loadFailed') }}</span>
        <el-button size="small" @click="load">{{ $t('dashboard.retry') }}</el-button>
      </div>
      <template v-else>
        <!-- 订单级设置：开关 + 免费修改额度（0 = 不限，见契约 §一 语义表） -->
        <div class="preview-settings">
          <div class="preview-setting-row">
            <span class="preview-setting-label">{{ $t('preview.allowClient') }}</span>
            <el-switch
              v-model="visibleToClient" size="small"
              :disabled="settingsSaving"
              @change="onToggleClientVisible"
            />
            <span class="preview-setting-hint">{{ $t('preview.allowClientHint') }}</span>
          </div>
          <div class="preview-setting-row">
            <span class="preview-setting-label">{{ $t('revision.limitLabel') }}</span>
            <el-input-number
              v-model="freeLimit"
              :min="0" :max="99" :step="1" :precision="0"
              :disabled="settingsSaving" controls-position="right" size="small" style="width: 104px"
              @change="onChangeLimit"
            />
            <span class="preview-setting-hint">{{ $t('revision.unlimitedHint') }}</span>
          </div>
          <p class="preview-used">{{ $t('revision.usedCount', { used: revisionUsed }) }}</p>
          <!-- 非阻断提示：只提醒「这次会超出免费次数」，绝不禁用「需修改」按钮——画师永远可以改 -->
          <p v-if="overLimit" class="preview-over-limit">
            {{ $t('revision.overLimit', { used: revisionUsed, limit: freeLimit ?? 0 }) }}
          </p>
        </div>

        <div class="preview-grid">
          <div
            v-for="row in previews" :key="row.id"
            class="preview-item" :class="{ 'preview-item--private': !row.visible }"
          >
            <el-image :src="row.url" fit="cover" class="preview-img" :alt="row.caption || $t('preview.alt')">
              <template #placeholder><div class="preview-img-skeleton"></div></template>
            </el-image>
            <div class="preview-item-bar">
              <!-- 单图级可见性：关 = 仅画师可见（这类图服务端不会下发给客户） -->
              <el-switch
                :model-value="row.visible" size="small"
                :aria-label="$t('preview.visibleToClient')"
                @update:model-value="(v: string | number | boolean) => onToggleRowVisible(row, v === true)"
              />
              <span class="preview-item-tag">{{ row.visible ? $t('preview.visibleToClient') : $t('preview.visibleSelf') }}</span>
              <el-button
                text size="small" type="danger" class="preview-item-del"
                :aria-label="$t('common.delete')" :title="$t('common.delete')"
                @click="remove(row)"
              >
                ✕
              </el-button>
            </div>
            <el-input
              v-model="row.caption" size="small" maxlength="100"
              :placeholder="$t('preview.captionPlaceholder')"
              @change="saveCaption(row)"
            />
          </div>

          <!-- 上传磁贴（单击选图；一次一张，避免多图串行上传时半成功无人收拾） -->
          <button
            type="button" class="preview-upload-tile"
            :disabled="uploading"
            @click="triggerUpload"
          >
            <el-icon :size="24"><Plus /></el-icon>
            <span class="preview-upload-text">{{ uploading ? $t('preview.uploading') : $t('preview.upload') }}</span>
          </button>
          <input ref="uploadInputEl" type="file" accept="image/*" hidden @change="onFilePicked" />
        </div>

        <p v-if="!previews.length" class="preview-empty">{{ $t('preview.empty') }}</p>
      </template>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import CardHead from '../visual/CardHead.vue'
import { artistApi, uploadApi } from '../../../api/index'
import type { ArtistOrderPreview } from '../../../api/types'

/** 列表行：caption 归一为空串（el-input 不接 null）、visible 归一为布尔
 *  （契约写 boolean，DB 列却是 INTEGER 0/1，原样喂 el-switch 会出现「点了不回弹」）。 */
interface PreviewRow {
  id: number
  url: string
  caption: string
  visible: boolean
  createdAt: string
}

const props = defineProps({
  orderId: { type: [String, Number], required: true }
})

const { t } = useI18n()

const loading = ref(false)
const loadError = ref(false)
const uploading = ref(false)
const settingsSaving = ref(false)
const previews = ref<PreviewRow[]>([])
const visibleToClient = ref(false)
const freeLimit = ref<number | null>(0)
/** 已用次数由后端派生（契约 §一：不存字段，恒等于修改记录条数），前端只读 */
const revisionUsed = ref(0)
const uploadInputEl = ref<HTMLInputElement | null>(null)

/** 超出免费次数：只做提示，不禁用任何操作 */
const overLimit = computed(() => {
  const limit = freeLimit.value
  return typeof limit === 'number' && limit > 0 && revisionUsed.value >= limit
})

function normalize(row: ArtistOrderPreview): PreviewRow {
  return {
    id: row.id,
    url: row.url,
    caption: row.caption ?? '',
    visible: Boolean(row.visible),
    createdAt: row.createdAt
  }
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const res = await artistApi.getOrderPreviews(props.orderId as number)
    previews.value = (res.previews || []).map(normalize)
    visibleToClient.value = Boolean(res.previewVisibleToClient)
    freeLimit.value = res.freeRevisionLimit ?? 0
    revisionUsed.value = res.revisionUsed ?? 0
  } catch (err) {
    loadError.value = true
    // 首载失败页内已有错误条，不再叠 toast；仅在有旧数据（操作失败）时提示
    if (previews.value.length) ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

/** 订单级设置写入：乐观更新 + 失败回滚（同 SizeEditDialog 的即时保存口径） */
async function patchSettings(patch: { previewVisibleToClient?: boolean; freeRevisionLimit?: number }) {
  settingsSaving.value = true
  try {
    const res = await artistApi.updateOrderPreviewSettings(props.orderId as number, patch)
    visibleToClient.value = Boolean(res.previewVisibleToClient)
    freeLimit.value = res.freeRevisionLimit
    ElMessage.success(t('preview.settingsSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
    await load() // 回滚到服务端真值，避免界面显示一个没存进去的开关
  } finally {
    settingsSaving.value = false
  }
}

function onToggleClientVisible(value: string | number | boolean) {
  // el-switch 已写 v-model，这里只需把意图送服务端；失败由 patchSettings 回滚
  void patchSettings({ previewVisibleToClient: value === true })
}

function onChangeLimit(value: number | null | undefined) {
  // 0..99 整数：el-input-number 的 min/max/precision 已钳住，空值（清空输入）按不改处理
  if (value == null || !Number.isInteger(value)) {
    ElMessage.warning(t('revision.invalidLimit'))
    void load()
    return
  }
  void patchSettings({ freeRevisionLimit: value })
}

function triggerUpload() {
  uploadInputEl.value?.click()
}

/** 上传 → 登记到订单（两步都成功才算数；上传成功登记失败时留孤儿文件，由服务端 GC 清理） */
async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选同一张
  if (!file || uploading.value) return
  uploading.value = true
  try {
    const uploaded = await uploadApi.preview(file)
    const created = await artistApi.addOrderPreview(props.orderId as number, { filePath: uploaded.filePath })
    previews.value = [normalize(created), ...previews.value]
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    uploading.value = false
  }
}

/** 单图可见性：乐观写入行 + 失败回滚该行 */
async function onToggleRowVisible(row: PreviewRow, next: boolean) {
  const prev = row.visible
  row.visible = next
  try {
    const updated = await artistApi.updateOrderPreview(props.orderId as number, row.id, { visible: next })
    row.visible = Boolean(updated.visible)
  } catch (err) {
    row.visible = prev
    ElMessage.error((err as Error).message)
  }
}

/** 备注：失焦（change）才提交，避免逐字 PATCH 打爆接口 */
async function saveCaption(row: PreviewRow) {
  try {
    const updated = await artistApi.updateOrderPreview(props.orderId as number, row.id, { caption: row.caption || null })
    row.caption = updated.caption ?? ''
    ElMessage.success(t('preview.saved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
    await load()
  }
}

async function remove(row: PreviewRow) {
  try {
    await artistApi.deleteOrderPreview(props.orderId as number, row.id)
    previews.value = previews.value.filter(p => p.id !== row.id)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

onMounted(load)
</script>

<style scoped>
/* ─── 迁移 v81: 过程稿设置区 ─── */
.preview-count { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.preview-settings {
  display: flex; flex-direction: column; gap: 8px;
  padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--line);
}
.preview-setting-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.preview-setting-label { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); }
/* 0 = 不限 / 提示句：与设置行同色系弱化，不抢操作性文字 */
.preview-setting-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.preview-used { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin: 0; }
/* 超次数：藤黄（待办提醒语义），不是朱砂——不阻断，只是提醒 */
.preview-over-limit {
  margin: 0; padding: 8px 12px; border-radius: var(--r-m);
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--th);
  background: var(--th-t);
}

/* ─── 过程稿网格（照 GalleryPanel 的 ref-grid/上传磁贴形态） ─── */
.preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.preview-item { display: flex; flex-direction: column; gap: 6px; }
/* 仅自己可见：整格压暗，一眼区分「客户看不到」的那几张 */
.preview-item--private .preview-img { opacity: 0.55; }
.preview-img {
  width: 100%; height: 120px; display: block;
  border-radius: var(--r-m); background: var(--paper2);
}
.preview-img-skeleton {
  width: 100%; height: 100%;
  background: var(--paper2);
  animation: preview-skeleton-pulse 1.2s ease-in-out infinite;
}
@keyframes preview-skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
.preview-item-bar { display: flex; align-items: center; gap: 6px; }
.preview-item-tag { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2); }
.preview-item-del { margin-left: auto; }
.preview-upload-tile {
  height: 120px;
  border: 2px dashed var(--line2); border-radius: var(--r-m);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; color: var(--ink2);
  padding: 0; background: none; font: inherit; text-align: inherit;
  transition: border-color var(--dur-mid), background var(--dur-mid), color var(--dur-mid);
}
.preview-upload-tile:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
.preview-upload-tile:hover:not(:disabled) { border-color: var(--hq); background: var(--hq-t); color: var(--hq); }
.preview-upload-tile:disabled { cursor: progress; opacity: 0.7; }
.preview-upload-text { font-size: calc(var(--font-scale, 1) * 12px); }
.preview-empty { margin: 12px 0 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
/* 加载失败错误态（对齐 LogPanel 的 module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
</style>
