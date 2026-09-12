<template>
  <!-- 卡片操作区（R30d 推进 / REQ-013 #7 去交付 / R30b 固定状态主操作 / 详情 / R30d 更多下拉）
       （F-09 巨型文件拆分批·丁：自 QueueBoardList.vue 原样搬入；工作流状态机、在途锁 busyOrderIds 与全部 API
        调用留在父组件，本卡只渲染与上抛事件。单根元素会同时带上父组件的 scopeId，故 .item-actions 作用域样式
        （含 @container / @media 覆盖）留在父组件即可命中，不复制第二份） -->
  <div class="item-actions">
    <!-- R30d: 接入流程的订单 → "推进到下一节点"（替代固定状态按钮） -->
    <el-button
      v-if="!workflowLoadFailed && element.currentStageId != null && canAdvance"
      size="small" type="primary" :loading="busy"
      @click="emit('advance')"
    >
      {{ $t('queue.advanceStage') }}
    </el-button>
    <!-- REQ-013 #7: 工作流订单到达最后节点(done) → "去交付"跳转详情页（交付需上传文件） -->
    <el-button
      v-else-if="element.currentStageId != null && element.status === 'done'"
      size="small" type="success"
      @click="emit('open-deliver')"
    >
      {{ $t('queue.goDeliver') }}
    </el-button>
    <!-- R30b: 未接入流程的订单 → 固定状态主操作外露（Bug 4: 工作流订单不穿透到此按钮） -->
    <el-button
      v-else-if="element.currentStageId == null && nextAction"
      size="small" :loading="busy"
      :type="nextAction.type"
      @click="emit('action', nextAction.command)"
    >
      {{ $t(nextAction.labelKey) }}
    </el-button>
    <el-button size="small" @click="$router.push(`/orders/${element.id}?from=queue`)">{{ $t('common.detail') }}</el-button>
    <el-dropdown trigger="click" @command="(cmd: string | number | object) => emit('action', cmd)">
      <el-button size="small">{{ $t('common.actions') }}</el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="confirmed" v-if="element.status === 'pending' && element.currentStageId == null">{{ $t('queue.confirm') }}</el-dropdown-item>
          <el-dropdown-item command="wip" v-if="element.status === 'confirmed' && element.currentStageId == null">{{ $t('queue.startWip') }}</el-dropdown-item>
          <el-dropdown-item command="done" v-if="['wip','revision'].includes(element.status) && element.currentStageId == null">{{ $t('queue.done') }}</el-dropdown-item>
          <el-dropdown-item command="delivered" v-if="element.status === 'done' && element.currentStageId == null">{{ $t('queue.deliver') }}</el-dropdown-item>
          <el-dropdown-item command="cancelled" divided>{{ $t('queue.cancel') }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

/** 本卡消费的队列行字段（组件私有 Lite 接口，口径同宿主 QueueRow） */
interface QueueCardElementLite {
  id: number
  status: string
  currentStageId?: number | null
}

/** R30b 下一步主操作（宿主 NEXT_ACTION 命中的形状；未命中时为 null，与原逻辑一致不渲染） */
interface NextActionLite {
  command: string
  labelKey: string
  type: 'primary' | 'warning' | 'success'
}

defineProps({
  element: { type: Object as PropType<QueueCardElementLite>, required: true },
  // 工作流节点加载失败：隐藏推进按钮（父组件既有标记）
  workflowLoadFailed: Boolean,
  // 逐订单在途锁（父组件 busyOrderIds.has(element.id)）
  busy: Boolean,
  // 能否推进到下一节点（父组件 canAdvance(element) 结果下发）
  canAdvance: Boolean,
  // 未接入流程订单的下一步主操作（父组件 nextAction(element.status) 结果下发）
  nextAction: { type: Object as PropType<NextActionLite | null>, default: null }
})
const emit = defineEmits(['advance', 'action', 'open-deliver'])
</script>
