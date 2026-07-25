<template>
  <ArtistLayout>
    <h2>💰 价格管理</h2>

    <el-button type="primary" style="margin: 16px 0" @click="openDialog()">+ 添加档位</el-button>

    <el-table :data="tiers" v-loading="loading" stripe>
      <el-table-column label="例图" width="80">
        <template #default="{ row }">
          <el-image v-if="row.example_image" :src="`/uploads/${row.example_image}`"
            fit="cover" style="width: 56px; height: 56px; border-radius: 6px"
            :preview-src-list="[`/uploads/${row.example_image}`]" />
          <span v-else style="color: #ccc">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="120" />
      <el-table-column prop="price" label="价格" width="100">
        <template #default="{ row }">¥{{ row.price }}</template>
      </el-table-column>
      <el-table-column prop="work_days" label="工期" width="100">
        <template #default="{ row }">{{ row.work_days ? row.work_days + '天' : '-' }}</template>
      </el-table-column>
      <el-table-column prop="description" label="描述" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑档位' : '添加档位'" width="450px">
      <el-form :model="form" label-position="top">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：头像、半身像、全身像" />
        </el-form-item>
        <el-form-item label="价格（元）" required>
          <el-input-number v-model="form.price" :min="0" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="工期（天）">
          <el-input-number v-model="form.workDays" :min="1" :max="90" style="width: 100%" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="简要说明这个档位包含什么" />
        </el-form-item>
        <el-form-item label="例图（可选）">
          <div class="example-upload">
            <el-image v-if="form.exampleImage" :src="`/uploads/${form.exampleImage}`"
              fit="cover" class="example-preview" />
            <el-upload :auto-upload="true" :http-request="uploadExample" :show-file-list="false"
              accept="image/*" class="example-uploader">
              <el-button size="small" :loading="uploading">{{ form.exampleImage ? '更换例图' : '上传例图' }}</el-button>
            </el-upload>
            <el-button v-if="form.exampleImage" size="small" type="danger" text @click="form.exampleImage = ''">移除</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'

const tiers = ref([])
const loading = ref(true)
const dialogVisible = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editingId = ref(null)

const form = reactive({ name: '', price: 0, workDays: 7, description: '', exampleImage: '' })

function openDialog(row) {
  if (row) {
    editingId.value = row.id
    Object.assign(form, {
      name: row.name, price: row.price, workDays: row.work_days,
      description: row.description || '', exampleImage: row.example_image || ''
    })
  } else {
    editingId.value = null
    Object.assign(form, { name: '', price: 0, workDays: 7, description: '', exampleImage: '' })
  }
  dialogVisible.value = true
}

async function uploadExample({ file }) {
  uploading.value = true
  try {
    const uploaded = await uploadApi.image(file)
    form.exampleImage = uploaded.filePath
    ElMessage.success('例图已上传，点保存后生效')
  } catch (err) {
    ElMessage.error(err.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function save() {
  if (!form.name) return ElMessage.warning('请填写名称')
  saving.value = true
  try {
    if (editingId.value) {
      await artistApi.updateTier(editingId.value, {
        name: form.name, price: form.price, work_days: form.workDays,
        description: form.description, example_image: form.exampleImage || null
      })
    } else {
      await artistApi.createTier({
        name: form.name, price: form.price, workDays: form.workDays,
        description: form.description, exampleImage: form.exampleImage || null
      })
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await loadTiers()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除档位「${row.name}」？`, '确认删除', { type: 'warning' })
    await artistApi.deleteTier(row.id)
    ElMessage.success('已删除')
    await loadTiers()
  } catch { /* cancelled */ }
}

async function loadTiers() {
  loading.value = true
  try {
    tiers.value = await artistApi.getTiers()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadTiers)
</script>

<style scoped>
.example-upload { display: flex; align-items: center; gap: 12px; }
.example-preview { width: 80px; height: 80px; border-radius: 8px; border: 1px solid #eee; }
</style>
