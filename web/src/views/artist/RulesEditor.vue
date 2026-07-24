<template>
  <ArtistLayout>
    <h2>📜 须知编辑</h2>
    <p class="hint">编辑客户下单前必须阅读的约稿须知。支持 HTML 标签。</p>

    <el-card style="margin-top: 16px; max-width: 700px">
      <el-input
        v-model="content" type="textarea" :rows="16"
        placeholder="输入约稿须知内容，支持 HTML 标签如 <h3>、<ul>、<li>、<strong> 等"
      />
      <div class="preview" v-if="content">
        <h4 style="margin: 16px 0 8px; color: #999">预览：</h4>
        <el-card shadow="never" class="preview-card">
          <div v-html="content"></div>
        </el-card>
      </div>
      <el-button type="primary" style="margin-top: 16px" @click="save" :loading="saving">
        保存须知
      </el-button>
    </el-card>
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'

const content = ref('')
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    await artistApi.updateRules(content.value)
    ElMessage.success('须知已保存')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const rules = await artistApi.getRules()
    content.value = rules?.content || ''
  } catch { /* ignore */ }
})
</script>

<style scoped>
.hint { color: #999; font-size: 13px; margin-top: 8px; }
.preview-card { line-height: 1.8; }
</style>
