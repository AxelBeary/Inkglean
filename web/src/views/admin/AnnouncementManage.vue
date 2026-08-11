<template>
  <!-- REQ-043 I4: 平台公告编辑（标题 + 内容 + 发布；内容消毒由后端入库时完成） -->
  <div class="admin-page announcement-manage">
    <h2 class="font-display page-title">{{ $t('announcement.admin.manage') }}</h2>
    <p class="page-subtitle">{{ $t('announcement.admin.hint') }}</p>

    <el-card class="announcement-form-card">
      <el-form :model="form" label-position="top">
        <el-form-item :label="$t('announcement.admin.titleLabel')">
          <el-input
            v-model="form.title"
            :placeholder="$t('announcement.admin.titlePlaceholder')"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="$t('announcement.admin.contentLabel')">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="10"
            :placeholder="$t('announcement.admin.contentPlaceholder')"
            maxlength="10000"
            show-word-limit
          />
        </el-form-item>
        <div class="form-actions">
          <el-button type="primary" :loading="saving" @click="publish">{{ $t('announcement.admin.publish') }}</el-button>
          <span v-if="publishedAt" class="published-at">{{ $t('announcement.updatedAt', { time: publishedAt }) }}</span>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi, adminApi } from '../../api/index.js'
import type { PlatformAnnouncement } from '../../api/types.js'

const { t } = useI18n()
const form = reactive<{ title: string; content: string }>({ title: '', content: '' })
const saving = ref(false)
const publishedAt = ref<string | null>(null)

/** 回显当前公告（管理员也是画师登录态，复用画师侧 GET） */
async function load() {
  try {
    const current: PlatformAnnouncement | null = await artistApi.getAnnouncement()
    form.title = current?.title ?? ''
    form.content = current?.content ?? ''
    publishedAt.value = current?.updatedAt ?? null
  } catch {
    /* 回显失败静默：表单留空，保存时后端校验 */
  }
}

async function publish() {
  saving.value = true
  try {
    const saved = await adminApi.saveAnnouncement({
      title: form.title.trim() || null,
      content: form.content || null
    })
    form.title = saved.title
    form.content = saved.content
    publishedAt.value = saved.updatedAt
    ElMessage.success(t('announcement.admin.published'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: calc(var(--font-scale, 1) * 22px);
  font-weight: 700;
  color: var(--ink);
}
.page-subtitle {
  margin: 0 0 16px;
  font-size: calc(var(--font-scale, 1) * 12.5px);
  color: var(--ink2);
}
.announcement-form-card { max-width: 720px; border-radius: var(--r-l); }
.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.published-at {
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink3);
}
</style>
