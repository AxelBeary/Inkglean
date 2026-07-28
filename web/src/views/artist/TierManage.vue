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
              <el-image
                v-if="row.example_image" :src="`/uploads/${row.example_image}`"
                fit="cover" style="width: 56px; height: 56px; border-radius: 6px"
                :alt="row.name" :preview-src-list="[`/uploads/${row.example_image}`]"
              />
              <span v-else style="color: var(--text-muted)">—</span>
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
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import ArtistLayout from '../../components/ArtistLayout.vue'
import AddonManager from '../../components/artist/AddonManager.vue'
import MultiplierManager from '../../components/artist/MultiplierManager.vue'
import WorkflowPaymentEditor from '../../components/artist/WorkflowPaymentEditor.vue'

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
</script>

<style scoped>
.example-upload { display: flex; align-items: center; gap: 12px; }
.example-preview { width: 80px; height: 80px; border-radius: 8px; border: 1px solid var(--border-color); }
.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
</style>
