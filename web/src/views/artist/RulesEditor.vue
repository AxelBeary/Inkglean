<template>
  <ArtistLayout>
    <h2>{{ $t('rules.title') }}</h2>
    <p class="hint">{{ $t('rules.hint') }}</p>

    <el-card style="margin-top: 16px; max-width: 700px">
      <el-input
        v-model="content" type="textarea" :rows="16"
        :placeholder="$t('rules.placeholder')"
      />
      <div class="preview" v-if="content">
        <h4 style="margin: 16px 0 8px; color: var(--text-secondary)">{{ $t('rules.preview') }}</h4>
        <el-card shadow="never" class="preview-card">
          <div v-html="sanitizedPreview"></div>
        </el-card>
      </div>
      <el-button type="primary" style="margin-top: 16px" @click="save" :loading="saving">
        {{ $t('rules.save') }}
      </el-button>
    </el-card>
  </ArtistLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { sanitizeHtml } from '../../utils/sanitize.js'

const { t } = useI18n()
const content = ref('')
const saving = ref(false)

// XSS 防护：预览也消毒
const sanitizedPreview = computed(() => sanitizeHtml(content.value))

async function save() {
  saving.value = true
  try {
    await artistApi.updateRules(content.value)
    ElMessage.success(t('rules.saved'))
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
.hint { color: var(--text-secondary); font-size: 13px; margin-top: 8px; }
.preview-card { line-height: 1.8; color: var(--text-primary); }
</style>
