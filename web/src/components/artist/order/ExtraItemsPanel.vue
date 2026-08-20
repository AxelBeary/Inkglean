<template>
  <!-- SPEC-003: 附加工作项（添加/删除后 final_price_cents 自动重算）+ 改价入口
       2026-08-10 拆分批：整卡+两弹窗搬自 OrderDetail.vue，零行为变化 -->
  <el-card class="od-card">
    <template #header>
      <CardHead :title="$t('orderDetail.extraItemsTitle')">
        <template #extra>
          <span class="extra-count">{{ order.extraItems?.length || 0 }} / 20</span>
        </template>
      </CardHead>
    </template>
    <div v-if="order.extraItems?.length" class="extra-list">
      <div v-for="item in order.extraItems" :key="item.id" class="extra-item">
        <div class="extra-info">
          <span class="extra-name">{{ item.name }}</span>
          <span v-if="item.description" class="extra-desc">{{ item.description }}</span>
        </div>
        <span class="extra-price">¥{{ formatCents(item.price_cents) }}</span>
        <!-- 悬停显示删除（触屏常驻，与备注删除交互一致 C56）；终态不显示 -->
        <el-button
          v-if="!isTerminal"
          class="extra-delete" size="small" circle type="danger"
          :aria-label="$t('orderDetail.extraDelete')"
          :title="$t('orderDetail.extraDelete')"
          @click="deleteExtraItem(item)"
        >
          ✕
        </el-button>
      </div>
    </div>
    <InkEmpty v-else :title="$t('orderDetail.extraEmpty')" />
    <div class="extra-footer">
      <el-button v-if="!isTerminal" size="small" @click="openExtraDialog" :disabled="(order.extraItems?.length ?? 0) >= 20">
        + {{ $t('orderDetail.extraAdd') }}
      </el-button>
      <span v-if="order.final_price_cents != null" class="extra-total">
        {{ $t('orderDetail.extraTotal') }} ¥{{ formatCents(order.final_price_cents) }}
      </span>
      <!-- v0.31 五号方案A：改价按钮（后端 PUT /price 已有，前端首次接通） -->
      <el-button v-if="!isTerminal && order.status !== 'done'" size="small" text type="primary" @click="openPriceDialog">
        {{ $t('orderDetail.priceEditBtn') }}
      </el-button>
    </div>
    <p v-if="order.extraItems?.length" class="extra-auto-hint">{{ $t('orderDetail.extraAutoHint') }}</p>
  </el-card>

  <!-- SPEC-003: 添加附加项弹窗（名称必填，说明可选，金额可选——空则 0） -->
  <el-dialog v-model="extraDialogVisible" :title="$t('orderDetail.extraDialogTitle')" width="420px">
    <el-form label-position="top">
      <el-form-item :label="$t('orderDetail.extraNameLabel')" required>
        <el-input v-model="extraForm.name" :placeholder="$t('orderDetail.extraNamePlaceholder')" maxlength="100" show-word-limit />
      </el-form-item>
      <el-form-item :label="$t('orderDetail.extraDescLabel')">
        <el-input v-model="extraForm.description" type="textarea" :rows="2" :placeholder="$t('orderDetail.extraDescPlaceholder')" maxlength="500" show-word-limit />
      </el-form-item>
      <el-form-item :label="$t('orderDetail.extraPriceLabel')">
        <el-input-number v-model="extraForm.priceYuan" :min="-999999.99" :max="999999.99" :precision="2" :step="10" controls-position="right" style="width: 200px" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="extraDialogVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" @click="submitExtraItem" :disabled="!extraForm.name.trim()" :loading="extraSubmitting">{{ $t('common.confirm') }}</el-button>
    </template>
  </el-dialog>

  <!-- v0.31 五号方案A：改价弹窗（调用已有 PUT /api/artist/orders/:id/price） -->
  <el-dialog v-model="priceDialogVisible" :title="$t('orderDetail.priceDialogTitle')" width="400px">
    <el-form label-position="top">
      <el-form-item :label="$t('orderDetail.priceNewLabel')" required>
        <el-input-number
          v-model="priceForm.priceYuan"
          :min="0.01" :max="999999.99" :precision="2" :step="50"
          controls-position="right" style="width: 100%"
          :placeholder="$t('orderDetail.pricePlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="$t('orderDetail.priceNoteLabel')" required>
        <el-input v-model="priceForm.note" :placeholder="$t('orderDetail.priceNotePlaceholder')" maxlength="200" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="priceDialogVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" @click="submitPriceChange" :disabled="!priceForm.priceYuan || priceForm.priceYuan <= 0 || !priceForm.note.trim()" :loading="priceSubmitting">{{ $t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import CardHead from '../visual/CardHead.vue'
import InkEmpty from '../visual/InkEmpty.vue'
import { artistApi } from '../../../api/index'
import type { ApiError } from '../../../api/index'
import { formatCents } from '../../../utils/money'

/** 附加项行（本卡消费字段） */
interface ExtraItemRow {
  id: number
  name: string
  description?: string | null
  price_cents: number
}

/** 本卡消费的订单字段（附加项 + 金额/状态/乐观锁） */
interface ExtraOrderLite {
  extraItems?: ExtraItemRow[] | null
  final_price_cents?: number | null
  total_price_cents?: number | null
  status?: string
  version?: number | null
}

const props = defineProps({
  order: { type: Object as PropType<ExtraOrderLite>, required: true },
  isTerminal: { type: Boolean, default: false },
  routeId: { type: [String, Number], required: true }
})
const emit = defineEmits(['order-updated', 'conflict'])

const { t } = useI18n()

// ─── SPEC-003: 附加工作项（添加/删除后后端返回完整订单，final_price_cents 已重算） ───
const extraDialogVisible = ref(false)
const extraSubmitting = ref(false)
const extraForm = ref({ name: '', description: '', priceYuan: 0 })

function openExtraDialog() {
  extraForm.value = { name: '', description: '', priceYuan: 0 }
  extraDialogVisible.value = true
}

async function submitExtraItem() {
  if (!extraForm.value.name.trim()) return
  extraSubmitting.value = true
  try {
    const payload = {
      name: extraForm.value.name.trim(),
      description: extraForm.value.description.trim() || null,
      priceCents: Math.round((extraForm.value.priceYuan || 0) * 100)
    }
    emit('order-updated', await artistApi.addExtraItem(props.routeId as number, payload))
    extraDialogVisible.value = false
    ElMessage.success(t('orderDetail.extraAdded'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    extraSubmitting.value = false
  }
}

async function deleteExtraItem(item: ExtraItemRow) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.extraDeleteConfirm', { name: item.name }),
      t('orderDetail.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    emit('order-updated', await artistApi.deleteExtraItem(props.routeId as number, item.id))
    ElMessage.success(t('orderDetail.extraDeleted'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

// ─── v0.31 五号方案A：改价（接通已有 PUT /price API） ───
const priceDialogVisible = ref(false)
const priceSubmitting = ref(false)
const priceForm = ref<{ priceYuan: number | null; note: string }>({ priceYuan: null, note: '' })

function openPriceDialog() {
  const currentCents = props.order?.final_price_cents ?? props.order?.total_price_cents ?? 0
  priceForm.value = { priceYuan: currentCents > 0 ? currentCents / 100 : null, note: '' }
  priceDialogVisible.value = true
}

async function submitPriceChange() {
  const cents = Math.round((priceForm.value.priceYuan || 0) * 100)
  if (cents <= 0) return
  priceSubmitting.value = true
  try {
    // 815 审计 P1-3：乐观锁接线——改价携带当前 version，双开旧快照写入会被 409 拦下
    const versionOpt = props.order?.version != null ? { version: props.order.version } : {}
    emit('order-updated', await artistApi.updatePrice(props.routeId as number, {
      finalPriceCents: cents,
      quoteSnapshot: priceForm.value.note.trim() || null,
      ...versionOpt
    }))
    priceDialogVisible.value = false
    ElMessage.success(t('orderDetail.priceUpdated'))
  } catch (err) {
    // 815 审计 P1-3：冲突不关弹窗，通知父组件重拉订单后用户可重试
    if ((err as ApiError)?.code === 'ORDER_CONFLICT') {
      ElMessage.warning(t('common.orderConflict'))
      emit('conflict')
    } else {
      ElMessage.error((err as Error).message)
    }
  } finally {
    priceSubmitting.value = false
  }
}
</script>

<style scoped>
/* ─── SPEC-003: 附加工作项 ─── */
.extra-count { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }
.extra-list { display: flex; flex-direction: column; gap: 4px; }
.extra-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: var(--r-m);
  transition: background var(--dur-fast);
}
.extra-item:hover { background: var(--paper2); }
.extra-info { flex: 1; min-width: 0; }
.extra-name { font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink); }
.extra-desc { display: block; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin-top: 2px; }
/* 金额等宽（REQ §二：金额右对齐等宽字体） */
.extra-price { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); flex-shrink: 0; font-variant-numeric: tabular-nums; }
/* 悬停显示删除（触屏常驻，与 .tl-delete 交互一致 C56） */
.extra-delete { opacity: 0; transition: opacity var(--dur-fast); flex-shrink: 0; }
.extra-item:hover .extra-delete { opacity: 1; }
@media (hover: none) { .extra-delete { opacity: 1; } }
.extra-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.extra-total { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.extra-total strong { color: var(--ink); font-family: var(--f-d); }
.extra-auto-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-top: 8px; }
</style>
