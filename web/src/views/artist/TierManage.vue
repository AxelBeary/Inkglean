<template>
  <ArtistLayout>
    <h2 class="font-display">价格管理</h2>

    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <!-- 档位 -->
      <el-tab-pane label="档位" name="tiers">
        <el-button type="primary" size="small" style="margin-bottom: 12px" @click="openTierDialog()">＋ 新建档位</el-button>
        <!-- R54: 档位表格→卡片布局（保留 R55 示例图拖拽/点击直传） -->
        <!-- v0.26 A: vuedraggable 卡片排序（handle 避免与示例图拖拽上传冲突） -->
        <div v-loading="loadingTiers" class="tier-card-grid">
          <draggable
            v-model="tiers"
            item-key="id"
            handle=".tier-drag-handle"
            ghost-class="ghost"
            @end="onTierDragEnd"
          >
            <template #item="{ element: row }">
          <div class="tier-card" :class="{ 'tier-card--hidden': row.visibility === 'hidden' }">
            <!-- v0.26 A: 拖拽手柄 -->
            <div class="tier-drag-handle" :title="$t('tiers.dragHint')">⠿</div>
            <!-- R55: 示例图拖拽/点击直传（无图直传；有图先确认再覆盖——旧图不可恢复，与 R53 行为不同） -->
            <div
              class="tier-card-img"
              :class="{ 'tier-card-img--active': tierDragId === row.id }"
              @click="triggerTierImgUpload(row)"
              @dragover.prevent="tierDragId = row.id"
              @dragleave="onTierImgDragLeave($event, row)"
              @drop.prevent="handleTierImgDrop($event, row)"
            >
              <el-image
                v-if="row.example_image" :src="`/uploads/${row.example_image}`"
                fit="cover" class="tier-card-photo"
                :alt="row.name"
              />
              <div v-else class="tier-card-img-empty">
                <span class="tier-card-img-plus">+</span>
                <span class="tier-card-img-hint">{{ $t('tiers.uploadExample') }}</span>
              </div>
              <div v-if="tierDragId === row.id" class="tier-card-img-overlay">
                <span>{{ $t('tiers.dropToUpload') }}</span>
              </div>
            </div>
            <div class="tier-card-body">
              <div class="tier-card-head">
                <h3 class="tier-card-name">{{ row.name }}</h3>
                <div class="tier-card-price">¥{{ row.price }}</div>
              </div>
              <p v-if="row.description" class="tier-card-desc">{{ row.description }}</p>
              <p class="tier-card-days">{{ row.work_days ? $t('tiers.daysUnit', { n: row.work_days }) : '—' }}</p>
            </div>
            <!-- #10: 三态切换（开/只展示/不展示） -->
            <div class="tier-card-visibility">
              <el-radio-group
                :model-value="row.visibility || 'visible'"
                size="small"
                @change="(val) => changeVisibility(row, val)"
              >
                <el-radio-button value="visible">{{ $t('tiers.visVisible') }}</el-radio-button>
                <el-radio-button value="showcase">{{ $t('tiers.visShowcase') }}</el-radio-button>
                <el-radio-button value="hidden">{{ $t('tiers.visHidden') }}</el-radio-button>
              </el-radio-group>
            </div>
            <div class="tier-card-actions">
              <el-button size="small" @click="openTierDialog(row)">{{ $t('common.edit') }}</el-button>
              <el-popconfirm :title="$t('tiers.confirmDelete', { name: row.name })" @confirm="removeTier(row)">
                <template #reference>
                  <el-button size="small" type="danger">{{ $t('common.delete') }}</el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>
            </template>
          </draggable>
        </div>
        <el-empty v-if="!loadingTiers && tiers.length === 0" :description="$t('tiers.empty')" />
      </el-tab-pane>

      <!-- 增项 -->
      <el-tab-pane label="增项" name="addons" lazy>
        <AddonManager />
      </el-tab-pane>

      <!-- 倍率 -->
      <el-tab-pane label="倍率" name="multipliers" lazy>
        <MultiplierManager />
      </el-tab-pane>

      <!-- 流程与比例 -->
      <el-tab-pane label="流程与比例" name="workflow" lazy>
        <WorkflowPaymentEditor />
      </el-tab-pane>
    </el-tabs>

    <!-- 档位编辑弹窗 -->
    <el-dialog v-model="tierDialogVisible" :title="editingTierId ? '编辑档位' : '新建档位'" width="450px">
      <el-form :model="tierForm" label-position="top">
        <el-form-item label="名称" required>
          <el-input v-model="tierForm.name" placeholder="如：全身像、Q版立绘" />
        </el-form-item>
        <el-form-item label="价格（元）" required>
          <el-input-number v-model="tierForm.price" :min="0" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="工期（天）">
          <el-input-number v-model="tierForm.workDays" :min="1" :max="90" style="width: 100%" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="tierForm.description" type="textarea" :rows="2" placeholder="客户可见的描述" />
        </el-form-item>
        <el-form-item label="示例图">
          <div class="example-upload">
            <el-image
              v-if="tierForm.exampleImage" :src="`/uploads/${tierForm.exampleImage}`"
              fit="cover" class="example-preview"
            />
            <el-upload
              :auto-upload="true" :http-request="uploadExample" :show-file-list="false"
              accept="image/*"
            >
              <el-button size="small" :loading="uploading">{{ tierForm.exampleImage ? '更换' : '上传' }}</el-button>
            </el-upload>
            <el-button v-if="tierForm.exampleImage" size="small" type="danger" text @click="tierForm.exampleImage = ''">移除</el-button>
          </div>
          <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tierDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTier" :loading="savingTier">保存</el-button>
      </template>
    </el-dialog>

    <!-- R55: 示例图直传隐藏文件选择器 -->
    <input ref="tierImgInputEl" type="file" accept="image/*" hidden @change="handleTierImgSelect" />
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import draggable from 'vuedraggable'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import ArtistLayout from '../../components/ArtistLayout.vue'
import AddonManager from '../../components/artist/AddonManager.vue'
import MultiplierManager from '../../components/artist/MultiplierManager.vue'
import WorkflowPaymentEditor from '../../components/artist/WorkflowPaymentEditor.vue'

const { t } = useI18n()
const activeTab = ref('tiers')

// ─── 档位 ───
const tiers = ref([])
const loadingTiers = ref(true)
const tierDialogVisible = ref(false)
const savingTier = ref(false)
const uploading = ref(false)
const editingTierId = ref(null)
const tierForm = reactive({ name: '', price: 0, workDays: 7, description: '', exampleImage: '' })

function openTierDialog(row) {
  if (row) {
    editingTierId.value = row.id
    Object.assign(tierForm, {
      name: row.name, price: row.price, workDays: row.work_days,
      description: row.description || '', exampleImage: row.example_image || ''
    })
  } else {
    editingTierId.value = null
    Object.assign(tierForm, { name: '', price: 0, workDays: 7, description: '', exampleImage: '' })
  }
  tierDialogVisible.value = true
}

async function uploadExample({ file }) {
  uploading.value = true
  try {
    const uploaded = await uploadApi.image(file)
    tierForm.exampleImage = uploaded.filePath
    ElMessage.success('已上传')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    uploading.value = false
  }
}

// ─── 粘贴上传（例图，仅弹窗打开时响应） ───
const { pasteError } = usePasteUpload({
  onFiles: handlePasteExampleFile,
  maxCount: 1,
  maxSizeMB: 10,
  enabled: tierDialogVisible
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

async function handlePasteExampleFile(files) {
  uploading.value = true
  try {
    const uploaded = await uploadApi.image(files[0])
    tierForm.exampleImage = uploaded.filePath
    ElMessage.success('已上传')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    uploading.value = false
  }
}

async function saveTier() {
  if (!tierForm.name.trim()) return ElMessage.warning('请输入名称')
  savingTier.value = true
  try {
    const payload = {
      name: tierForm.name, price: tierForm.price, workDays: tierForm.workDays,
      description: tierForm.description, exampleImage: tierForm.exampleImage || null
    }
    if (editingTierId.value) {
      await artistApi.updateTier(editingTierId.value, payload)
    } else {
      await artistApi.createTier(payload)
    }
    ElMessage.success('已保存')
    tierDialogVisible.value = false
    await loadTiers()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    savingTier.value = false
  }
}

async function removeTier(row) {
  try {
    await artistApi.deleteTier(row.id)
    ElMessage.success('已删除')
    await loadTiers()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// #10: 三态切换（即时保存，乐观更新）
async function changeVisibility(row, visibility) {
  const prev = row.visibility
  row.visibility = visibility // 乐观更新
  try {
    await artistApi.setTierVisibility(row.id, visibility)
  } catch (err) {
    row.visibility = prev // 回滚
    ElMessage.error(err.message)
  }
}

async function loadTiers() {
  loadingTiers.value = true
  try {
    tiers.value = await artistApi.getTiers()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loadingTiers.value = false
  }
}

onMounted(loadTiers)

// ─── v0.26 A: 档位拖拽排序 ───
async function onTierDragEnd(evt) {
  const { oldIndex, newIndex } = evt
  if (oldIndex === newIndex) return
  try {
    await artistApi.reorderTiers(tiers.value.map(t => t.id))
    ElMessage.success(t('tiers.reorderSaved'))
  } catch (err) {
    await loadTiers() // 回滚前端顺序
    ElMessage.error(err.message)
  }
}

// ─── R55: 示例图拖拽/点击直传（列表级，不打开弹窗） ───
const tierImgInputEl = ref(null)
const tierDragId = ref(null)
let tierImgTarget = null

function triggerTierImgUpload(row) {
  tierImgTarget = row
  tierImgInputEl.value?.click()
}

async function handleTierImgSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !tierImgTarget) return
  await uploadTierExample(file, tierImgTarget)
  tierImgTarget = null
}

/** 防 dragleave 闪烁：子元素间移动时 relatedTarget 仍在容器内，忽略 */
function onTierImgDragLeave(e, row) {
  if (e.currentTarget.contains(e.relatedTarget)) return
  if (tierDragId.value === row.id) tierDragId.value = null
}

async function handleTierImgDrop(event, row) {
  tierDragId.value = null
  const file = [...event.dataTransfer.files].find(f => f.type.startsWith('image/'))
  if (!file) {
    if (event.dataTransfer.files.length) ElMessage.error(t('tiers.notImage'))
    return
  }
  await uploadTierExample(file, row)
}

/** 上传示例图（无图直传；有图先确认再覆盖——旧图不可恢复，与 R53 看板焦点图行为不同） */
async function uploadTierExample(file, row) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('tiers.notImage'))
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error(t('tiers.tooBig'))
    return
  }
  if (row.example_image) {
    try {
      await ElMessageBox.confirm(
        t('tiers.overwriteConfirm'),
        t('tiers.overwriteTitle'),
        { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
      )
    } catch { return }
  }
  try {
    const uploaded = await uploadApi.image(file)
    await artistApi.updateTier(row.id, { exampleImage: uploaded.filePath })
    ElMessage.success(t('tiers.exampleUpdated'))
    await loadTiers()
  } catch (err) {
    ElMessage.error(err.message)
  }
}
</script>

<style scoped>
.example-upload { display: flex; align-items: center; gap: 12px; }
.example-preview { width: 80px; height: 80px; border-radius: 8px; border: 1px solid var(--border-color); }
.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

/* ─── R54: 档位卡片布局 ─── */
.tier-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  min-height: 120px;
}
.tier-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: transform 0.3s var(--ease-bounce), box-shadow 0.3s var(--ease-bounce);
}
/* v0.26 A: 拖拽手柄 */
.tier-drag-handle {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  cursor: grab; font-size: 18px; color: var(--text-muted);
  padding: 2px 6px; border-radius: 4px;
  transition: color 0.2s, background 0.2s;
}
.tier-drag-handle:hover { color: var(--el-color-primary); background: var(--bg-inset); }
.tier-drag-handle:active { cursor: grabbing; }
/* v0.26 A: 拖拽幽灵 */
.ghost { opacity: 0.4; }
.tier-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-card-hover);
}
/* R55: 示例图区域（拖拽/点击直传） */
.tier-card-img {
  position: relative;
  height: 160px;
  cursor: pointer;
  background: var(--bg-inset);
}
.tier-card-img--active { box-shadow: inset 0 0 0 2px var(--el-color-primary); }
.tier-card-photo { width: 100%; height: 160px; display: block; }
.tier-card-img-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; height: 100%;
  border-bottom: 1px dashed var(--border-color);
  color: var(--text-muted);
  transition: color 0.2s;
}
.tier-card-img:hover .tier-card-img-empty { color: var(--el-color-primary); }
.tier-card-img-plus { font-size: 28px; line-height: 1; }
.tier-card-img-hint { font-size: 12px; }
.tier-card-img-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); color: #fff;
  font-size: 13px; font-weight: 600;
  pointer-events: none;
}
/* 卡片信息区 */
.tier-card-body { padding: 14px 16px 8px; flex: 1; }
.tier-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.tier-card-name {
  font-size: 16px; font-weight: 600;
  font-family: var(--font-display);
  color: var(--text-primary);
  margin: 0;
  min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tier-card-price {
  font-size: 20px; font-weight: 700;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.tier-card-desc {
  font-size: 13px; line-height: 1.6;
  color: var(--text-secondary);
  margin: 8px 0 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.tier-card-days { font-size: 12px; color: var(--text-muted); margin: 6px 0 0; }
/* #10: 三态切换区 */
.tier-card-visibility {
  display: flex; justify-content: center; padding: 8px 16px 0;
}
/* #10: hidden 档位灰色显示 */
.tier-card--hidden { opacity: 0.5; }
.tier-card-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--border-color);
}
</style>
