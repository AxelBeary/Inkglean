<!-- eslint-disable vue/no-mutating-props -->
<template>
  <el-card style="max-width: 700px" v-loading="loading">
    <el-form :model="form" label-position="top" size="large">
      <!-- 812-B B2+B3: 小店展示独立开关（语义 = status 是否 hidden；已隐藏时可见当前隐藏态） -->
      <el-form-item>
        <ShopVisibilitySwitch
          :visible="form.status !== 'hidden'"
          :disabled="profileLoadFailed"
          @update:visible="onShopVisibleChange"
        />
      </el-form-item>

      <el-form-item :label="$t('settings.announcementLabel')">
        <el-input
          v-model="form.announcement" type="textarea" :rows="3"
          :placeholder="$t('settings.announcementPlaceholder')"
          maxlength="500" show-word-limit
        />
        <div class="form-hint">{{ $t('settings.announcementHint') }}</div>
        <el-date-picker
          v-model="form.announcementExpiresAt"
          type="date"
          value-format="YYYY-MM-DD"
          :placeholder="$t('settings.announcementExpiresLabel')"
          :disabled-date="disabledDate"
          clearable
          style="margin-top: 8px; width: 220px"
        />
        <div class="form-hint">{{ $t('settings.announcementExpiresHint') }}</div>
      </el-form-item>

      <el-form-item :label="$t('settings.linksLabel')">
        <div class="link-editor">
          <div v-for="(link, index) in form.customLinks" :key="link.__k ?? index" class="link-row">
            <el-select
              v-model="link.platformId"
              class="link-platform-select"
              disabled
              :placeholder="$t('settings.linkOther')"
            >
              <el-option :value="null" :label="$t('settings.linkOther')" />
              <el-option v-for="p in platforms" :key="p.id" :value="p.id" :label="p.name" />
            </el-select>
            <el-input
              v-model="link.url"
              :placeholder="$t('settings.linkUrlPlaceholder')"
              class="link-url-input"
            />
            <div class="link-actions">
              <el-button text size="small" :disabled="index === 0" @click="$emit('move-link', index, -1)">↑</el-button>
              <el-button text size="small" :disabled="index === form.customLinks.length - 1" @click="$emit('move-link', index, 1)">↓</el-button>
              <el-button text size="small" type="danger" @click="$emit('remove-link', index)">✕</el-button>
            </div>
          </div>
          <p v-if="!form.customLinks.length" class="link-empty">{{ $t('settings.linksEmpty') }}</p>
          <el-button size="small" @click="$emit('add-link')" :disabled="form.customLinks.length >= 8">
            + {{ $t('settings.addLink') }}
          </el-button>
          <div class="form-hint">{{ $t('settings.linksHint') }}</div>
        </div>
      </el-form-item>

      <el-form-item :label="$t('settings.inspireLabel')">
        <div class="tag-editor">
          <div class="tag-list">
            <el-tag
              v-for="(tag, index) in form.inspirationTags"
              :key="tag + index"
              closable
              @close="$emit('remove-tag', index)"
            >
              {{ tag }}
            </el-tag>
          </div>
          <el-input
            :model-value="newTag"
            class="tag-input"
            :placeholder="$t('settings.inspireInputPlaceholder')"
            maxlength="30"
            show-word-limit
            @update:model-value="$emit('update:newTag', $event)"
            @keyup.enter="$emit('add-tag')"
          />
          <div class="form-hint">{{ $t('settings.inspireHint') }}</div>
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="$emit('save')" :loading="saving" :disabled="profileLoadFailed">{{ $t('settings.save') }}</el-button>
      </el-form-item>
    </el-form>
  </el-card>

  <el-card style="max-width: 700px; margin-top: 16px" v-loading="rulesLoading">
    <template #header><span>{{ $t('settings.tabRules') }}</span></template>
    <div v-if="rulesLoadFailed" class="rules-load-failed">
      <el-alert type="error" :closable="false" show-icon :title="$t('settings.rulesLoadFailed')" />
      <el-button size="small" type="primary" style="margin-top: 8px" @click="$emit('retry-rules')">{{ $t('settings.retry') }}</el-button>
    </div>
    <template v-else>
      <p class="form-hint" style="margin-bottom: 16px">{{ $t('rules.hint') }}</p>
      <el-input
        :model-value="rulesContent" type="textarea" :rows="16"
        :placeholder="$t('rules.placeholder')"
        @update:model-value="$emit('update:rulesContent', $event)"
      />
      <div class="preview" v-if="rulesContent">
        <h4 class="preview-section-title">{{ $t('rules.preview') }}</h4>
        <el-card shadow="never" class="preview-card">
          <div v-html="sanitizedRulesPreview"></div>
        </el-card>
      </div>
      <el-button type="primary" style="margin-top: 16px" @click="$emit('save-rules')" :loading="rulesSaving" :disabled="rulesLoadFailed || !rulesLoaded">
        {{ $t('rules.save') }}
      </el-button>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ShopVisibilitySwitch from './ShopVisibilitySwitch.vue'

const props = defineProps<{
  form: any
  loading: boolean
  saving: boolean
  profileLoadFailed: boolean
  platforms: any[]
  newTag: string
  rulesContent: string
  rulesLoading: boolean
  rulesSaving: boolean
  rulesLoadFailed: boolean
  rulesLoaded: boolean
  sanitizedRulesPreview: string
}>()

// 812 debug 审计修复：记住隐藏前的营业状态（open/full/break），开关打开时恢复原状，
// 避免覆写为 'open' 导致画师丢失满单/休息中状态
const lastVisibleStatus = ref('open')
watch(() => props.form?.status, (s) => {
  if (s && s !== 'hidden') lastVisibleStatus.value = s
}, { immediate: true })

const emit = defineEmits<{
  save: []
  'update:status': [value: string]
  'add-link': []
  'remove-link': [index: number | string]
  'move-link': [index: number | string, direction: number]
  'add-tag': []
  'remove-tag': [index: number | string]
  'save-rules': []
  'retry-rules': []
  'update:newTag': [value: string]
  'update:rulesContent': [value: string]
}>()

const disabledDate = (d: Date) => d < new Date()

function onShopVisibleChange(value: boolean) {
  emit('update:status', value ? lastVisibleStatus.value : 'hidden')
}
</script>

<style scoped>
.form-hint { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 12px); margin-top: 4px; }
.preview-section-title { margin: 16px 0 8px; color: var(--ink2); }
.preview-card { line-height: 1.8; color: var(--ink); }
.link-editor { width: 100%; }
.link-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.link-platform-select { width: 150px; flex-shrink: 0; }
.link-url-input { flex: 1; }
.link-empty { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 12px); margin: 0 0 8px; }
.link-actions {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}
.tag-editor { width: 100%; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.tag-input { max-width: 300px; }
</style>
