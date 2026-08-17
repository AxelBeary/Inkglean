<template>
  <!-- REQ-043 I4: 平台公告编辑（标题 + 内容 + 发布；内容消毒由后端入库时完成） -->
  <div class="admin-page announcement-manage">
    <!-- b3 清扫：页头并入公共 admin-page-head 体系（字体 22px→26px 口径统一） -->
    <div class="admin-page-head">
      <h1 class="admin-page-title font-display">{{ $t('announcement.admin.manage') }}</h1>
      <p class="admin-page-sub">{{ $t('announcement.admin.hint') }}</p>
    </div>

    <!-- P0 修复（前端质量战役审计）：回显失败不再静默——明示错误+重试，未加载成功禁止发布（防空公告覆盖现有公告） -->
    <div v-if="loadFailed" class="load-error-banner">
      <span>{{ t('common.networkError') }}</span>
      <el-button size="small" @click="load">{{ t('dashboard.retry') }}</el-button>
    </div>

    <!-- 819-I：分组卡片 + 一行一事（说明在左、控件在右） -->
    <div class="group announcement-form-card">
      <div class="group-head">{{ $t('announcement.admin.manage') }}</div>
      <div class="row">
        <div class="ann-text">
          <div class="lab">{{ $t('announcement.admin.titleLabel') }}</div>
          <div class="desc">{{ $t('announcement.admin.titleDesc') }}</div>
        </div>
        <el-input
          v-model="form.title"
          :placeholder="$t('announcement.admin.titlePlaceholder')"
          maxlength="100"
          show-word-limit
          class="ann-title-input"
        />
      </div>
      <div class="row">
        <div class="ann-text">
          <div class="lab">{{ $t('announcement.admin.contentLabel') }}</div>
          <div class="desc">{{ $t('announcement.admin.contentDesc') }}</div>
        </div>
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="10"
          :placeholder="$t('announcement.admin.contentPlaceholder')"
          maxlength="10000"
          show-word-limit
          class="ann-content-input"
        />
      </div>
      <div class="form-actions">
        <el-button type="primary" :loading="saving" @click="publish">{{ $t('announcement.admin.publish') }}</el-button>
        <span v-if="publishedAt" class="published-at">{{ $t('announcement.updatedAt', { time: publishedAt }) }}</span>
      </div>
    </div>
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
const loadFailed = ref(false)

/** 回显当前公告（管理员也是画师登录态，复用画师侧 GET）；失败明示+重试，不静默 */
async function load() {
  try {
    const current: PlatformAnnouncement | null = await artistApi.getAnnouncement()
    form.title = current?.title ?? ''
    form.content = current?.content ?? ''
    publishedAt.value = current?.updatedAt ?? null
    loadFailed.value = false
  } catch {
    loadFailed.value = true
  }
}

async function publish() {
  // 未加载成功禁止发布：否则可能用空表单覆盖现有公告
  if (loadFailed.value) {
    ElMessage.error(t('common.networkError'))
    await load()
    return
  }
  saving.value = true
  try {
    const saved = await adminApi.saveAnnouncement({
      title: form.title.trim() || null,
      content: form.content || null
    })
    // A1: 标题+内容双空时后端返回 null（清空公告），兜底回填保证表单永远是字符串
    const s = saved ?? { title: '', content: '' }
    form.title = s.title
    form.content = s.content
    publishedAt.value = saved?.updatedAt ?? null
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
/* P0 修复：回显失败横幅（朱砂浸染，克制不刺眼） */
.load-error-banner {
  max-width: 860px; margin: 0 0 16px; padding: 12px 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--zs-t); color: var(--zs); border-radius: var(--r-m); font-size: 13px;
}

/* 819-I：分组卡片 + 一行一事（对齐 QuickNote 基准） */
.group {
  max-width: 860px;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.ann-text { min-width: 0; }
.ann-title-input { width: 320px; flex: none; }
.ann-content-input { width: 480px; flex: none; }
.form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 12px;
}
.published-at {
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink3);
}

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .ann-title-input, .ann-content-input { width: 100%; }
}
</style>
