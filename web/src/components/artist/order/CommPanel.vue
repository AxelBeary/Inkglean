<template>
  <!-- plan-node-speech：客户沟通（QQ + 价格小结 + 话术预览 + 复制唤起QQ）
       2026-08-10 拆分批：整卡搬自 OrderDetail.vue，零行为变化 -->
  <el-card class="od-card">
    <template #header>
      <CardHead :title="$t('orderDetail.commTitle')" />
    </template>
    <div class="comm-body">
      <div class="comm-row">
        <span class="comm-label">{{ $t('orderDetail.commPriceSummary', { total: `¥${formatCents(poolFinalCents)}`, paid: `¥${formatCents(poolPaidCents)}`, unpaid: `¥${formatCents(poolRemainingCents)}` }) }}</span>
      </div>
      <div class="comm-speech">
        <span class="comm-speech-text">{{ commSpeechText }}</span>
      </div>
      <el-button
        type="primary" class="comm-copy-btn"
        :disabled="!order.client_qq || !order.speechText"
        :loading="commCopying"
        @click="copySpeechAndOpenQq"
      >
        {{ !order.client_qq ? $t('orderDetail.commNoQq') : $t('orderDetail.commCopyBtn') }}
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import CardHead from '../visual/CardHead.vue'
import { formatCents } from '../../../utils/money'

/** 本卡消费的订单字段（话术 / QQ / 当前节点） */
interface CommOrderLite {
  client_qq?: string | null
  speechText?: string | null
  currentStageId?: number | null
}

const props = defineProps({
  order: { type: Object as PropType<CommOrderLite>, required: true },
  poolFinalCents: { type: Number, default: 0 },
  poolPaidCents: { type: Number, default: 0 },
  poolRemainingCents: { type: Number, default: 0 }
})

const { t } = useI18n()

const commCopying = ref(false)
// R-19: QQ 唤起定时器句柄（1 秒内路由离开时须清理，否则新页面被 tencent:// 跳转拽走）
let qqOpenTimer: number | null = null

/** 话术预览（后端已替换变量；无当前节点话术时提示） */
const commSpeechText = computed(() => {
  const o = props.order
  if (!o) return ''
  if (o.speechText) return o.speechText
  if (o.currentStageId == null) return t('orderDetail.commNoStage')
  return t('orderDetail.commNoSpeech')
})

/** 复制话术 + 1 秒后唤起 QQ */
async function copySpeechAndOpenQq() {
  const o = props.order
  if (!o?.client_qq || !o?.speechText) return
  commCopying.value = true
  try {
    await navigator.clipboard.writeText(o.speechText as string)
    ElMessage.success(t('orderDetail.commCopied'))
    qqOpenTimer = setTimeout(() => {
      window.open(`tencent://message/?uin=${encodeURIComponent(o.client_qq as string)}`, '_self')
    }, 1000)
  } catch {
    // 剪贴板不可用时降级：展示话术文本供手动复制
    ElMessage.warning(o.speechText as string)
  } finally {
    commCopying.value = false
  }
}

onUnmounted(() => {
  // 卸载即清理：清掉后定时器回调不再执行，等效于跳转前再确认组件未卸载
  if (qqOpenTimer) clearTimeout(qqOpenTimer)
})
</script>

<style scoped>
/* ─── plan-node-speech：客户沟通 ─── */
.comm-body { display: flex; flex-direction: column; gap: 10px; }
.comm-row { display: flex; align-items: baseline; gap: 8px; font-size: calc(var(--font-scale, 1) * 14px); }
.comm-label { color: var(--ink2); flex-shrink: 0; }
.comm-value { color: var(--ink); font-weight: 600; }
.comm-speech {
  padding: 10px 14px;
  border-radius: var(--r-m);
  background: var(--hq-t);
  border-left: 3px solid var(--hq);
}
.comm-speech-text {
  font-size: calc(var(--font-scale, 1) * 14px); line-height: 1.7; color: var(--ink);
  white-space: pre-wrap; word-break: break-word;
}
.comm-copy-btn { align-self: flex-start; }
</style>
