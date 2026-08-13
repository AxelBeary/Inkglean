<template>
  <el-card style="max-width: 700px" v-loading="loading">
    <p class="form-hint" style="margin-bottom: 20px">{{ $t('templates.hint') }}</p>
    <p class="template-label">{{ $t('templates.label') }}</p>
    <div class="template-grid">
      <div
        v-for="tpl in templates" :key="tpl.id"
        class="template-card"
        :class="{ active: form.templateId === tpl.id }"
        role="button" tabindex="0"
        @click="$emit('pick-template', tpl.id)"
        @keyup.enter="$emit('pick-template', tpl.id)"
        @keyup.space.prevent="$emit('pick-template', tpl.id)"
      >
        <div class="template-preview">
          <el-icon v-for="(icon, idx) in tpl.preview" :key="idx" class="template-preview-icon"><component :is="icon" /></el-icon>
        </div>
        <div class="template-info">
          <div class="template-name">{{ tpl.name }}</div>
          <div class="template-desc">{{ tpl.desc }}</div>
        </div>
      </div>
    </div>

    <p class="template-label" style="margin-top: 24px">{{ $t('templates.palette') }}</p>
    <p class="form-hint" style="margin-bottom: 12px">{{ $t('templates.paletteHint') }}</p>
    <div class="palette-grid">
      <div
        v-for="pal in palettes" :key="pal.id"
        class="palette-card"
        :class="{ active: form.paletteId === pal.id }"
        role="button" tabindex="0"
        @click="$emit('pick-palette', pal.id)"
        @keyup.enter="$emit('pick-palette', pal.id)"
        @keyup.space.prevent="$emit('pick-palette', pal.id)"
      >
        <div class="palette-swatch">
          <span class="swatch-light" :style="{ background: pal.light }"></span>
          <span class="swatch-dark" :style="{ background: pal.dark }"></span>
        </div>
        <div class="template-info">
          <div class="template-name">{{ pal.name }}</div>
          <div class="template-desc">{{ pal.desc }}</div>
        </div>
      </div>
    </div>

    <p class="template-label" style="margin-top: 24px">{{ $t('settings.accentLabel') }}</p>
    <p class="form-hint" style="margin-bottom: 12px">{{ $t('settings.accentHint') }}</p>
    <div class="accent-picker">
      <button
        v-for="a in accentPresets" :key="a.color"
        class="accent-swatch-btn" :class="{ active: form.accentColor === a.color }"
        :style="{ background: a.color }"
        :aria-label="$t(a.nameKey)"
        :title="$t(a.nameKey)"
        @click="$emit('pick-accent', a.color)"
      >
        <span v-if="form.accentColor === a.color" class="swatch-check">✓</span>
      </button>
      <button
        class="accent-clear-btn" :class="{ active: !form.accentColor }"
        @click="$emit('pick-accent', null)"
      >
        {{ $t('settings.accentClear') }}
      </button>
    </div>
    <p class="form-hint" style="margin-top: 8px">{{ $t('settings.accentDarkHint') }}</p>

    <p class="template-label" style="margin-top: 24px">{{ $t('settings.coverTitle') }}</p>
    <div class="cover-preview-row" v-loading="coverLoading">
      <el-image
        v-if="coverPreview"
        :src="'/uploads/' + coverPreview.image_path"
        fit="cover" class="cover-preview-thumb" :alt="coverPreview.title || ''"
      />
      <div v-else class="cover-preview-empty">{{ $t('settings.coverEmpty') }}</div>
      <div class="cover-preview-info">
        <p class="form-hint">{{ $t('settings.coverHint') }}</p>
        <router-link to="/artworks" class="cover-manage-link">{{ $t('settings.coverManageLink') }} →</router-link>
      </div>
    </div>

    <div class="template-actions">
      <el-button @click="$emit('preview')" :disabled="!form.subdomain">{{ $t('settings.previewBtn') }}</el-button>
      <el-button type="primary" @click="$emit('save')" :loading="saving" :disabled="profileLoadFailed">{{ $t('settings.save') }}</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import type { Artwork } from '../../../api/types.js'

/** 模板与风格表单（对齐 Settings.vue form 的 template 域） */
interface TemplateForm {
  templateId: string
  paletteId: string
  accentColor: string | null
  subdomain: string
}

/** 主题模板 DTO（Settings.vue templates computed 项） */
interface TemplateOption {
  id: string
  name: string
  desc: string
  preview: Component[]
}

/** 色板 DTO（Settings.vue palettes computed 项） */
interface PaletteOption {
  id: string
  name: string
  desc: string
  light: string
  dark: string
}

/** 强调色预设（Settings.vue ACCENT_PRESETS 项） */
interface AccentPreset {
  color: string
  nameKey: string
}

defineProps<{
  form: TemplateForm
  loading: boolean
  saving: boolean
  profileLoadFailed: boolean
  templates: TemplateOption[]
  palettes: PaletteOption[]
  accentPresets: AccentPreset[]
  coverPreview: Artwork | null
  coverLoading: boolean
}>()

defineEmits<{
  save: []
  preview: []
  'pick-template': [id: string]
  'pick-palette': [id: string]
  'pick-accent': [color: string | null]
}>()
</script>

<style scoped>
.form-hint { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 12px); margin-top: 4px; }
.template-label { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; margin-bottom: 12px; color: var(--ink); }
.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
.template-card {
  cursor: pointer; border: 2px solid var(--line); border-radius: var(--r-m);
  overflow: hidden; transition: border-color var(--dur-mid) var(--ease-out), box-shadow var(--dur-mid) var(--ease-out); background: var(--card);
}
.template-card:hover { border-color: color-mix(in srgb, var(--hq) 50%, transparent); }
.template-card.active { border-color: var(--hq); box-shadow: 0 0 0 1px var(--hq); }
.template-card:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
.template-preview {
  height: 80px; display: flex; align-items: center; justify-content: center; gap: 8px;
  font-size: calc(var(--font-scale, 1) * 28px); background: var(--paper2);
}
.template-preview-icon { color: var(--hq); opacity: 0.75; }
.template-info { padding: 12px; }
.template-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); margin-bottom: 4px; }
.template-desc { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); line-height: 1.4; }
.palette-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
.palette-card {
  cursor: pointer; border: 2px solid var(--line); border-radius: var(--r-m);
  overflow: hidden; transition: border-color var(--dur-mid) var(--ease-out), box-shadow var(--dur-mid) var(--ease-out); background: var(--card);
}
.palette-card:hover { border-color: color-mix(in srgb, var(--hq) 50%, transparent); }
.palette-card.active { border-color: var(--hq); box-shadow: 0 0 0 1px var(--hq); }
.palette-card:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
.palette-swatch { height: 56px; display: flex; }
.swatch-light, .swatch-dark { flex: 1; }
.accent-picker { display: flex; align-items: center; gap: 10px; }
.accent-swatch-btn {
  width: 32px; height: 32px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: border-color var(--dur-fast);
}
.accent-swatch-btn.active { border-color: var(--ink); }
.swatch-check { color: #fff; font-size: calc(var(--font-scale, 1) * 13px); font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.accent-clear-btn {
  padding: 6px 14px; border: 1px solid var(--line); border-radius: 999px;
  background: transparent; cursor: pointer; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2);
  transition: border-color var(--dur-fast), color var(--dur-fast);
}
.accent-clear-btn:hover { border-color: var(--hq); color: var(--hq); }
.accent-clear-btn.active { border-color: var(--hq); color: var(--hq); background: var(--hq-t); }
.template-actions { display: flex; gap: 12px; margin-top: 20px; }
.cover-preview-row { display: flex; align-items: flex-start; gap: 16px; margin-top: 12px; }
.cover-preview-thumb {
  width: 120px; height: 90px; flex-shrink: 0;
  border: 2px solid var(--line); border-radius: var(--r-l);
}
.cover-preview-empty {
  width: 120px; height: 90px; flex-shrink: 0;
  border: 2px dashed var(--line); border-radius: var(--r-l);
  display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); text-align: center; padding: 8px;
}
.cover-preview-info { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cover-preview-info .form-hint { margin: 0; }
.cover-manage-link {
  color: var(--hq); text-decoration: none;
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 500; transition: opacity var(--dur-mid);
}
.cover-manage-link:hover { opacity: 0.75; text-decoration: underline; }
</style>
