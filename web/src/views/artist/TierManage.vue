<template>
  <ArtistLayout>
    <h2>{{ $t('tiers.title') }}</h2>

    <el-button type="primary" style="margin: 16px 0" @click="openDialog()">{{ $t('tiers.addTier') }}</el-button>

    <el-table :data="tiers" v-loading="loading" stripe>
      <el-table-column :label="$t('tiers.colExample')" width="80">
        <template #default="{ row }">
          <el-image v-if="row.example_image" :src="`/uploads/${row.example_image}`"
            fit="cover" style="width: 56px; height: 56px; border-radius: 6px"
            :preview-src-list="[`/uploads/${row.example_image}`]" />
          <span v-else style="color: var(--text-muted)">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" :label="$t('tiers.colName')" width="120" />
      <el-table-column prop="price" :label="$t('tiers.colPrice')" width="100">
        <template #default="{ row }">¥{{ row.price }}</template>
      </el-table-column>
      <el-table-column prop="work_days" :label="$t('tiers.colDays')" width="100">
        <template #default="{ row }">{{ row.work_days ? $t('tiers.daysUnit', { n: row.work_days }) : '-' }}</template>
      </el-table-column>
      <el-table-column prop="description" :label="$t('tiers.colDesc')" />
      <el-table-column :label="$t('common.actions')" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">{{ $t('common.edit') }}</el-button>
          <el-button size="small" type="danger" @click="remove(row)">{{ $t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? $t('tiers.editTitle') : $t('tiers.addTitle')" width="450px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="$t('tiers.nameLabel')" required>
          <el-input v-model="form.name" :placeholder="$t('tiers.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('tiers.priceLabel')" required>
          <el-input-number v-model="form.price" :min="0" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('tiers.daysLabel')">
          <el-input-number v-model="form.workDays" :min="1" :max="90" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('tiers.descLabel')">
          <el-input v-model="form.description" type="textarea" :rows="2" :placeholder="$t('tiers.descPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('tiers.exampleLabel')">
          <div class="example-upload">
            <el-image v-if="form.exampleImage" :src="`/uploads/${form.exampleImage}`"
              fit="cover" class="example-preview" />
            <el-upload :auto-upload="true" :http-request="uploadExample" :show-file-list="false"
              accept="image/*" class="example-uploader">
              <el-button size="small" :loading="uploading">{{ form.exampleImage ? $t('tiers.changeExample') : $t('tiers.uploadExample') }}</el-button>
            </el-upload>
            <el-button v-if="form.exampleImage" size="small" type="danger" text @click="form.exampleImage = ''">{{ $t('tiers.removeExample') }}</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save" :loading="saving">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
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
    ElMessage.success(t('tiers.exampleUploaded'))
  } catch (err) {
    ElMessage.error(err.message || t('common.uploadFailed'))
  } finally {
    uploading.value = false
  }
}

async function save() {
  if (!form.name) return ElMessage.warning(t('tiers.fillName'))
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
    ElMessage.success(t('common.saved'))
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
    await ElMessageBox.confirm(t('tiers.confirmDelete', { name: row.name }), t('common.confirmDeleteTitle'), { type: 'warning' })
    await artistApi.deleteTier(row.id)
    ElMessage.success(t('common.deleted'))
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
.example-preview { width: 80px; height: 80px; border-radius: 8px; border: 1px solid var(--border-color); }
</style>
