<template>
  <!-- 818-H：同类设置收进分组卡片，组头朱砂小印点；一行一事（说明在左、控件在右） -->
  <div class="sc-tabs" v-loading="loading">
    <div class="group">
      <div class="group-head">{{ $t('settings.tabShowcase') }}</div>

      <!-- 812-B B2+B3: 小店展示独立开关（语义 = status 是否 hidden；已隐藏时可见当前隐藏态） -->
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('settings.shopVisibleLabel') }}</div>
          <div class="desc">{{ $t('settings.shopVisibleDesc') }}</div>
        </div>
        <div class="ctrl ctrl--switch">
          <ShopVisibilitySwitch
            :visible="form.status !== 'hidden'"
            :disabled="profileLoadFailed"
            @update:visible="onShopVisibleChange"
          />
        </div>
      </div>

      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('settings.announcementLabel') }}</div>
          <div class="desc">{{ $t('settings.announcementHint') }}</div>
        </div>
        <div class="ctrl ctrl--textarea">
          <!-- eslint-disable-next-line vue/no-mutating-props -->
          <el-input v-model="form.announcement" type="textarea" :rows="3" :placeholder="$t('settings.announcementPlaceholder')" maxlength="500" show-word-limit />
          <div class="ctrl-sub">
            <!-- eslint-disable-next-line vue/no-mutating-props -->
            <el-date-picker v-model="form.announcementExpiresAt" type="date" value-format="YYYY-MM-DD" class="sc-date-picker" :placeholder="$t('settings.announcementExpiresLabel')" :disabled-date="disabledDate" clearable />
            <span class="ctrl-hint">{{ $t('settings.announcementExpiresHint') }}</span>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('settings.linksLabel') }}</div>
          <div class="desc">{{ $t('settings.linksHint') }}</div>
        </div>
        <div class="ctrl ctrl--editor">
          <div class="link-editor">
            <div v-for="(link, index) in form.customLinks" :key="link.__k ?? index" class="link-row">
              <el-select
                v-model="link.platformId"
                class="link-platform-select"
                disabled
                :aria-label="$t('settings.linksLabel')"
                :placeholder="$t('settings.linkOther')"
              >
                <el-option :value="null" :label="$t('settings.linkOther')" />
                <el-option v-for="p in platforms" :key="p.id" :value="p.id" :label="p.name" />
              </el-select>
              <el-input
                v-model="link.url"
                :aria-label="$t('settings.linkUrlPlaceholder')"
                :placeholder="$t('settings.linkUrlPlaceholder')"
                class="link-url-input"
              />
              <div class="link-actions">
                <el-button text size="small" :disabled="index === 0" :aria-label="$t('settings.moveLinkUp')" @click="$emit('move-link', index, -1)">↑</el-button>
                <el-button text size="small" :disabled="index === form.customLinks.length - 1" :aria-label="$t('settings.moveLinkDown')" @click="$emit('move-link', index, 1)">↓</el-button>
                <el-button text size="small" type="danger" :aria-label="$t('settings.removeLink')" @click="$emit('remove-link', index)">✕</el-button>
              </div>
            </div>
            <p v-if="!form.customLinks.length" class="link-empty">{{ $t('settings.linksEmpty') }}</p>
            <el-button size="small" @click="$emit('add-link')" :disabled="form.customLinks.length >= 8">
              + {{ $t('settings.addLink') }}
            </el-button>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('settings.inspireLabel') }}</div>
          <div class="desc">{{ $t('settings.inspireHint') }}</div>
        </div>
        <div class="ctrl ctrl--editor">
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
          </div>
        </div>
      </div>

      <div class="form-actions">
        <el-button type="primary" @click="$emit('save')" :loading="saving" :disabled="profileLoadFailed">
          {{ $t('settings.save') }}
        </el-button>
      </div>
    </div>

    <!-- 约稿须知：独立分组（规则保存走独立接口） -->
    <div class="group" v-loading="rulesLoading">
      <div class="group-head">{{ $t('settings.tabRules') }}</div>
      <div v-if="rulesLoadFailed" class="rules-load-failed">
        <el-alert type="error" :closable="false" show-icon :title="$t('settings.rulesLoadFailed')" />
        <el-button size="small" type="primary" @click="$emit('retry-rules')">{{ $t('settings.retry') }}</el-button>
      </div>
      <template v-else>
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ $t('settings.tabRules') }}</div>
            <div class="desc">{{ $t('rules.hint') }}</div>
          </div>
          <div class="ctrl ctrl--rules">
            <el-input
              :model-value="rulesContent" type="textarea" :rows="12"
              :placeholder="$t('rules.placeholder')"
              @update:model-value="$emit('update:rulesContent', $event)"
            />
            <div class="preview" v-if="rulesContent">
              <h4 class="preview-section-title">{{ $t('rules.preview') }}</h4>
              <el-card shadow="never" class="preview-card">
                <!-- CI/CodeQL v-html 告警清零：改走统一消毒渲染入口（入参已在 Settings.vue 经 sanitizeHtml 消毒，契约在案） -->
                <SanitizedRichText :html="sanitizedRulesPreview" />
              </el-card>
            </div>
          </div>
        </div>
        <div class="form-actions">
          <el-button type="primary" @click="$emit('save-rules')" :loading="rulesSaving" :disabled="rulesLoadFailed || !rulesLoaded">
            {{ $t('rules.save') }}
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ShopVisibilitySwitch from './ShopVisibilitySwitch.vue'
import type { ArtistStatus, PlatformDTO } from '../../../api/types.js'

/** 主页展示表单（对齐 Settings.vue form 形状；__k 为父级本地行标识） */
interface ShowcaseLink {
  url: string
  platformId: number | null
  __k?: number | string
}

interface ShowcaseForm {
  status: ArtistStatus
  announcement: string
  announcementExpiresAt: string | null
  customLinks: ShowcaseLink[]
  inspirationTags: string[]
}

const props = defineProps<{
  form: ShowcaseForm
  loading: boolean
  saving: boolean
  profileLoadFailed: boolean
  platforms: PlatformDTO[]
  newTag: string
  rulesContent: string
  rulesLoading: boolean
  rulesSaving: boolean
  rulesLoadFailed: boolean
  rulesLoaded: boolean
  sanitizedRulesPreview: string
}>()

// CI v-html 告警清零：统一消毒渲染入口（与 TplRules/ContactStep 同款）
import SanitizedRichText from '../../shared/SanitizedRichText.vue'

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

// #8（拍板 2026-08-15）: 按当日零点比较——"今天"仍可选，昨天起才不可选
const disabledDate = (d: Date) => d < new Date(new Date().setHours(0, 0, 0, 0))

function onShopVisibleChange(value: boolean) {
  emit('update:status', value ? lastVisibleStatus.value : 'hidden')
}
</script>

<style scoped>
/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点 */
.sc-tabs { max-width: 860px; }
.group {
  margin-top: 16px;
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

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 480px); gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.ctrl--switch { width: 300px; }
.ctrl--textarea, .ctrl--editor, .ctrl--rules { width: 100%; }
.ctrl-sub { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.sc-date-picker { width: 200px; flex: none; }
.ctrl-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }
.form-actions { display: flex; justify-content: flex-end; padding: 12px 0 0; }

.preview-section-title { margin: 16px 0 8px; color: var(--ink2); }
.preview-card { line-height: 1.8; color: var(--ink); }
.rules-load-failed { padding: 16px 0; }
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

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .ctrl--switch { width: 100%; }
  .ctrl-sub { flex-direction: column; align-items: flex-start; }
}
</style>
