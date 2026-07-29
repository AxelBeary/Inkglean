<template>
  <ArtistLayout>
    <h2 class="font-display">价格管理</h2>

    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <!-- 档位 -->
      <el-tab-pane label="档位" name="tiers">
        <el-button type="primary" size="small" style="margin-bottom: 12px" @click="openTierDialog()">＋ 新建档位</el-button>
        <el-table :data="tiers" v-loading="loadingTiers" stripe>
          <el-table-column label="示例" width="80">
            <template #default="{ row }">
              <!-- R55: 示例图拖拽/点击直传（无图直传；有图先确认再覆盖——旧图不可恢复，与 R53 行为不同） -->
              <div
                class="tier-img-wrap"
                :class="{ 'tier-img-wrap--active': tierDragId === row.id }"
                @click="triggerTierImgUpload(row)"
                @dragover.prevent="tierDragId = row.id"
                @dragleave="onTierImgDragLeave($event, row)"
                @drop.prevent="handleTierImgDrop($event, row)"
              >
                <el-image
                  v-if="row.example_image" :src="`/uploads/${row.example_image}`"
                  fit="cover" class="tier-img"
                  :alt="row.name"
                />
                <span v-else class="tier-img-empty">+</span>
                <div v-if="tierDragId === row.id" class="tier-img-overlay">
                  <span>{{ $t('tiers.dropToUpload') }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" width="120" />
          <el-table-column prop="price" label="价格" width="100">
            <template #default="{ row }">¥{{ row.price }}</template>
          </el-table-column>
          <el-table-column prop="work_days" label="工期" width="100">
            <template #default="{ row }">{{ row.work_days ? `${row.work_days}天` : '-' }}</template>
          </el-table-column>
          <el-table-column prop="description" label="说明" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openTierDialog(row)">编辑</el-button>
              <el-popconfirm :title="`确定删除「${row.name}」？`" @confirm="removeTier(row)">
                <template #reference>
                  <el-button size="small" type="danger">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
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

/* ─── R55: 示例图拖拽/点击直传 ─── */
.tier-img-wrap {
  position: relative; width: 56px; height: 56px;
  border-radius: 6px; overflow: hidden; cursor: pointer;
  transition: box-shadow 0.15s;
}
.tier-img-wrap:hover { box-shadow: 0 0 0 2px var(--el-color-primary-light-5); }
.tier-img-wrap--active { box-shadow: 0 0 0 2px var(--el-color-primary); }
.tier-img { width: 56px; height: 56px; display: block; }
.tier-img-empty {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
  border: 2px dashed var(--border-color); border-radius: 6px;
  color: var(--text-muted); font-size: 20px;
}
.tier-img-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); color: #fff;
  font-size: 10px; font-weight: 600;
  pointer-events: none;
}
</style>
