<template>
  <!-- ── 联系方式（v0.32: 动态步骤号） ── -->
  <div>
    <h3 class="step-title">{{ t('orderForm.step3Title') }}</h3>

    <!-- QQ号 -->
    <el-form-item :label="t('orderForm.qqLabel')" prop="clientQq">
      <el-input v-model="clientQq" :placeholder="t('orderForm.qqPlaceholder')" />
    </el-form-item>

    <!-- 昵称 -->
    <el-form-item :label="t('orderForm.nameLabel')">
      <el-input v-model="clientName" :placeholder="t('orderForm.namePlaceholder')" />
    </el-form-item>

    <!-- QQ通知（REQ-028 过渡期：通知通道未接通 → 灰置 + 默认不勾 + 明示「开发中」，说明文案与画师录单页同键） -->
    <el-form-item v-if="notifyVisible">
      <div class="notify-block">
        <div class="notify-row">
          <el-checkbox v-model="notifyEnabled" disabled>{{ t('orderForm.notifyLabel') }}</el-checkbox>
          <el-tag type="info" size="small">{{ t('common.notifyDevTag') }}</el-tag>
        </div>
        <p class="notify-hint">{{ t('common.notifyDevHint') }}</p>
      </div>
    </el-form-item>

    <!-- 须知确认（消毒后渲染） -->
    <el-form-item v-if="hasRules" prop="agreed">
      <el-card shadow="never" class="rules-preview">
        <SanitizedRichText :html="sanitizedRules" class="rules-html" />
      </el-card>
      <el-checkbox v-model="agreed" style="margin-top: 8px">
        {{ t('orderForm.agreeLabel') }}
      </el-checkbox>
    </el-form-item>

    <!-- REQ-042: 服务条款/隐私政策同意（首单恒显示，未勾不可提交） -->
    <el-form-item prop="termsAgreed">
      <el-checkbox v-model="termsAgreed" style="margin-top: 8px">
        <span>
          {{ $t('compliance.common.agreePrefix') }}
          <router-link to="/terms" class="terms-link">{{ $t('compliance.common.terms') }}</router-link>
          {{ $t('compliance.common.and') }}
          <router-link to="/privacy" class="terms-link">{{ $t('compliance.common.privacy') }}</router-link>
        </span>
      </el-checkbox>
    </el-form-item>

    <!-- 平台职责声明 -->
    <el-form-item>
      <Disclaimer />
    </el-form-item>

    <div class="step-nav">
      <el-button @click="emit('prev')">{{ t('orderForm.prevStep') }}</el-button>
      <el-button type="primary" @click="emit('submit')">
        {{ t('orderForm.submit') }}
        <template v-if="submitPriceText"> — {{ submitPriceText }}</template>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Disclaimer from '../../../components/Disclaimer.vue'
import SanitizedRichText from '../../../components/shared/SanitizedRichText.vue'

defineProps<{
  /** 画师开启 QQ 通知（artist.notifyEnabled） */
  notifyVisible: boolean
  /** 画师须知非空才渲染确认项（rulesContent 判定） */
  hasRules: boolean
  /** sanitizeHtml 消毒后的须知 HTML */
  sanitizedRules: string
  /** 提交按钮价格后缀（已选尺寸时格式化总价；null 不显示） */
  submitPriceText: string | null
}>()

const emit = defineEmits<{
  (e: 'prev'): void
  /** 提交（父层先校验再弹小票确认） */
  (e: 'submit'): void
}>()

const clientQq = defineModel<string>('clientQq', { default: '' })
const clientName = defineModel<string>('clientName', { default: '' })
/** REQ-028 过渡期：QQ 通知未接通，本项灰置不可勾，默认不勾（通道上线后再放回用户可选） */
const notifyEnabled = defineModel<boolean>('notifyEnabled', { default: false })
const agreed = defineModel<boolean>('agreed', { default: false })
/** REQ-042: 首单同意条款（服务条款/隐私政策） */
const termsAgreed = defineModel<boolean>('termsAgreed', { default: false })

const { t } = useI18n()
</script>

<style scoped>
.step-title {
  font-family: var(--font-display);
  font-size: clamp(18px, 3vw, 22px);
  color: var(--text-primary);
  margin: 0 0 16px;
}
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; }
@media (max-width: 860px) {
  .step-nav { padding-bottom: 64px; }
}

/* REQ-028 过渡期：灰置通知块（徽标 + 说明行；色值取 token，间距落 4px 栅格） */
.notify-block { display: flex; flex-direction: column; gap: 4px; }
.notify-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.notify-hint { margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.6; }

.rules-preview { max-height: 200px; overflow-y: auto; }
.rules-html { line-height: 1.8; color: var(--text-primary); }
.terms-link {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
  margin: 0 4px;
}
</style>
