<template>
  <el-page-header @back="goBack" :title="backTitle" :content="order ? `${$t('orderDetail.orderNo')}${order.order_no}` : ''" />

  <div v-if="order" class="order-detail">
    <!-- 基本信息（v0.38: CardHead 朱砂 mark 卡头） -->
    <el-card class="od-card od-head-info">
      <template #header>
        <CardHead :title="$t('orderDetail.orderInfo')">
          <template #extra>
            <!-- 818-D: 再来一单（终态/非终态订单均可用，回填选项弹窗） -->
            <el-button size="small" type="primary" plain @click="openReorderDialog">
              {{ $t('orderDetail.reorderBtn') }}
            </el-button>
            <el-tag :type="statusType(order.status)">{{ $t(`common.orderStatus.${order.status}`) }}</el-tag>
          </template>
        </CardHead>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item :label="$t('orderDetail.colOrderNo')">
          <span class="od-order-no">{{ order.order_no }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('orderDetail.colType')">{{ order.tier_name || $t('common.custom') }}</el-descriptions-item>
        <el-descriptions-item :label="$t('orderDetail.colQq')">
          <span class="client-qq-row">
            <span>{{ order.client_qq }}</span>
            <!-- R58-6: 客户 QQ 跳转 + 复制 -->
            <el-button size="small" text type="primary" @click="jumpToQq(order.client_qq)">{{ $t('orderDetail.jumpQq') }}</el-button>
            <el-button size="small" text @click="copyQq(order.client_qq)">{{ $t('orderDetail.copyQq') }}</el-button>
            <!-- F1 围剿：补发客户追踪链接（重新生成令牌，旧链接立即失效） -->
            <el-button size="small" text type="primary" :loading="regeneratingToken" @click="regenerateAndCopyLink">
              {{ $t('orderDetail.copyTrackLink') }}
            </el-button>
          </span>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('orderDetail.colName')">{{ order.client_name || '-' }}</el-descriptions-item>
        <el-descriptions-item :label="$t('orderDetail.colPriority')">
          <!-- R17: 优先级分段按钮（红/黄/绿，点击即保存） -->
          <el-radio-group v-model="order.priority" size="small" class="priority-group" @change="changePriority">
            <el-radio-button value="high" class="prio-high">{{ $t('common.priority.high') }}</el-radio-button>
            <el-radio-button value="medium" class="prio-medium">{{ $t('common.priority.medium') }}</el-radio-button>
            <el-radio-button value="low" class="prio-low">{{ $t('common.priority.low') }}</el-radio-button>
          </el-radio-group>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('orderDetail.colSource')">{{ order.source === 'self' ? $t('common.source.clientSelf') : $t('common.source.manualEntry') }}</el-descriptions-item>
        <el-descriptions-item :label="$t('orderDetail.colTime')" :span="2">{{ formatDate(order.created_at) }}</el-descriptions-item>
        <el-descriptions-item :label="$t('orderDetail.colDesc')" :span="2">{{ order.description || $t('common.none') }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- v0.38: 日期卡二合一（REQ-026 §四）——开工日/截稿日两字段一卡，即时保存逻辑不变（changeStartDate/changeDeadline），
           卡头右侧剩余天数 chip：剩 N 天(花青) / 今天截稿(藤黄) / 逾期 N 天(朱砂) -->
    <el-card class="od-card date-card od-head-date">
      <template #header>
        <CardHead :title="$t('orderDetail.dateCardTitle')">
          <template #extra>
            <StatusChip v-if="deadlineChip" :type="deadlineChip.type">{{ deadlineChip.text }}</StatusChip>
          </template>
        </CardHead>
      </template>
      <div class="date-card-body">
        <!-- v0.26 B: 开工日（date-picker，可清除，即时保存 + 自动填截稿日） -->
        <div class="date-field">
          <span class="date-field-label">{{ $t('orderDetail.colStartDate') }}</span>
          <el-date-picker
            v-model="startDatePicker" type="date" value-format="YYYY-MM-DD"
            :placeholder="$t('orderDetail.startDatePlaceholder')"
            :disabled-date="disableStartDateDate"
            clearable size="small" style="width: 170px"
            @change="changeStartDate"
          />
        </div>
        <!-- R51: 截稿日（date-picker，可清除，即时保存） -->
        <div class="date-field">
          <span class="date-field-label">{{ $t('orderDetail.colDeadline') }}</span>
          <el-date-picker
            v-model="deadlinePicker" type="date" value-format="YYYY-MM-DD"
            :placeholder="$t('orderDetail.deadlinePlaceholder')"
            :disabled-date="disableDeadlineDate"
            clearable size="small" style="width: 170px"
            @change="changeDeadline"
          />
        </div>
      </div>
      <p class="date-card-note">{{ $t('orderDetail.dateSyncNote') }}</p>
    </el-card>

    <!-- v129: 宽屏双列——主列（进度/图库/备注/增项/交付）与侧列（修改记录/收款/沟通/日志），窄屏回落单列 -->
    <div class="od-main">
      <!-- R40: 活动时间线（状态区 + 备注区合并，C54 展示层合并；操作条保持独立不合并） -->
      <el-card class="od-card">
        <template #header>
          <CardHead :title="$t('orderDetail.activityTitle')">
            <template #extra>
              <!-- 关闭跟踪属设置型操作，保留在卡头（状态推进操作收敛到下方操作条） -->
              <el-button v-if="hasWorkflow" text size="small" type="info" @click="turnOffStageTracking">{{ $t('orderDetail.stageOff') }}</el-button>
            </template>
          </CardHead>
        </template>

        <!-- 终态：只读横幅，无操作 -->
        <div v-if="isTerminal" class="status-banner" :class="`status-banner--${order.status}`">
          <span class="status-banner-text">
            {{ $t(`common.orderStatus.${order.status}`) }}
            <template v-if="order.status === 'delivered' && order.completed_at"> · {{ $t('orderDetail.completedAt', { time: formatDate(order.completed_at) }) }}</template>
          </span>
        </div>

        <!-- 有工作流：工作流进度条为唯一状态展示（C52：固定状态条隐藏） -->
        <template v-else-if="hasWorkflow">
          <!-- M-11（审计 260830）: 工作流节点加载失败——明示错误条 + 重试，替代原先静默吞掉后按钮无声消失
               （对齐 QueueBoardList workflowLoadFailed 模式）；进度显示不受影响（后端 stageProgress 兜底） -->
          <div v-if="workflowLoadFailed" class="workflow-load-failed">
            <span class="workflow-load-failed-text">{{ $t('orderDetail.workflowLoadFailed') }}</span>
            <el-button size="small" type="warning" plain @click="loadWorkflowStages">{{ $t('orderDetail.workflowLoadFailedRetry') }}</el-button>
          </div>
          <!-- E10: 节点推进时间线纸墨化——竖向淡墨线 + 墨点（vertical），数据/交互不变 -->
          <OrderTimeline vertical :stages="workflowStages" :current-stage-id="order.currentStageId" />
          <p class="stage-progress-text">
            {{ $t('orderDetail.stageProgress', { current: stageProgress.current, total: stageProgress.total }) }}
            <span v-if="order.status === 'revision'" class="stage-revision-mark">↩ {{ $t('orderDetail.stageRevision') }}</span>
          </p>
          <p class="status-last-active">{{ $t('orderDetail.lastActivity', { time: formatDate(order.updated_at) }) }}</p>
        </template>

        <!-- 无工作流：固定状态兜底 + 上下文信息 + 启用跟踪引导（C53） -->
        <template v-else>
          <div class="status-fallback">
            <el-tag :type="statusType(order.status)" size="large">{{ $t(`common.orderStatus.${order.status}`) }}</el-tag>
            <div class="status-context">
              <span>{{ $t('orderDetail.lastActivity', { time: formatDate(order.updated_at) }) }}</span>
              <span>{{ $t('orderDetail.noteCount', { n: order.notes?.length || 0 }) }}</span>
              <span>{{ $t('orderDetail.refCount', { n: order.references?.length || 0 }) }}</span>
            </div>
          </div>
          <div class="track-on-hint">
            <span class="track-on-hint-text">{{ $t('orderDetail.enableTrackingHint') }}</span>
            <el-button size="small" type="primary" plain :loading="trackOnLoading" @click="enableTracking">{{ $t('orderDetail.enableTracking') }}</el-button>
          </div>
        </template>
      </el-card>

      <!-- v0.31 F5 + REQ-025 二阶段: 待收横幅——主信息订单级总待收(remainingCents=总价−已收)，
           副信息当前节点（第一个 remaining>0 的节点，无节点订单则只显示总额）；点击跳转收款区 -->
      <div
        v-if="!isTerminal && remainingCents > 0"
        class="next-due-banner"
        role="button" tabindex="0"
        :aria-label="$t('orderDetail.totalDueLabel', { amount: `¥${formatCents(remainingCents)}` })"
        @click="scrollToPayment"
        @keydown.enter.prevent="scrollToPayment"
        @keydown.space.prevent="scrollToPayment"
      >
        <span class="next-due-text">
          {{ $t('orderDetail.totalDueLabel', { amount: `¥${formatCents(remainingCents)}` }) }}
        </span>
        <span v-if="nextDueInstallment" class="next-due-sub">
          {{ $t('orderDetail.currentDueSuffix', { name: nextDueInstallment.name, amount: `¥${formatCents(nextDueInstallment.remainingCents)}` }) }}
        </span>
        <span class="next-due-arrow">→</span>
      </div>

      <!-- R39 方案B：操作条（固定位置——不随状态区内容跳动，画师永远知道按钮在哪） -->
      <el-card v-if="!isTerminal" class="action-bar-card">
        <!-- 取消订单：滑块确认行（R30e，C59 高代价操作用滑块） -->
        <div v-if="slideCancelActive" class="slide-confirm-row">
          <div class="slide-confirm">
            <div class="slide-confirm-fill" :style="{ width: `calc(${slideCancelProgress} * 100%)` }"></div>
            <span class="slide-confirm-label">{{ $t('orderDetail.slideToCancel') }}</span>
            <div
              class="slide-confirm-thumb"
              :style="{ left: `calc(2px + ${slideCancelProgress} * (100% - 40px))` }"
              @pointerdown="handleSlideStart"
              @pointermove="handleSlideMove"
              @pointerup="handleSlideEnd"
              @pointercancel="closeSlideCancel"
            >
              →
            </div>
          </div>
          <el-button text size="small" :aria-label="$t('common.close')" @click="closeSlideCancel">✕</el-button>
          <el-button text size="small" type="danger" :disabled="cancelSubmitting" @click="confirmCancelOrder">
            {{ $t('orderDetail.confirmCancel') }}
          </el-button>
        </div>

        <!-- 常规操作按钮 -->
        <div v-else class="action-bar">
          <!-- 有工作流：推进 / 打回 / 交付（方案 B：done 状态补交付入口，修复卡死）；T3: 飞行中本按钮 loading、兄弟按钮 disabled -->
          <template v-if="hasWorkflow">
            <el-button v-if="canAdvanceStage" type="primary" :loading="statusAction === 'advance'" :disabled="statusAction !== '' && statusAction !== 'advance'" @click="advanceStage">
              {{ $t('orderDetail.advanceTo') }}{{ nextStageName }}
            </el-button>
            <el-button v-if="canBackStage && order.status !== 'done'" type="warning" plain :loading="statusAction === 'back'" :disabled="statusAction !== '' && statusAction !== 'back'" @click="backStage">{{ $t('orderDetail.stageBack') }}</el-button>
            <el-button v-if="order.status === 'done'" type="success" @click="openDeliverDialog">{{ $t('orderDetail.uploadDeliver') }}</el-button>
          </template>
          <!-- 无工作流：固定状态按钮（原逻辑不变，仅位置收敛）；T3: 飞行中目标按钮 loading，其余 disabled -->
          <template v-else>
            <el-button v-if="order.status === 'pending'" type="primary" :loading="statusAction === 'confirmed'" :disabled="statusAction !== '' && statusAction !== 'confirmed'" @click="changeStatus('confirmed')">{{ $t('orderDetail.confirmOrder') }}</el-button>
            <el-button v-if="order.status === 'confirmed'" type="warning" :loading="statusAction === 'wip'" :disabled="statusAction !== '' && statusAction !== 'wip'" @click="changeStatus('wip')">{{ $t('orderDetail.startWip') }}</el-button>
            <!-- v129: revision 态下保留入口——「需修改」可反复点击，每点一轮计一次修改（后端 revision→revision 合法留痕） -->
            <el-button v-if="['wip', 'revision'].includes(order.status)" :loading="statusAction === 'revision'" :disabled="statusAction !== '' && statusAction !== 'revision'" @click="changeStatus('revision')">{{ $t('orderDetail.needRevision') }}</el-button>
            <el-button v-if="['wip','revision'].includes(order.status)" type="success" :loading="statusAction === 'done'" :disabled="statusAction !== '' && statusAction !== 'done'" @click="changeStatus('done')">{{ $t('orderDetail.markDone') }}</el-button>
            <el-button v-if="order.status === 'done'" type="success" @click="openDeliverDialog">{{ $t('orderDetail.uploadDeliver') }}</el-button>
          </template>
          <!-- 取消订单：固定在右侧 -->
          <el-button type="danger" plain class="action-cancel" @click="openSlideCancel">{{ $t('orderDetail.cancelOrder') }}</el-button>
        </div>
      </el-card>

      <!-- R18: 订单图库（参考图 + 画师加图，点击设焦点；卡内容已拆 GalleryPanel，v0.40 拆分） -->
      <GalleryPanel
        :order="order"
        :gallery-uploading="galleryUploading"
        v-model:is-gallery-drag-over="isGalleryDragOver"
        :paste-error="pasteError"
        @open-viewer="openGalleryViewer"
        @refresh="refreshNow"
        @select-focus="selectFocusImage"
        @delete="deleteReference"
        @dragenter="guardDragEnter"
        @dragover="guardDragOver"
        @drop="handleGalleryDrop"
        @file-select="handleGalleryFileSelect"
      />

      <!-- R40: 备注时间线（卡内容已拆 NotesPanel，2026-08-10 拆分） -->
      <NotesPanel
        ref="notesPanelRef"
        :order="order"
        :route-id="routeId"
        :guard-drop="guardDrop"
        :guard-drag-enter="guardDragEnter"
        :guard-drag-over="guardDragOver"
        :validate-image-file="validateImageFile"
        @order-updated="onOrderUpdated"
        @refresh="refreshNow"
      />

      <!-- SPEC-003: 附加工作项 + 改价（卡内容已拆 ExtraItemsPanel，2026-08-10 拆分） -->
      <ExtraItemsPanel
        :order="extraPanelOrder"
        :is-terminal="isTerminal"
        :route-id="routeId"
        @order-updated="onOrderUpdated"
        @conflict="loadOrder"
      />

      <!-- 交付文件 -->
      <el-card class="od-card" v-if="order.deliverables?.length">
        <template #header>
          <CardHead :title="$t('orderDetail.deliverFiles')">
            <template #extra>
              <!-- REQ-022 F1: 发布为作品入口（仅 delivered 显示；done=半终态无入口） -->
              <el-button
                v-if="order.status === 'delivered'"
                size="small" type="primary" plain
                @click="publishShareRef?.openPublish()"
              >
                {{ $t('orderDetail.publishArtwork') }}
              </el-button>
              <!-- REQ-031 B1: 完稿分享（delivered；F2 域名校验复用 linkValidation） -->
              <el-button
                v-if="order.status === 'delivered'"
                size="small" type="primary" plain
                @click="publishShareRef?.openShare()"
              >
                {{ $t('orderDetail.shareBtn') }}
              </el-button>
            </template>
          </CardHead>
        </template>
        <div v-for="d in order.deliverables" :key="d.id" class="file-item">
          <span>{{ d.original_name }}</span>
          <span>
            <!-- 815 拍板 #4：一次性下载锁定状态 + 画师再许可 -->
            <el-tag v-if="d.download_locked === 1" type="info" size="small" style="margin-right: 8px">{{ $t('orderDetail.deliverableLocked') }}</el-tag>
            <el-button v-if="d.download_locked === 1" size="small" :loading="repermittingId === d.id" @click="repermitDeliverable(d)">{{ $t('orderDetail.deliverableRepermit') }}</el-button>
            <el-button size="small" @click="openFile(d.url)">{{ $t('common.download') }}</el-button>
          </span>
        </div>
      </el-card>
    </div><!-- /.od-main -->

    <div class="od-side">
      <!-- v128: 修改记录（手动修改+打回均计一次，口径用户拍板；从操作流水推导，无记录不显卡） -->
      <el-card v-if="revisionRecords.length > 0" class="od-card">
        <template #header>
          <CardHead :title="$t('orderDetail.revisionTitle')">
            <template #extra>
              <StatusChip type="pend">{{ $t('orderDetail.revisionTotal', { n: revisionRecords.length }) }}</StatusChip>
            </template>
          </CardHead>
        </template>
        <ul class="revision-list">
          <li v-for="(r, i) in revisionRecords" :key="i" class="revision-row">
            <span class="revision-icon" :class="`revision-icon--${r.type}`" aria-hidden="true">{{ r.type === 'rollback' ? '↩' : '✎' }}</span>
            <span class="revision-type">{{ r.type === 'rollback' ? $t('orderDetail.revisionRollback') : $t('orderDetail.revisionManual') }}</span>
            <span v-if="r.type === 'rollback' && r.fromStage" class="revision-stages">「{{ r.fromStage }}」→「{{ r.toStage }}」</span>
            <span class="revision-time">{{ formatDate(r.at) }}</span>
          </li>
        </ul>
      </el-card>

      <!-- B7: 额度池收款记录（卡内容已拆 PaymentPanel，v0.40 拆分；v129 移入侧列） -->
      <PaymentPanel
        :payments="payments"
        :payments-loading="paymentsLoading"
        :payments-error="paymentsError"
        :pool-paid-cents="poolPaidCents"
        :pool-final-cents="poolFinalCents"
        :pool-remaining-cents="poolRemainingCents"
        :pool-overpaid-cents="poolOverpaidCents"
        :pool-percent="poolPercent"
        :installment-refs="installmentRefs"
        :is-terminal="isTerminal"
        :revoke-submitting="paymentSubmitting"
        @open-pay="payDialogVisible = true"
        @revoke="handleRevokePayment"
        @collect="openNodePayDialog"
        @retry-payments="loadPayments(routeId)"
      />

      <!-- plan-node-speech：客户沟通（卡内容已拆 CommPanel，2026-08-10 拆分；v129 移入侧列） -->
      <CommPanel
        :order="order"
        :pool-final-cents="poolFinalCents"
        :pool-paid-cents="poolPaidCents"
        :pool-remaining-cents="poolRemainingCents"
      />

      <!-- v0.31 REQ-021 F1: 操作记录（卡内容已拆 LogPanel，2026-08-10 拆分；v129 移入侧列） -->
      <LogPanel :route-id="routeId" />
    </div><!-- /.od-side -->
  </div>

  <!-- REQ-037 F1: 首载失败错误态（自助重试，不白屏死局） -->
  <div v-else-if="loadError" class="od-load-failed">
    <p>{{ $t('orderDetail.loadFailed') }}</p>
    <el-button type="primary" @click="loadOrder">{{ $t('orderDetail.loadFailedRetry') }}</el-button>
  </div>
  <!-- REQ-037 F2: 首载骨架（替代白屏） -->
  <HySkeleton v-else count="4" />

  <!-- 交付弹窗（方案 B：含无文件交付，DeliverDialog 复用） -->
  <DeliverDialog v-model="showDeliver" :order-id="routeId" :order-version="order?.version" @delivered="onOrderUpdated" @conflict="loadOrder" />

  <!-- 815 拍板 #1：取消后 5 秒撤销提示 -->
  <CancelUndoToast
    v-if="cancelUndo.visible"
    :label="cancelUndo.label"
    :window-ms="cancelUndo.windowMs"
    @undo="onUndoCancel"
    @expire="cancelUndo.visible = false"
  />

  <!-- REQ-022 F1 + REQ-031 B1: 发布为作品/完稿分享弹窗（已拆 PublishShareDialogs，2026-08-10 拆分） -->
  <PublishShareDialogs ref="publishShareRef" :order="publishShareOrder" :route-id="routeId" />

  <!-- B7: 记录收款弹窗 -->
  <el-dialog v-model="payDialogVisible" :title="$t('orderDetail.payDialogTitle')" width="380px">
    <el-form label-position="top">
      <el-form-item :label="$t('orderDetail.payAmountLabel')" required>
        <!-- P1: 去掉 :min/:max 硬钳制——EP 对超范围输入 blur 时静默清空（"卡死"根因）；
               改由 submitPayment 提交时校验（后端 addPayment 规则的子集）。P2: 正数多收合法，无上限 -->
        <el-input-number
          v-model="payForm.amountYuan"
          :precision="2" :step="50"
          controls-position="right" style="width: 100%"
          :placeholder="$t('orderDetail.payAmountPlaceholder')"
        />
      </el-form-item>
      <!-- REQ-025 二阶段: 负数（退款/撤销）时备注 label 切换为「退款原因（必填）」——
             与 submitPayment 的强制校验一致，消除「可选但必填」的文案误导 -->
      <el-form-item :label="(payForm.amountYuan || 0) < 0 ? $t('orderDetail.payRefundNoteLabel') : $t('orderDetail.payNoteLabel')">
        <el-input v-model="payForm.note" :placeholder="$t('orderDetail.payNotePlaceholder')" maxlength="100" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="payDialogVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" @click="submitPayment" :disabled="!payForm.amountYuan" :loading="paymentSubmitting">{{ $t('common.confirm') }}</el-button>
    </template>
  </el-dialog>

  <!-- SPEC-003 附加项弹窗 + 改价弹窗已随 ExtraItemsPanel 拆出（2026-08-10） -->

  <!-- v0.31 F4: 节点快捷收款弹窗 -->
  <el-dialog v-model="nodePayDialogVisible" :title="$t('orderDetail.payNodeTitle', { name: nodePayTarget?.name || '' })" width="380px">
    <el-form label-position="top">
      <el-form-item :label="$t('orderDetail.payAmountLabel')" required>
        <el-input-number
          v-model="nodePayForm.amountYuan"
          :min="0.01" :precision="2" :step="50"
          controls-position="right" style="width: 100%"
        />
      </el-form-item>
      <el-form-item :label="$t('orderDetail.payNoteLabel')">
        <el-input v-model="nodePayForm.note" :placeholder="$t('orderDetail.payNotePlaceholder')" maxlength="100" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="nodePayDialogVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" @click="submitNodePayment" :disabled="!nodePayForm.amountYuan || nodePayForm.amountYuan <= 0" :loading="paymentSubmitting">{{ $t('common.confirm') }}</el-button>
    </template>
  </el-dialog>

  <!-- R18: 图库大图预览（悬停放大镜打开，支持左右切换） -->
  <el-image-viewer
    v-if="galleryViewerVisible"
    :url-list="(order?.references?.map(r => r.url) || []) as string[]"
    :initial-index="galleryViewerIndex"
    @close="galleryViewerVisible = false"
  />

  <!-- 818-D + 819-J: 再来一单回填选项对话框（QQ/昵称必带不设选项；参考图按勾选路径复用） -->
  <el-dialog v-model="reorderDialogVisible" :title="$t('orderDetail.reorderDialogTitle')" width="420px">
    <p class="reorder-dialog-hint">{{ $t('orderDetail.reorderDialogHint') }}</p>
    <el-checkbox-group v-model="reorderFill" class="reorder-fill-group">
      <el-checkbox value="desc">{{ $t('orderDetail.reorderFillDesc') }}</el-checkbox>
      <el-checkbox value="style">{{ $t('orderDetail.reorderFillStyle') }}</el-checkbox>
      <el-checkbox value="note">{{ $t('orderDetail.reorderFillNote') }}</el-checkbox>
      <!-- 819-J 二期: 参考图（勾选后源单参考图路径引用复用，不重复上传） -->
      <el-checkbox value="refs">{{ $t('orderDetail.reorderFillRefs') }}</el-checkbox>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="reorderDialogVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirmReorder">{{ $t('orderDetail.reorderConfirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { artistApi } from '../../api/index'
import type { EnrichedOrderDetail, OrderPriority } from '../../api/types'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import OrderTimeline from '../../components/shared/OrderTimeline.vue'
import HySkeleton from '../../components/shared/HySkeleton.vue'
import DeliverDialog from '../../components/artist/DeliverDialog.vue'
import CancelUndoToast from '../../components/artist/CancelUndoToast.vue'
import PaymentPanel from '../../components/artist/order/PaymentPanel.vue'
import GalleryPanel from '../../components/artist/order/GalleryPanel.vue'
// 2026-08-10 拆分批：五面板抽出（零行为变化）
import LogPanel from '../../components/artist/order/LogPanel.vue'
import CommPanel from '../../components/artist/order/CommPanel.vue'
import ExtraItemsPanel from '../../components/artist/order/ExtraItemsPanel.vue'
import NotesPanel from '../../components/artist/order/NotesPanel.vue'
import PublishShareDialogs from '../../components/artist/order/PublishShareDialogs.vue'
// v0.38: 统一视觉组件（REQ-026 §二）
import CardHead from '../../components/artist/visual/CardHead.vue'
import StatusChip from '../../components/artist/visual/StatusChip.vue'
import { usePasteUpload } from '../../composables/usePasteUpload'
import { useSignatureRefresh } from '../../composables/useSignatureRefresh'
import { formatDateTime } from '../../utils/datetime'
import { formatCents } from '../../utils/money'
import { MAX_IMAGE_COUNT } from '../../constants/upload'
import { subscribeReconnect } from '../../utils/reconnect'
// v0.40 瘦身批：script 4 区块抽 composable（零行为变化）
import { useOrderWorkflow } from '../../composables/useOrderWorkflow'
import { useOrderGallery } from '../../composables/useOrderGallery'
import { useOrderDeadline } from '../../composables/useOrderDeadline'
import { useOrderPaymentPanel } from '../../composables/useOrderPaymentPanel'
// 2026-08-20 二轮回胀拆分：页面操作集抽 composable（纯搬移零行为变化，模板/DOM 零改动）
import { useOrderActions } from '../../composables/useOrderActions'
import type { OrderDetailState, ApiErrShape } from '../../composables/useOrderActions'

// 运行时附带字段类型（DetailReferenceRow/OrderDetailState/ApiErrShape 等）已随操作集迁入 useOrderActions（二轮拆分）
// 面板 Lite 类型为组件私有接口（字段全可选，口径与本页面运行时对象不完全重合），经 unknown 中转断言为空结构传入，运行时引用不变
const extraPanelOrder = computed(() => order.value as unknown as {})
const publishShareOrder = computed(() => order.value as unknown as {})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const routeId = route.params.id as unknown as number
const order = ref<OrderDetailState | null>(null)
// v128: 修改记录（后端从操作流水推导，随所有单订单端点下发，order.value 覆盖不丢）
const revisionRecords = computed(() => order.value?.revisionRecords ?? [])
// REQ-037 F1: 加载失败错误态（对齐 Settings profileLoadFailed 模式：页面内横幅+重试，不再白屏死局）
const loadError = ref(false)
const prevPriority = ref<OrderPriority | null>(null)
// 拆分批面板 ref：备注粘贴焦点路由 + 发布/分享弹窗开关
const notesPanelRef = ref<InstanceType<typeof NotesPanel> | null>(null)
const publishShareRef = ref<InstanceType<typeof PublishShareDialogs> | null>(null)
// 交付弹窗显隐（方案 B：文件上传/校验逻辑已迁入 DeliverDialog 组件）
const showDeliver = ref(false)

// 返回来源页：排期看板进来回排期，仪表盘进来回仪表盘，订单列表进来回列表，直接访问则默认回列表
const fromSource = route.query.from // 'queue' | 'dashboard' | undefined
const backTitle = computed(() => {
  if (fromSource === 'queue') return t('orderDetail.backToQueue')
  if (fromSource === 'dashboard') return t('orderDetail.backToDashboard')
  return t('orderDetail.backToList')
})
function goBack() {
  if (fromSource === 'queue') router.push('/queue')
  else if (fromSource === 'dashboard') router.push('/dashboard')
  else router.push('/orders')
}

import { statusType } from '../../constants/order'

function formatDate(str: string | null | undefined) {
  return formatDateTime(str || '')
}

// ─── M-9（审计 260830）: 订单统一写入口——响应 version 单调不回退，旧快照拒收 ───
// 工作流推进/打回/状态变更/日期/取消/再许可等写入点的写回原为直接 order.value = await ...，
// 与 loadOrder 并发时晚到的旧快照会覆盖已确认的新状态、version 回退 → 诱发 409 ORDER_CONFLICT 误报
// （statusAction 互斥锁只防按钮连点，管不住跨路并发）；所有整体替换 order 的写入收敛到这里：
// 响应 version >= 当前才赋值（首载无基准直接赋）；返回值表示是否真正写入，调用方据此同步基线
function applyOrder(next: OrderDetailState | null): boolean {
  if (next && order.value && next.version < order.value.version) return false
  order.value = next
  return true
}

// ─── R-14: loadOrder 竞态守卫 ───
// 收款/图库/改价等十余处并发触发刷新，晚到的旧快照会让已收金额/状态显示倒退；
// 请求发出取号，响应晚于最新序号即丢弃（同款 seq 模式，对齐 useOrderForm.doStyleCalc）
// M-9: 写回亦经 applyOrder 双保险——序号守卫防同路晚到旧快照，version 单调守卫防跨路旧快照
let loadOrderSeq = 0
async function loadOrder() {
  const mySeq = ++loadOrderSeq
  try {
    loadError.value = false
    const data = await artistApi.getOrder(routeId)
    if (mySeq !== loadOrderSeq) return
    // 真正写入才同步优先级回滚基线（旧快照被拒收时不得拖着 prevPriority 一起倒退）
    if (applyOrder(data)) prevPriority.value = data?.priority || 'medium'
  } catch (err) {
    if (mySeq !== loadOrderSeq) return
    if (order.value) {
      ElMessage.error((err as ApiErrShape).message)
    } else {
      loadError.value = true // F1: 首载失败 → 页内错误态+重试入口
    }
  }
}

// ─── 瘦身批装配（v0.40）：4 区块抽 composable，零行为变化 ───
const statusAction = ref('')  // 自原大文件提前，workflow/changeStatus 共享
const { hasWorkflow, isTerminal, workflowStages, stageProgress, nextStageName,
  canAdvanceStage, canBackStage, advanceStage, backStage, turnOffStageTracking,
  trackOnLoading, enableTracking, loadWorkflowStages, workflowLoadFailed } =
  useOrderWorkflow({ order, routeId, statusAction, onConflict: loadOrder, applyOrder })
const {
  galleryUploading, isGalleryDragOver, galleryViewerVisible, galleryViewerIndex,
  openGalleryViewer, handleGalleryFileSelect, handleGalleryDrop,
  guardDragEnter, guardDragOver, guardDrop, selectFocusImage, uploadGalleryFiles, validateImageFile
} = useOrderGallery({ routeId, onRefresh: loadOrder, applyOrder })
const { deadlineChip, deadlinePicker, disableDeadlineDate, disableStartDateDate, changeDeadline, startDatePicker, changeStartDate } =
  useOrderDeadline({ order, routeId, applyOrder })
const {
  payments, paymentsLoading, paymentsError, paymentSubmitting, loadPayments,
  payDialogVisible, payForm, submitPayment, nodePayDialogVisible, nodePayTarget, nodePayForm,
  openNodePayDialog, submitNodePayment, handleRevokePayment,
  poolPaidCents, poolFinalCents, poolRemainingCents, poolPercent, poolOverpaidCents,
  installmentRefs, nextDueInstallment, remainingCents, scrollToPayment
} = useOrderPaymentPanel({ order, routeId, onRefresh: loadOrder })

// R18/R19: Ctrl+V 粘贴上传（复用 usePasteUpload，焦点路由：
// 备注输入框聚焦时 → 备注附图（单张，经 NotesPanel expose）；否则 → 订单图库（多张））
const { pasteError } = usePasteUpload({
  onFiles: async (files) => {
    if (document.activeElement?.closest('.note-input')) {
      await notesPanelRef.value?.uploadNoteImage(files[0])
      if (files.length > 1) ElMessage.info(t('orderDetail.noteImageSingle'))
    } else {
      await uploadGalleryFiles(files)
    }
  },
  maxCount: MAX_IMAGE_COUNT,
  maxSizeMB: 10
})

// ─── R17 优先级 / T3 状态变更 / R39 取消滑块流 / 再来一单 / QQ 与追踪链接 / 再许可 / 删参考图
//     已随 useOrderActions 拆出（2026-08-20 二轮拆分，纯搬移零行为变化） ───
const {
  reorderDialogVisible, reorderFill, openReorderDialog, confirmReorder,
  jumpToQq, copyQq, regeneratingToken, regenerateAndCopyLink,
  changePriority, changeStatus,
  cancelUndo, cancelSubmitting, confirmCancelOrder, onUndoCancel,
  slideCancelActive, slideCancelProgress, openSlideCancel, closeSlideCancel,
  handleSlideStart, handleSlideMove, handleSlideEnd,
  repermittingId, repermitDeliverable, deleteReference, openFile
} = useOrderActions({ order, routeId, statusAction, prevPriority, loadOrder, applyOrder })

// ─── R19: 备注附图/时间线逻辑已随 NotesPanel 拆出（2026-08-10）；粘贴经 expose 调用 ───

// ─── SPEC-003 附加工作项 + 改价已随 ExtraItemsPanel 拆出（2026-08-10） ───

// ─── plan-node-speech 客户沟通已随 CommPanel 拆出（2026-08-10） ───

// 打开交付弹窗（方案 B：DeliverDialog 组件内自管状态重置；看板 ?deliver=1 跳转时自动弹）
function openDeliverDialog() {
  showDeliver.value = true
}

// 交付成功回调（DeliverDialog emit delivered，回传最新订单）；
// 面板类组件统一走 order-updated 事件同款写回（拆分后与原 order.value= 赋值行为一致）
// M-9: 同为整体写订单的写入点，收敛进统一写入口（旧快照拒收）
function onOrderUpdated(updated: EnrichedOrderDetail) {
  applyOrder(updated)
}

// ─── REQ-022 F1 发布为作品 + REQ-031 B1 完稿分享已随 PublishShareDialogs 拆出（2026-08-10） ───

// ─── R33: 签名 URL 定时刷新（10 分钟轮询 + el-image @error 兑底） ───
const { refreshNow } = useSignatureRefresh({
  collect: () => {
    const o = order.value
    if (!o) return []
    return [
      ...(o.references || []).map(r => r.file_path),
      ...(o.notes || []).filter(n => n.image_path).map(n => n.image_path),
      ...(o.deliverables || []).map(d => d.file_path)
    ].filter((p): p is string => Boolean(p))
  },
  apply: (urlMap) => {
    const o = order.value
    if (!o) return
    o.references?.forEach(r => { if (urlMap[r.file_path]) r.url = urlMap[r.file_path] })
    o.notes?.forEach(n => { if (n.image_path && urlMap[n.image_path]) n.imageUrl = urlMap[n.image_path] })
    o.deliverables?.forEach(d => { if (urlMap[d.file_path]) d.url = urlMap[d.file_path] })
  }
})

// ─── v0.31 REQ-021 F1: 操作记录已随 LogPanel 拆出（含 useActivityLog 装配，2026-08-10） ───

let unsubscribeReconnect: (() => void) | null = null
onMounted(() => {
  loadOrder()
  loadWorkflowStages() // R30d: 流程进度条需要节点列表
  loadPayments(routeId) // B7: 额度池收款流水
  // G-3（R-16）: 断网重连后重拉订单 + 收款流水（复用既有刷新函数）
  unsubscribeReconnect = subscribeReconnect(() => {
    loadOrder()
    loadPayments(routeId)
  })
})
onUnmounted(() => {
  unsubscribeReconnect?.()
})
</script>

<style scoped>
/* ═══ v0.38: 全页换肤到纸墨 token（REQ-026 §二；旧变量不残留——派工 §二.3） ═══ */
/* v129: 页面结构重做——宽屏双列：主列（进度/图库/备注/增项/交付）+ 侧列（修改记录/收款/沟通/日志），
   头部基本信息与日期分居两列顶端；窄屏回落单列（主列在前）。卡片间距 14px（REQ §1.4） */
.order-detail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.od-main, .od-side { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; min-width: 0; }
/* 容器查询批：双列断点由视口宽改认容器宽（ArtistLayout 内容容器已加 container-type: inline-size），
   防「窗口宽而页窄（--page-max-w 小档）时双列发挤」。项目目标浏览器（现代 Chromium/Safari/Firefox）
   均支持 container queries，无需 fallback。原 @media (min-width: 1280px) 同语义平移。 */
@container (min-width: 1280px) {
  /* 页宽归一批：整页限宽 1680px 旧写法移除，交给布局层 --page-max-w 全局口径 */
  .order-detail { grid-template-columns: minmax(0, 1fr) minmax(360px, 440px); }
  .od-head-info, .od-main { grid-column: 1; }
  .od-head-date, .od-side { grid-column: 2; }
}

/* 订单号文楷——落款感（REQ §1.3：数字/单号用文楷） */
.od-order-no { font-family: var(--f-d); font-size: calc(var(--font-scale, 1) * 15px); font-weight: 600; letter-spacing: .02em; }

/* ─── v0.38: 日期卡二合一（REQ-026 §四：两字段一卡，交互逻辑不变） ─── */
.date-card-body { display: flex; gap: 28px; flex-wrap: wrap; }
.date-field { display: flex; flex-direction: column; gap: 6px; }
.date-field-label { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.date-card-note { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin: 12px 0 0; }

/* ─── R39 方案B：状态区 ─── */
/* 终态只读横幅（已交付=石绿软底 / 已取消=中性，7 色语义一对一） */
.status-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-radius: var(--r-m); font-size: calc(var(--font-scale, 1) * 15px); font-weight: 600;
}
.status-banner--delivered { background: var(--sl-t); }
.status-banner--cancelled { background: color-mix(in srgb, var(--ink3) 12%, transparent); }
.status-banner-text { color: var(--ink); }
/* 最后活动时间 */
.status-last-active { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin: 10px 0 0; }
/* 无工作流兜底：状态标签 + 上下文信息 */
.status-fallback { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.status-context { display: flex; gap: 12px; flex-wrap: wrap; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
/* C53：启用流程跟踪引导（花青软底 + 虚线） */
.track-on-hint {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 14px; padding: 10px 14px;
  background: var(--hq-t); border: 1px dashed color-mix(in srgb, var(--hq) 45%, transparent);
  border-radius: var(--r-m);
}
.track-on-hint-text { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }

/* ─── R39 方案B：操作条（固定位置） ─── */
/* ─── v0.31 F5: 下一节点应收提示条（藤黄=待办提醒，非逾期不抢朱砂） ─── */
.next-due-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-radius: var(--r-m);
  background: var(--th-t);
  border: 1px solid color-mix(in srgb, var(--th) 45%, transparent);
  cursor: pointer; transition: background var(--dur-fast);
}
.next-due-banner:hover { background: color-mix(in srgb, var(--th) 18%, transparent); }
.next-due-text { flex: 1; font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--th); }
/* REQ-025 二阶段: 当前节点副信息（权重低于总额，不抢主信息） */
.next-due-sub { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); white-space: nowrap; }
.next-due-arrow { font-size: calc(var(--font-scale, 1) * 16px); color: var(--th); }

.action-bar-card :deep(.el-card__body) { padding: 12px 16px; }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.action-cancel { margin-left: auto; }

/* 滑块确认（与 QueueBoard R30e 视觉一致，朱砂=危险操作） */
.slide-confirm-row { display: flex; align-items: center; gap: 8px; }
/* flex:1 仅 OrderDetail（行动条内撑满剩余宽度）；其余由 artist-tokens.css 公共 .slide-confirm 提供 */
.slide-confirm { flex: 1; }

/* ─── R30d: 流程进度 ─── */
.stage-progress-text { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); margin: 12px 0 0; }
.stage-revision-mark { color: var(--th); font-weight: 600; margin-left: 8px; }
/* M-11（审计 260830）: 工作流节点加载失败错误条（藤黄软底警示，同 next-due-banner 语言；对齐 QueueBoardList 模式） */
.workflow-load-failed {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 10px 14px; border-radius: var(--r-m);
  background: var(--th-t); border: 1px solid color-mix(in srgb, var(--th) 45%, transparent);
}
.workflow-load-failed-text { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }

/* ─── v128: 修改记录（一行一次：类型标记 + 打回节点 + 时间） ─── */
.revision-list { list-style: none; margin: 0; padding: 0; }
.revision-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 0; border-top: 1px solid var(--line);
}
.revision-row:first-child { border-top: none; }
.revision-icon {
  width: 24px; height: 24px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--r-s);
  font-size: calc(var(--font-scale, 1) * 13px);
}
/* 手动修改 = 花青（进行中语义）；打回 = 藤黄（待确认语义） */
.revision-icon--manual { background: var(--hq-t); color: var(--hq-d); }
.revision-icon--rollback { background: var(--th-t); color: var(--th); }
.revision-type { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); font-weight: 600; }
.revision-stages { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }
.revision-time { margin-left: auto; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }


/* R17: 优先级分段按钮配色（选中态由 Element Plus 内部 is-checked 控制） */
.priority-group :deep(.prio-high.is-checked .el-radio-button__inner) { background: var(--zs); border-color: var(--zs); box-shadow: -1px 0 0 0 var(--zs); }
.priority-group :deep(.prio-medium.is-checked .el-radio-button__inner) { background: var(--th); border-color: var(--th); box-shadow: -1px 0 0 0 var(--th); }
.priority-group :deep(.prio-low.is-checked .el-radio-button__inner) { background: var(--sl); border-color: var(--sl); box-shadow: -1px 0 0 0 var(--sl); }

/* R40 备注时间线/操作记录/备注输入样式已随 NotesPanel/LogPanel 拆出（2026-08-10） */

.file-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }

/* REQ-022 F1/REQ-031 B1 发布/分享弹窗样式已随 PublishShareDialogs 拆出（2026-08-10） */

/* R58-6: 客户 QQ 跳转 + 复制 */
.client-qq-row { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.client-qq-row .el-button { padding: 2px 6px; height: auto; }

/* SPEC-003 附加工作项/改价/客户沟通样式已随 ExtraItemsPanel/CommPanel 拆出（2026-08-10） */

/* REQ-037 F1: 首载失败错误态 */
.od-load-failed {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 56px 0; color: var(--ink2); font-size: calc(var(--font-scale, 1) * 14px);
}
.od-load-failed p { margin: 0; }

/* 818-D: 再来一单回填选项对话框 */
.reorder-dialog-hint {
  margin: 0 0 12px;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink2);
  line-height: 1.6;
}
.reorder-fill-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
