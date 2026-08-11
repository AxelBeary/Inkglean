<template>
  <el-card style="max-width: 600px" v-loading="loading">
    <el-form label-position="top" size="large">
      <el-form-item :label="$t('settings.avatarLabel')">
        <div class="avatar-upload" tabindex="0" role="button" :aria-label="$t('settings.avatarHint')" @click="triggerAvatarUpload" @keydown.enter.prevent="triggerAvatarUpload" @keydown.space.prevent="triggerAvatarUpload">
          <el-avatar :size="72" :src="avatarPreviewUrl" class="avatar-preview">
            {{ name?.charAt(0) || '?' }}
          </el-avatar>
          <span class="avatar-upload-hint">{{ $t('settings.avatarHint') }}</span>
        </div>
        <input ref="avatarInputEl" type="file" accept="image/*" hidden @change="onAvatarPick" />
      </el-form-item>
      <el-form-item :label="$t('settings.nameLabel')">
        <el-input :model-value="name" @update:model-value="$emit('update:name', $event)" />
      </el-form-item>
      <el-form-item :label="$t('settings.codeLabel')">
        <el-input :model-value="artistCode" @update:model-value="$emit('update:artistCode', $event)" :placeholder="$t('settings.codePlaceholder')" maxlength="10" />
        <div class="form-hint">{{ $t('settings.codeHint') }}</div>
      </el-form-item>
      <el-form-item :label="$t('settings.bioLabel')">
        <el-input :model-value="bio" @update:model-value="$emit('update:bio', $event)" type="textarea" :rows="3" :placeholder="$t('settings.bioPlaceholder')" />
      </el-form-item>
      <el-form-item :label="$t('settings.contactQqLabel')">
        <el-input :model-value="contactQq" @update:model-value="$emit('update:contactQq', $event)" :placeholder="$t('settings.contactQqPlaceholder')" maxlength="15" />
        <div class="form-hint">{{ $t('settings.contactQqHint') }}</div>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="$emit('save')" :loading="saving" :disabled="profileLoadFailed">{{ $t('settings.save') }}</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  name: string
  artistCode: string
  bio: string
  contactQq: string
  avatar: string
  loading: boolean
  saving: boolean
  profileLoadFailed: boolean
}>()

const emit = defineEmits<{
  save: []
  'update:name': [value: string]
  'update:artistCode': [value: string]
  'update:bio': [value: string]
  'update:contactQq': [value: string]
  'avatar-pick': [file: File]
}>()

const avatarInputEl = ref<HTMLInputElement | null>(null)
const avatarPreviewUrl = computed(() => props.avatar ? '/uploads/' + props.avatar : undefined)

function triggerAvatarUpload() {
  avatarInputEl.value?.click()
}

function onAvatarPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('avatar-pick', file)
  }
  input.value = ''
}
</script>

<style scoped>
.form-hint { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 12px); margin-top: 4px; }
.avatar-upload {
  display: flex; align-items: center; gap: 16px;
  cursor: pointer; user-select: none;
  outline: none;
}
.avatar-upload:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; border-radius: var(--r-m); }
.avatar-preview { transition: transform 0.15s, box-shadow 0.15s; }
.avatar-upload:hover .avatar-preview { transform: scale(1.05); box-shadow: 0 0 0 3px color-mix(in srgb, var(--hq) 50%, transparent); }
.avatar-upload-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }
</style>
