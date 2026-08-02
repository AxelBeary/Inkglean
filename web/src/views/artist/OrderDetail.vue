<template>
  <ArtistLayout>
    <el-page-header @back="goBack" :title="backTitle" :content="order ? `${$t('orderDetail.orderNo')}${order.order_no}` : ''" />

    <div v-if="order" class="order-detail">
      <!-- 基本信息 -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>{{ $t('orderDetail.orderInfo') }}</span>
            <el-tag :type="statusType(order.status)">{{ $t(`common.orderStatus.${order.status}`) }}</el-tag>
          </div>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item :label="$t('orderDetail.colOrderNo')">{{ order.order_no }}</el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colType')">{{ order.tier_name || $t('common.custom') }}</el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colQq')">
            <span class="client-qq-row">
              <span>{{ order.client_qq }}</span>
              <!-- R58-6: 客户 QQ 跳转 + 复制 -->
              <el-button size="small" text type="primary" @click="jumpToQq(order.client_qq)">{{ $t('orderDetail.jumpQq') }}</el-button>
              <el-button size="small" text @click="copyQq(order.client_qq)">{{ $t('orderDetail.copyQq') }}</el-button>
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
          <!-- R51: 截稿日（date-picker，可清除，即时保存） -->
          <el-descriptions-item :label="$t('orderDetail.colDeadline')">
            <el-date-picker
              v-model="deadlinePicker" type="date" value-format="YYYY-MM-DD"
              :placeholder="$t('orderDetail.deadlinePlaceholder')"
              :disabled-date="disableDeadlineDate"
              clearable size="small" style="width: 160px"
              @change="changeDeadline"
            />
          </el-descriptions-item>
          <!-- v0.26 B: 开工日（date-picker，可清除，即时保存 + 自动填截稿日） -->
          <el-descriptions-item :label="$t('orderDetail.colStartDate')">
            <el-date-picker
              v-model="startDatePicker" type="date" value-format="YYYY-MM-DD"
              :placeholder="$t('orderDetail.startDatePlaceholder')"
              :disabled-date="disableStartDateDate"
              clearable size="small" style="width: 160px"
              @change="changeStartDate"
            />
          </el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colDesc')" :span="2">{{ order.description || $t('common.none') }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- R40: 活动时间线（状态区 + 备注区合并，C54 展示层合并；操作条保持独立不合并） -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>{{ $t('orderDetail.activityTitle') }}</span>
            <!-- 关闭跟踪属设置型操作，保留在卡头（状态推进操作收敛到下方操作条） -->
            <el-button v-if="hasWorkflow" text size="small" type="info" @click="turnOffStageTracking">{{ $t('orderDetail.stageOff') }}</el-button>
          </div>
        </template>

        <!-- 终态：只读横幅，无操作 -->
        <div v-if="isTerminal" class="status-banner" :class="`status-banner--${order.status}`">
          <span class="status-banner-icon">{{ order.status === 'delivered' ? '✅' : '❌' }}</span>
          <span class="status-banner-text">
            {{ $t(`common.orderStatus.${order.status}`) }}
            <template v-if="order.status === 'delivered' && order.completed_at"> · {{ $t('orderDetail.completedAt', { time: formatDate(order.completed_at) }) }}</template>
          </span>
        </div>

        <!-- 有工作流：工作流进度条为唯一状态展示（C52：固定状态条隐藏） -->
        <template v-else-if="hasWorkflow">
          <OrderTimeline :stages="workflowStages" :current-stage-id="order.currentStageId" />
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
            <span class="track-on-hint-text">💡 {{ $t('orderDetail.enableTrackingHint') }}</span>
            <el-button size="small" type="primary" plain :loading="trackOnLoading" @click="enableTracking">{{ $t('orderDetail.enableTracking') }}</el-button>
          </div>
        </template>
      </el-card>

      <!-- v0.31 F5: 下一节点应收（显著位置，点击跳转收款区） -->
      <div v-if="!isTerminal && nextDueInstallment" class="next-due-banner" @click="scrollToPayment">
        <span class="next-due-icon">💰</span>
        <span class="next-due-text">
          {{ $t('orderDetail.nextDueLabel', { name: nextDueInstallment.name, amount: `¥${formatCents(nextDueInstallment.remainingCents)}` }) }}
        </span>
        <span class="next-due-arrow">→</span>
      </div>

      <!-- R39 方案B：操作条（固定位置——不随状态区内容跳动，画师永远知道按钮在哪） -->
      <el-card v-if="!isTerminal" class="action-bar-card" style="margin-top: 12px">
        <!-- 取消订单：滑块确认行（R30e，C59 高代价操作用滑块） -->
        <div v-if="slideCancelActive" class="slide-confirm-row">
          <div class="slide-confirm">
            <div class="slide-confirm-fill" :style="{ width: `calc(${slideCancelProgress} * 100%)` }"></div>
            <span class="slide-confirm-label">{{ $t('orderDetail.slideToCancel') }}</span>
            <div
              class="slide-confirm-thumb"
              :style="{ left: `calc(2px + ${slideCancelProgress} * (100% - 40px))` }"
              @pointerdown="onSlideStart"
              @pointermove="onSlideMove"
              @pointerup="onSlideEnd"
            >
              →
            </div>
          </div>
          <el-button text size="small" @click="closeSlideCancel">✕</el-button>
        </div>

        <!-- 常规操作按钮 -->
        <div v-else class="action-bar">
          <!-- 有工作流：推进 / 打回 -->
          <template v-if="hasWorkflow">
            <el-button v-if="canAdvanceStage" type="primary" @click="advanceStage">
              {{ $t('orderDetail.advanceTo') }}{{ nextStageName }}
            </el-button>
            <el-button v-if="canBackStage" type="warning" plain @click="backStage">{{ $t('orderDetail.stageBack') }}</el-button>
          </template>
          <!-- 无工作流：固定状态按钮（原逻辑不变，仅位置收敛） -->
          <template v-else>
            <el-button v-if="order.status === 'pending'" type="primary" @click="changeStatus('confirmed')">{{ $t('orderDetail.confirmOrder') }}</el-button>
            <el-button v-if="order.status === 'confirmed'" type="warning" @click="changeStatus('wip')">{{ $t('orderDetail.startWip') }}</el-button>
            <el-button v-if="order.status === 'wip'" @click="changeStatus('revision')">{{ $t('orderDetail.needRevision') }}</el-button>
            <el-button v-if="['wip','revision'].includes(order.status)" type="success" @click="changeStatus('done')">{{ $t('orderDetail.markDone') }}</el-button>
            <el-button v-if="order.status === 'done'" type="success" @click="openDeliverDialog">{{ $t('orderDetail.uploadDeliver') }}</el-button>
          </template>
          <!-- 取消订单：固定在右侧 -->
          <el-button type="danger" plain class="action-cancel" @click="openSlideCancel">{{ $t('orderDetail.cancelOrder') }}</el-button>
        </div>
      </el-card>

      <!-- R18: 订单图库（参考图 + 画师加图，点击设焦点） -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>{{ $t('orderDetail.gallery') }}</span>
            <span class="gallery-count">{{ order.references?.length || 0 }} / 20</span>
          </div>
        </template>
        <div class="ref-grid">
          <div
            v-for="(reference, index) in order.references" :key="reference.id"
            class="ref-item" :class="{ 'ref-item--focus': order.focus_image_path === reference.file_path }"
          >
            <div class="ref-img-wrap" @click="openGalleryViewer(index)">
              <!-- R43: placeholder 骨架屏防首屏白闪 -->
              <el-image :src="reference.url" fit="cover" class="ref-img" :alt="$t('orderDetail.referenceImage')" @error="refreshNow">
                <template #placeholder>
                  <div class="ref-img-skeleton"></div>
                </template>
              </el-image>
              <!-- R18: 来源角标（客户/画师） -->
              <span class="ref-source-badge" :class="`ref-source-badge--${reference.source || 'client'}`">
                {{ reference.source === 'artist' ? $t('orderDetail.sourceArtist') : $t('orderDetail.sourceClient') }}
              </span>
              <!-- R44: 悬停操作组——✓设焦点（C56 手机端常驻）+ 删除；🔍已移除（单击图片即预览） -->
              <span class="ref-hover-actions">
                <el-button size="small" circle :title="$t('orderDetail.setFocus')" @click.stop="selectFocusImage(reference)">✓</el-button>
                <el-button size="small" circle type="danger" :title="$t('orderDetail.deleteRef')" @click.stop="deleteReference(reference)">✕</el-button>
              </span>
              <!-- 焦点指示 -->
              <span v-if="order.focus_image_path === reference.file_path" class="ref-focus-indicator">✓</span>
            </div>
          </div>

          <!-- R18: 上传入口（拖拽/点击/Ctrl+V） -->
          <div
            class="ref-upload-tile"
            :class="{ 'ref-upload-tile--active': isGalleryDragOver }"
            @dragover.prevent="isGalleryDragOver = true"
            @dragleave="isGalleryDragOver = false"
            @drop.prevent="handleGalleryDrop"
            @click="triggerGalleryUpload"
          >
            <el-icon :size="24"><Plus /></el-icon>
            <span class="ref-upload-text">{{ $t('orderDetail.galleryUpload') }}</span>
          </div>
          <input
            ref="galleryInputEl" type="file" accept="image/*" multiple hidden
            @change="handleGalleryFileSelect"
          />
        </div>
        <p v-if="!order.references?.length" class="no-refs">{{ $t('orderDetail.noReferences') }}</p>
        <p v-if="galleryUploading" class="upload-status">{{ $t('orderDetail.uploading') }}</p>
        <p v-if="pasteError" class="upload-error">{{ pasteError }}</p>
        <p class="focus-hint">{{ $t('orderDetail.galleryHint') }}</p>
      </el-card>

      <!-- R40: 活动时间线（系统备注 + 画师备注按 created_at 混排，方案A 纯前端；R46 悬停删除） -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>{{ $t('orderDetail.timelineTitle') }}</span>
            <span class="timeline-count">{{ $t('orderDetail.noteCount', { n: order.notes?.length || 0 }) }}</span>
          </div>
        </template>
        <el-timeline v-if="order.notes?.length" class="activity-timeline">
          <el-timeline-item
            v-for="note in order.notes" :key="note.id"
            :type="note.created_by === 'system' ? 'info' : (note.image_path ? 'success' : 'primary')"
            :hollow="note.created_by === 'system'"
            :timestamp="formatDate(note.created_at)" placement="top"
          >
            <div class="tl-item" :class="{ 'tl-item--system': note.created_by === 'system' }">
              <div class="tl-head">
                <span class="tl-type">{{ note.created_by === 'system' ? '🔄' : (note.image_path ? '🖼' : '📝') }} {{ note.created_by === 'system' ? $t('orderDetail.tlTypeSystem') : (note.image_path ? $t('orderDetail.tlTypeImage') : $t('orderDetail.tlTypeNote')) }}</span>
                <!-- R46: 画师备注悬停显示删除（系统备注不显示；触屏常驻，与参考图交互一致 C56） -->
                <el-button
                  v-if="note.created_by !== 'system'"
                  class="tl-delete" size="small" circle type="danger"
                  :title="$t('orderDetail.deleteNote')"
                  @click="deleteNote(note)"
                >
                  ✕
                </el-button>
              </div>
              <div class="tl-content">{{ note.content }}</div>
              <!-- R19: 带图备注显示缩略图，点击看大图 -->
              <img
                v-if="note.imageUrl"
                :src="note.imageUrl"
                class="note-thumb"
                :alt="$t('orderDetail.noteImage')"
                @click="openNoteImage(note.imageUrl)"
                @error="refreshNow"
              />
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else :description="$t('orderDetail.noNotes')" :image-size="60" />
        <!-- 添加备注输入框（R40：移到时间线底部） -->
        <div
          class="note-input"
          :class="{ 'note-input--drag-over': isNoteDragOver }"
          @dragover.prevent="isNoteDragOver = true"
          @dragleave="onNoteDragLeave"
          @drop.prevent="handleNoteDrop"
        >
          <el-input v-model="newNote" :placeholder="$t('orderDetail.notePlaceholder')" @keyup.enter="addNote" />
          <!-- R19: 附图按钮（上传/粘贴 1 张） -->
          <el-button @click="triggerNoteImageUpload" :disabled="!!pendingNoteImage">
            <el-icon><Picture /></el-icon>
          </el-button>
          <input
            ref="noteImageInputEl" type="file" accept="image/*" hidden
            @change="handleNoteImageSelect"
          />
          <el-button type="primary" @click="addNote" :loading="noteSubmitting">{{ $t('orderDetail.addNote') }}</el-button>
        </div>
        <!-- R19: 待发送附图预览 -->
        <div v-if="pendingNoteImage" class="note-pending">
          <img :src="pendingNoteImage.url" class="note-pending-img" :alt="$t('orderDetail.noteImage')" />
          <el-button text type="danger" size="small" @click="pendingNoteImage = null">✕ {{ $t('common.cancel') }}</el-button>
        </div>
      </el-card>

      <!-- SPEC-003: 附加工作项（添加/删除后 final_price_cents 自动重算） -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>{{ $t('orderDetail.extraItemsTitle') }}</span>
            <span class="extra-count">{{ order.extraItems?.length || 0 }} / 20</span>
          </div>
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
              :title="$t('orderDetail.extraDelete')"
              @click="deleteExtraItem(item)"
            >
              ✕
            </el-button>
          </div>
        </div>
        <el-empty v-else :description="$t('orderDetail.extraEmpty')" :image-size="60" />
        <div class="extra-footer">
          <el-button v-if="!isTerminal" size="small" @click="openExtraDialog" :disabled="order.extraItems?.length >= 20">
            + {{ $t('orderDetail.extraAdd') }}
          </el-button>
          <span v-if="order.final_price_cents != null" class="extra-total">
            {{ $t('orderDetail.extraTotal') }} ¥{{ formatCents(order.final_price_cents) }}
          </span>
          <!-- v0.31 五号方案A：改价按钮（后端 PUT /price 已有，前端首次接通） -->
          <el-button v-if="!isTerminal" size="small" text type="primary" @click="openPriceDialog">
            ✏️ {{ $t('orderDetail.priceEditBtn') }}
          </el-button>
        </div>
        <p v-if="order.extraItems?.length" class="extra-auto-hint">💡 {{ $t('orderDetail.extraAutoHint') }}</p>
      </el-card>

      <!-- plan-node-speech：客户沟通（QQ + 价格小结 + 话术预览 + 复制唤起QQ） -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>💬 {{ $t('orderDetail.commTitle') }}</span>
          </div>
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

      <!-- B7: 额度池收款记录 -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>💰 {{ $t('orderDetail.payTitle') }}</span>
            <el-button type="primary" size="small" @click="payDialogVisible = true">{{ $t('orderDetail.payAddBtn') }}</el-button>
          </div>
        </template>
        <div v-loading="paymentsLoading">
          <!-- 已收 / 应收 / 待收 + 进度条 -->
          <div class="pool-summary">
            <div class="pool-nums">
              <span>{{ $t('orderDetail.payPaid') }} <strong>¥{{ formatCents(poolPaidCents) }}</strong></span>
              <span>/ {{ $t('orderDetail.payFinal') }} <strong>¥{{ formatCents(poolFinalCents) }}</strong></span>
              <span class="pool-remaining">{{ $t('orderDetail.payRemaining') }} <strong>¥{{ formatCents(poolRemainingCents) }}</strong></span>
            </div>
            <el-progress :percentage="poolPercent" :stroke-width="12" :color="poolPercent >= 100 ? '#67c23a' : '#409eff'" style="margin-top: 8px" />
          </div>

          <!-- 收款流水 -->
          <div class="pool-flow" v-if="payments.length">
            <h4 class="pool-flow-title">{{ $t('orderDetail.payFlowTitle') }}</h4>
            <div v-for="p in payments" :key="p.id" class="pool-flow-row">
              <span class="pool-flow-date">{{ formatDate(p.created_at) }}</span>
              <span class="pool-flow-amount" :class="p.amount_cents < 0 ? 'is-negative' : 'is-positive'">
                {{ p.amount_cents < 0 ? '-' : '+' }}¥{{ formatCents(Math.abs(p.amount_cents)) }}
              </span>
              <span class="pool-flow-note">{{ p.note || '' }}</span>
              <el-button
                v-if="p.amount_cents > 0"
                text size="small" type="danger"
                @click="handleRevokePayment(p)"
              >
                {{ $t('orderDetail.payRevoke') }}
              </el-button>
            </div>
          </div>
          <el-empty v-else-if="!paymentsLoading" :description="$t('orderDetail.payEmpty')" :image-size="48" />

          <!-- v0.31 F4: 节点收款（每节点已收/应收/差额 + 快捷收款） -->
          <div class="pool-ref" v-if="installmentRefs.length">
            <h4 class="pool-ref-title">{{ $t('orderDetail.payRefTitle') }}</h4>
            <div v-for="inst in installmentRefs" :key="inst.id" class="pool-ref-row pool-ref-row--v2">
              <span class="pool-ref-icon">{{ inst.status === 'paid' ? '✓' : inst.status === 'partial' ? '◐' : '○' }}</span>
              <span class="pool-ref-name">{{ inst.name }}</span>
              <span class="pool-ref-amounts">
                <span class="pool-ref-paid">{{ $t('orderDetail.payNodePaid') }} ¥{{ formatCents(inst.paidCents) }}</span>
                <span class="pool-ref-sep">/</span>
                <span>{{ $t('orderDetail.payNodeDue') }} ¥{{ formatCents(inst.amountCents) }}</span>
                <span v-if="inst.remainingCents > 0" class="pool-ref-remain">（{{ $t('orderDetail.payNodeRemain') }} ¥{{ formatCents(inst.remainingCents) }}）</span>
              </span>
              <el-tag v-if="inst.status === 'paid'" type="success" size="small">{{ $t('orderDetail.payRefPaid') }}</el-tag>
              <el-tag v-else-if="inst.status === 'partial'" type="warning" size="small">{{ $t('orderDetail.payRefPartial', { amount: `¥${formatCents(inst.paidCents)}` }) }}</el-tag>
              <el-tag v-else type="info" size="small">{{ $t('orderDetail.payRefPending') }}</el-tag>
              <!-- 快捷收款（非终态 + 有差额时显示） -->
              <el-button
                v-if="!isTerminal && inst.remainingCents > 0"
                size="small" type="primary" plain
                @click="openNodePayDialog(inst)"
              >
                {{ $t('orderDetail.payNodeCollect') }}
              </el-button>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 交付文件 -->
      <el-card style="margin-top: 16px" v-if="order.deliverables?.length">
        <template #header>{{ $t('orderDetail.deliverFiles') }}</template>
        <div v-for="d in order.deliverables" :key="d.id" class="file-item">
          <span>📄 {{ d.original_name }}</span>
          <el-button size="small" @click="openFile(d.url)">{{ $t('common.download') }}</el-button>
        </div>
      </el-card>
    </div>

    <!-- 交付弹窗 -->
    <el-dialog v-model="showDeliver" :title="$t('orderDetail.deliverTitle')" width="400px">
      <el-upload
        drag :auto-upload="false" :limit="1" :file-list="deliverFileList"
        :on-change="handleDeliverFile" :on-remove="handleDeliverRemove"
        accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.psd,.ai,.tiff,.pdf,.zip,.rar,.7z,.mp4,.mov,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
      >
        <el-icon style="font-size: 40px; color: var(--text-secondary)"><Upload /></el-icon>
        <p>{{ $t('orderDetail.dragUpload') }}</p>
        <template #tip>
          <div class="el-upload__tip">{{ $t('orderDetail.uploadTip') }}</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="showDeliver = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitDeliver" :disabled="!deliverFile" :loading="delivering">{{ $t('orderDetail.confirmDeliver') }}</el-button>
      </template>
    </el-dialog>

    <!-- B7: 记录收款弹窗 -->
    <el-dialog v-model="payDialogVisible" :title="$t('orderDetail.payDialogTitle')" width="380px">
      <el-form label-position="top">
        <el-form-item :label="$t('orderDetail.payAmountLabel')" required>
          <el-input-number
            v-model="payForm.amountYuan"
            :min="0.01" :max="999999.99" :precision="2" :step="50"
            controls-position="right" style="width: 100%"
            :placeholder="$t('orderDetail.payAmountPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="$t('orderDetail.payNoteLabel')">
          <el-input v-model="payForm.note" :placeholder="$t('orderDetail.payNotePlaceholder')" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitPayment" :disabled="!payForm.amountYuan || payForm.amountYuan <= 0" :loading="paymentSubmitting">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

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
          <el-input-number v-model="extraForm.priceYuan" :min="0" :max="999999.99" :precision="2" :step="10" controls-position="right" style="width: 200px" />
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

    <!-- v0.31 F4: 节点快捷收款弹窗 -->
    <el-dialog v-model="nodePayDialogVisible" :title="$t('orderDetail.payNodeTitle', { name: nodePayTarget?.name || '' })" width="380px">
      <el-form label-position="top">
        <el-form-item :label="$t('orderDetail.payAmountLabel')" required>
          <el-input-number
            v-model="nodePayForm.amountYuan"
            :min="0.01" :max="999999.99" :precision="2" :step="50"
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
      :url-list="order.references?.map(r => r.url) || []"
      :initial-index="galleryViewerIndex"
      @close="galleryViewerVisible = false"
    />

    <!-- R19: 备注附图大图查看 -->
    <el-image-viewer
      v-if="noteImageViewerUrl"
      :url-list="[noteImageViewerUrl]"
      @close="noteImageViewerUrl = null"
    />
  </ArtistLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Plus, Picture } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import OrderTimeline from '../../components/shared/OrderTimeline.vue'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import { useSignatureRefresh } from '../../composables/useSignatureRefresh.js'
import { useSlideConfirm } from '../../composables/useSlideConfirm.js'
import { useOrderPayments } from '../../composables/useOrderPayments.js'
import { formatDateTime } from '../../utils/datetime.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const order = ref(null)
const prevPriority = ref(null)
const newNote = ref('')
const showDeliver = ref(false)
const deliverFile = ref(null)
const deliverFileList = ref([])
const delivering = ref(false)

// P2-12: 交付文件前端校验
const DELIVER_MAX_SIZE = 50 * 1024 * 1024 // 50MB
// S-10 修复：对齐后端 upload.routes.js DELIVER_ALLOWED（23 种）
const DELIVER_ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp',
  '.psd', '.ai', '.tiff', '.pdf',
  '.zip', '.rar', '.7z',
  '.mp4', '.mov',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md'
]

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

import { ORDER_STATUS_TYPE } from '../../constants/order.js'

const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'

// ─── R58-6: 客户 QQ 跳转 + 复制 ───
function jumpToQq(qq) {
  window.open(`tencent://message/?uin=${encodeURIComponent(qq)}`, '_self')
}
async function copyQq(qq) {
  try {
    await navigator.clipboard.writeText(qq)
    ElMessage.success(t('orderDetail.qqCopied'))
  } catch {
    ElMessage.warning(qq) // 剪贴板不可用时直接展示 QQ 号供手动复制
  }
}

// ─── R39 方案B：状态区派生状态 ───
/** 订单是否接入工作流（进度条为唯一状态展示的依据，C52） */
const hasWorkflow = computed(() => order.value?.currentStageId != null)
/** 终态（已交付/已取消）：状态卡只读，操作条隐藏 */
const isTerminal = computed(() => ['delivered', 'cancelled'].includes(order.value?.status))

function formatDate(str) {
  return formatDateTime(str)
}

async function loadOrder() {
  try {
    order.value = await artistApi.getOrder(route.params.id)
    prevPriority.value = order.value?.priority || 'medium'
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R30d: 流程状态机（进度条 + 推进/打回 + 关闭跟踪） ───
const workflowStages = ref([])

/** 当前节点在排序后列表中的索引（-1 = 未接入/节点已删） */
const currentStageIdx = computed(() =>
  workflowStages.value.findIndex(s => s.id === order.value?.currentStageId)
)

/** 进度 { current, total }（后端未返回时前端兜底计算） */
const stageProgress = computed(() =>
  order.value?.stageProgress || { current: currentStageIdx.value + 1, total: workflowStages.value.length }
)

/** 下一节点（用于推进按钮文案） */
const nextStage = computed(() =>
  currentStageIdx.value !== -1 ? workflowStages.value[currentStageIdx.value + 1] : null
)
const nextStageName = computed(() => nextStage.value?.name || '')

/** 可推进：有 stage、非终态、存在下一节点 */
const canAdvanceStage = computed(() =>
  order.value?.currentStageId != null
  && !['delivered', 'cancelled'].includes(order.value?.status)
  && !!nextStage.value
)

/** 可打回：有 stage、非终态、存在上一节点 */
const canBackStage = computed(() =>
  order.value?.currentStageId != null
  && !['delivered', 'cancelled'].includes(order.value?.status)
  && currentStageIdx.value > 0
)

async function advanceStage() {
  if (!nextStage.value) return
  try {
    order.value = await artistApi.advanceStage(route.params.id, nextStage.value.id)
    ElMessage.success(t('orderDetail.stageUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function backStage() {
  const prev = workflowStages.value[currentStageIdx.value - 1]
  if (!prev) return
  try {
    await ElMessageBox.confirm(
      t('orderDetail.stageBackConfirm', { name: prev.name }),
      t('orderDetail.confirmTitle'),
      { type: 'warning' }
    )
  } catch { return }
  try {
    order.value = await artistApi.stageBack(route.params.id, prev.id)
    ElMessage.success(t('orderDetail.stageUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function turnOffStageTracking() {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.stageOffConfirm'),
      t('orderDetail.confirmTitle'),
      { type: 'warning' }
    )
  } catch { return }
  try {
    order.value = await artistApi.stageOff(route.params.id)
    ElMessage.success(t('orderDetail.stageOffDone'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R39/C53：老订单启用流程跟踪（后端 track-on：设第一节点，status 保持不变） ───
const trackOnLoading = ref(false)
async function enableTracking() {
  trackOnLoading.value = true
  try {
    order.value = await artistApi.trackOn(route.params.id)
    ElMessage.success(t('orderDetail.trackingEnabled'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    trackOnLoading.value = false
  }
}

async function loadWorkflowStages() {
  try {
    const res = await artistApi.getWorkflow()
    workflowStages.value = res.stages || []
  } catch {
    // 静默失败：无工作流时流程卡片不显示（currentStageId 为 null）
  }
}

// ─── R18: 订单图库（上传 + 来源角标 + 点击设焦点） ───
const galleryInputEl = ref(null)
const galleryUploading = ref(false)
const isGalleryDragOver = ref(false)
const galleryViewerVisible = ref(false)
const galleryViewerIndex = ref(0)

function openGalleryViewer(index) {
  galleryViewerIndex.value = index
  galleryViewerVisible.value = true
}

/** 图片文件前端校验（格式 + 10MB） */
function validateImageFile(file) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('orderDetail.galleryNotImage'))
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error(t('orderDetail.galleryTooBig'))
    return false
  }
  return true
}

/** 上传单张图并关联到订单（画师加图，后端自动标 source='artist'） */
async function uploadAndAttachReference(file) {
  if (!validateImageFile(file)) return
  const uploaded = await uploadApi.reference(file)
  order.value = await artistApi.addReference(route.params.id, {
    filePath: uploaded.filePath,
    fileName: uploaded.originalName,
    fileSize: uploaded.size
  })
}

/** 批量上传（拖拽/多选/粘贴共用） */
async function uploadGalleryFiles(files) {
  if (!files.length) return
  galleryUploading.value = true
  try {
    for (const file of files) {
      await uploadAndAttachReference(file)
    }
    ElMessage.success(t('orderDetail.galleryUploadSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
    await loadOrder() // 部分成功时刷新到最新状态
  } finally {
    galleryUploading.value = false
  }
}

function triggerGalleryUpload() {
  galleryInputEl.value?.click()
}

function handleGalleryFileSelect(event) {
  const files = [...event.target.files]
  event.target.value = ''
  uploadGalleryFiles(files)
}

function handleGalleryDrop(event) {
  isGalleryDragOver.value = false
  const files = [...event.dataTransfer.files].filter(f => f.type.startsWith('image/'))
  if (files.length) uploadGalleryFiles(files)
}

// R18/R19: Ctrl+V 粘贴上传（复用 usePasteUpload，焦点路由：
// 备注输入框聚焦时 → 备注附图（单张）；否则 → 订单图库（多张））
const { pasteError } = usePasteUpload({
  onFiles: async (files) => {
    if (document.activeElement?.closest('.note-input')) {
      await uploadNoteImage(files[0])
      if (files.length > 1) ElMessage.info(t('orderDetail.noteImageSingle'))
    } else {
      await uploadGalleryFiles(files)
    }
  },
  maxCount: 5,
  maxSizeMB: 10
})

// R44: 设焦点改由 ✓ 小钩按钮触发（单击图片 = 放大预览）
async function selectFocusImage(reference) {
  try {
    // mode 仅为满足后端 schema；实际显示尺寸由看板 queue_focus_display 决定
    order.value = await artistApi.setFocusImage(route.params.id, { imagePath: reference.file_path, mode: 'small' })
    ElMessage.success(t('orderDetail.focusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R17: 优先级（点击即保存，失败回滚） ───
async function changePriority(priority) {
  try {
    await artistApi.updatePriority(route.params.id, priority)
    prevPriority.value = priority
    ElMessage.success(t('orderDetail.priorityUpdated'))
  } catch (err) {
    order.value.priority = prevPriority.value
    ElMessage.error(err.message)
  }
}

// ─── R51: 截稿日（date-picker 即时保存，null = 清除） ───
// 本地 ref + watcher 同步：v-model 需要真实 setter——日历点选时 EP 发出 update:modelValue，
// setter 必须写入，否则 props.modelValue 不变 → @change 永不触发 → API 不调用（画师反馈的 Bug）。
// 实际保存走 changeDeadline；API 返回后 order 更新 → watcher 同步回 ref。
const deadlinePicker = ref(null)
watch(() => order.value?.deadline, (val) => {
  deadlinePicker.value = val ? val.slice(0, 10) : null
})

// REQ-018: 截稿日不可早于开工日（有开工日时灰掉之前的）
function disableDeadlineDate(d) {
  if (!startDatePicker.value) return false
  const start = new Date(startDatePicker.value + 'T00:00:00')
  return d < start
}

// REQ-018: 开工日不可晚于截稿日（有截稿日时灰掉之后的）
function disableStartDateDate(d) {
  if (!deadlinePicker.value) return false
  const end = new Date(deadlinePicker.value + 'T00:00:00')
  return d > end
}

async function changeDeadline(val) {
  try {
    order.value = await artistApi.updateDeadline(route.params.id, val || null)
    ElMessage.success(t('orderDetail.deadlineUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── v0.26 B: 开工日（date-picker 即时保存 + 自动填截稿日） ───
const startDatePicker = ref(null)
// 兼容 PUT 返回 snake_case（start_date）和 GET 返回 camelCase（startDate）
watch(() => order.value?.startDate ?? order.value?.start_date ?? null, (val) => {
  startDatePicker.value = val || null
})

async function changeStartDate(val) {
  try {
    order.value = await artistApi.updateStartDate(route.params.id, val || null)
    ElMessage.success(t('orderDetail.startDateUpdated'))
    // 自动填截稿日：截稿日为空 + 有开工日 + 档位有工期
    if (val && !order.value.deadline && order.value.tier_work_days) {
      const start = new Date(val + 'T00:00:00')
      start.setDate(start.getDate() + order.value.tier_work_days)
      // 本地日期格式化（toISOString 转 UTC 会 off-by-one，UTC+8 下 08-15→08-14）
      const y = start.getFullYear()
      const m = String(start.getMonth() + 1).padStart(2, '0')
      const d = String(start.getDate()).padStart(2, '0')
      const autoDeadline = `${y}-${m}-${d}`
      order.value = await artistApi.updateDeadline(route.params.id, autoDeadline)
      ElMessage.success(t('orderDetail.deadlineAutoSet'))
    }
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function changeStatus(status) {
  try {
    order.value = await artistApi.updateStatus(route.params.id, status)
    ElMessage.success(t('orderDetail.statusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R39：取消订单滑块确认（R30e 交互，C59 高代价操作用滑块） ───
const {
  active: slideCancelActive,
  progress: slideCancelProgress,
  open: openSlideCancel,
  close: closeSlideCancel,
  onStart: onSlideStart,
  onMove: onSlideMove,
  onEnd: onSlideEnd
} = useSlideConfirm({
  onConfirm: async () => {
    try {
      order.value = await artistApi.updateStatus(route.params.id, 'cancelled')
      ElMessage.success(t('orderDetail.statusUpdated'))
    } catch (err) {
      ElMessage.error(err.message)
    }
  }
})

// ─── B7: 额度池收款区 ───
const {
  payments, loading: paymentsLoading, submitting: paymentSubmitting,
  loadPayments, addPayment, revokePayment
} = useOrderPayments()

/** 收款弹窗 */
const payDialogVisible = ref(false)
const payForm = ref({ amountYuan: null, note: '' })

/** 已收 / 应收 / 待收（后端字段优先，兜底用流水净额） */
const poolPaidCents = computed(() => order.value?.paidTotalCents ?? 0)
const poolFinalCents = computed(() => order.value?.finalPriceCents ?? order.value?.totalPriceCents ?? 0)
const poolRemainingCents = computed(() => Math.max(0, poolFinalCents.value - poolPaidCents.value))
const poolPercent = computed(() =>
  poolFinalCents.value > 0 ? Math.min(100, Math.round(poolPaidCents.value / poolFinalCents.value * 100)) : 0
)

/** v0.31 F4: 节点收款（后端直接返回 paidCents/amountCents/remainingCents/status） */
const installmentRefs = computed(() => order.value?.installments || [])

/** v0.31 F5: 下一节点应收（第一个 remainingCents > 0 的节点） */
const nextDueInstallment = computed(() =>
  installmentRefs.value.find(inst => inst.remainingCents > 0) || null
)

/** v0.31 F5: 点击跳转到收款区 */
function scrollToPayment() {
  document.querySelector('.pool-ref')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 提交收款 */
async function submitPayment() {
  const cents = Math.round((payForm.value.amountYuan || 0) * 100)
  if (cents <= 0) return
  try {
    await addPayment(route.params.id, { amountCents: cents, note: payForm.value.note || undefined })
    ElMessage.success(t('orderDetail.paySuccess'))
    payDialogVisible.value = false
    payForm.value = { amountYuan: null, note: '' }
    await Promise.all([loadOrder(), loadPayments(route.params.id)])
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── v0.31 F4: 节点快捷收款 ───
const nodePayDialogVisible = ref(false)
const nodePayTarget = ref(null) // { id, name, remainingCents }
const nodePayForm = ref({ amountYuan: null, note: '' })

function openNodePayDialog(inst) {
  nodePayTarget.value = inst
  nodePayForm.value = { amountYuan: inst.remainingCents > 0 ? inst.remainingCents / 100 : null, note: '' }
  nodePayDialogVisible.value = true
}

async function submitNodePayment() {
  const cents = Math.round((nodePayForm.value.amountYuan || 0) * 100)
  if (cents <= 0 || !nodePayTarget.value) return
  try {
    await addPayment(route.params.id, {
      amountCents: cents,
      note: nodePayForm.value.note || `${nodePayTarget.value.name}收款`,
      installmentId: nodePayTarget.value.id
    })
    ElMessage.success(t('orderDetail.paySuccess'))
    nodePayDialogVisible.value = false
    await Promise.all([loadOrder(), loadPayments(route.params.id)])
  } catch (err) {
    ElMessage.error(err.message)
  }
}

/** 撤销收款（二次确认） */
async function handleRevokePayment(payment) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.payRevokeConfirm', { amount: `¥${formatCents(payment.amount_cents)}` }),
      t('orderDetail.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await revokePayment(route.params.id, payment)
    ElMessage.success(t('orderDetail.payRevokeSuccess'))
    await Promise.all([loadOrder(), loadPayments(route.params.id)])
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R19: 备注附图 ───
const noteImageInputEl = ref(null)
const pendingNoteImage = ref(null) // { filePath, url }
const noteSubmitting = ref(false)
const noteImageViewerUrl = ref(null)

// ─── R41/C55: 备注附图拖拽上传（粘贴已由 usePasteUpload 焦点路由支持） ───
const isNoteDragOver = ref(false)
/** 防 dragleave 闪烁：子元素间移动时 relatedTarget 仍在容器内，忽略 */
function onNoteDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return
  isNoteDragOver.value = false
}
async function handleNoteDrop(event) {
  isNoteDragOver.value = false
  const file = [...event.dataTransfer.files].find(f => f.type.startsWith('image/'))
  if (file) await uploadNoteImage(file) // 单张，与粘贴行为一致
}

function triggerNoteImageUpload() {
  noteImageInputEl.value?.click()
}

async function handleNoteImageSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  await uploadNoteImage(file)
}

async function uploadNoteImage(file) {
  if (!validateImageFile(file)) return
  try {
    const uploaded = await uploadApi.noteImage(file)
    pendingNoteImage.value = { filePath: uploaded.filePath, url: uploaded.url }
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function addNote() {
  if (!newNote.value.trim()) return
  noteSubmitting.value = true
  try {
    // R19: 带可选附图（imagePath 走 notes/{artistId}/ 目录，后端签名返回 imageUrl）
    order.value = await artistApi.addNote(route.params.id, {
      content: newNote.value.trim(),
      imagePath: pendingNoteImage.value?.filePath || null
    })
    newNote.value = ''
    pendingNoteImage.value = null
    ElMessage.success(t('orderDetail.noteAdded'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    noteSubmitting.value = false
  }
}

function openNoteImage(url) {
  noteImageViewerUrl.value = url
}

// R46: 删除备注（C59 方案C：单条用 ElMessageBox.confirm；系统备注后端 403 拒绝，前端不显示按钮）
async function deleteNote(note) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.deleteNoteConfirm'),
      t('orderDetail.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    // 后端返回删除后的完整订单（含新签名 URL），直接替换保证状态一致
    order.value = await artistApi.deleteNote(route.params.id, note.id)
    ElMessage.success(t('orderDetail.deleteNoteSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

function openFile(url) {
  // H-1 修复：使用后端返回的签名 URL（references/deliverables 非公开目录）
  window.open(url, '_blank', 'noopener')
}

// ─── SPEC-003: 附加工作项（添加/删除后后端返回完整订单，final_price_cents 已重算） ───
/** 金额分 → 元（后端返分，前端 /100） */
function formatCents(cents) {
  return ((cents || 0) / 100).toFixed(2)
}

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
    order.value = await artistApi.addExtraItem(route.params.id, payload)
    extraDialogVisible.value = false
    ElMessage.success(t('orderDetail.extraAdded'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    extraSubmitting.value = false
  }
}

async function deleteExtraItem(item) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.extraDeleteConfirm', { name: item.name }),
      t('orderDetail.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    order.value = await artistApi.deleteExtraItem(route.params.id, item.id)
    ElMessage.success(t('orderDetail.extraDeleted'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── v0.31 五号方案A：改价（接通已有 PUT /price API） ───
const priceDialogVisible = ref(false)
const priceSubmitting = ref(false)
const priceForm = ref({ priceYuan: null, note: '' })

function openPriceDialog() {
  const currentCents = order.value?.final_price_cents ?? order.value?.total_price_cents ?? 0
  priceForm.value = { priceYuan: currentCents > 0 ? currentCents / 100 : null, note: '' }
  priceDialogVisible.value = true
}

async function submitPriceChange() {
  const cents = Math.round((priceForm.value.priceYuan || 0) * 100)
  if (cents <= 0) return
  priceSubmitting.value = true
  try {
    order.value = await artistApi.updatePrice(route.params.id, {
      finalPriceCents: cents,
      quoteSnapshot: priceForm.value.note.trim() || null
    })
    priceDialogVisible.value = false
    ElMessage.success(t('orderDetail.priceUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    priceSubmitting.value = false
  }
}

// UI-1: 删除参考图（悬停显示，确认后删除，焦点图由后端自动清理）
async function deleteReference(reference) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.deleteRefConfirm'),
      t('orderDetail.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await artistApi.deleteReference(route.params.id, reference.id)
    await loadOrder()
    ElMessage.success(t('orderDetail.deleteRefSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── plan-node-speech：客户沟通小块 ───
const commCopying = ref(false)

/** 话术预览（后端已替换变量；无当前节点话术时提示） */
const commSpeechText = computed(() => {
  const o = order.value
  if (!o) return ''
  if (o.speechText) return o.speechText
  if (o.currentStageId == null) return t('orderDetail.commNoStage')
  return t('orderDetail.commNoSpeech')
})

/** 复制话术 + 1 秒后唤起 QQ */
async function copySpeechAndOpenQq() {
  const o = order.value
  if (!o?.client_qq || !o?.speechText) return
  commCopying.value = true
  try {
    await navigator.clipboard.writeText(o.speechText)
    ElMessage.success(t('orderDetail.commCopied'))
    setTimeout(() => {
      window.open(`tencent://message/?uin=${encodeURIComponent(o.client_qq)}`, '_self')
    }, 1000)
  } catch {
    // 剪贴板不可用时降级：展示话术文本供手动复制
    ElMessage.warning(o.speechText)
  } finally {
    commCopying.value = false
  }
}

function handleDeliverFile(file) {
  // P2-12: 前端校验文件类型和大小
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
  if (!DELIVER_ALLOWED_EXT.includes(ext)) {
    ElMessage.error(t('orderDetail.invalidFileType'))
    return
  }
  if (file.size > DELIVER_MAX_SIZE) {
    ElMessage.error(t('orderDetail.fileTooLarge'))
    return
  }
  deliverFile.value = file.raw
}

function handleDeliverRemove() {
  deliverFile.value = null
}

// 打开交付弹窗时重置文件选择
function openDeliverDialog() {
  deliverFile.value = null
  deliverFileList.value = []
  showDeliver.value = true
}

async function submitDeliver() {
  if (!deliverFile.value) return
  delivering.value = true
  try {
    const uploaded = await uploadApi.deliverable(deliverFile.value)
    order.value = await artistApi.deliver(route.params.id, {
      filePath: uploaded.filePath,
      fileName: uploaded.originalName
    })
    showDeliver.value = false
    deliverFile.value = null
    deliverFileList.value = []
    ElMessage.success(t('orderDetail.deliverSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    delivering.value = false
  }
}

// ─── R33: 签名 URL 定时刷新（10 分钟轮询 + el-image @error 兜底） ───
const { refreshNow } = useSignatureRefresh({
  collect: () => {
    const o = order.value
    if (!o) return []
    return [
      ...(o.references || []).map(r => r.file_path),
      ...(o.notes || []).filter(n => n.image_path).map(n => n.image_path),
      ...(o.deliverables || []).map(d => d.file_path)
    ].filter(Boolean)
  },
  apply: (urlMap) => {
    const o = order.value
    if (!o) return
    o.references?.forEach(r => { if (urlMap[r.file_path]) r.url = urlMap[r.file_path] })
    o.notes?.forEach(n => { if (n.image_path && urlMap[n.image_path]) n.imageUrl = urlMap[n.image_path] })
    o.deliverables?.forEach(d => { if (urlMap[d.file_path]) d.url = urlMap[d.file_path] })
  }
})

onMounted(() => {
  loadOrder()
  loadWorkflowStages() // R30d: 流程进度条需要节点列表
  loadPayments(route.params.id) // B7: 额度池收款流水
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }

/* ─── R39 方案B：状态区 ─── */
/* 终态只读横幅 */
.status-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-radius: 8px; font-size: 15px; font-weight: 600;
}
.status-banner--delivered { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.status-banner--cancelled { background: var(--el-color-info-light-9); color: var(--el-color-info); }
.status-banner-icon { font-size: 18px; }
.status-banner-text { color: var(--text-primary); }
/* 最后活动时间 */
.status-last-active { font-size: 12px; color: var(--text-secondary); margin: 10px 0 0; }
/* 无工作流兜底：状态标签 + 上下文信息 */
.status-fallback { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.status-context { display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; color: var(--text-secondary); }
/* C53：启用流程跟踪引导 */
.track-on-hint {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 14px; padding: 10px 14px;
  background: var(--el-color-primary-light-9); border: 1px dashed var(--el-color-primary-light-5);
  border-radius: 8px;
}
.track-on-hint-text { font-size: 13px; color: var(--text-secondary); }

/* ─── R39 方案B：操作条（固定位置） ─── */
/* ─── v0.31 F5: 下一节点应收提示条 ─── */
.next-due-banner {
  display: flex; align-items: center; gap: 10px;
  margin-top: 12px; padding: 12px 16px; border-radius: 8px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
  cursor: pointer; transition: background 0.15s;
}
.next-due-banner:hover { background: var(--el-color-warning-light-8); }
.next-due-icon { font-size: 18px; }
.next-due-text { flex: 1; font-size: 14px; font-weight: 600; color: var(--el-color-warning-dark-2); }
.next-due-arrow { font-size: 16px; color: var(--el-color-warning); }

.action-bar-card :deep(.el-card__body) { padding: 12px 16px; }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.action-cancel { margin-left: auto; }

/* 滑块确认（与 QueueBoard R30e 视觉一致） */
.slide-confirm-row { display: flex; align-items: center; gap: 8px; }
.slide-confirm {
  position: relative; flex: 1; height: 40px;
  border-radius: 999px; overflow: hidden; user-select: none;
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-5);
}
.slide-confirm-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: var(--el-color-danger-light-7);
  transition: width 0.05s linear;
}
.slide-confirm-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: var(--el-color-danger);
  pointer-events: none;
}
.slide-confirm-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--el-color-danger); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700;
  cursor: grab; touch-action: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.slide-confirm-thumb:active { cursor: grabbing; }

/* ─── R30d: 流程进度 ─── */
.stage-progress-text { font-size: 13px; color: var(--text-secondary); margin: 12px 0 0; }
.stage-revision-mark { color: var(--el-color-warning); font-weight: 600; margin-left: 8px; }

/* ─── R18: 订单图库 ─── */
.gallery-count { font-size: 13px; color: var(--text-secondary); }
.ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.ref-item { display: flex; flex-direction: column; gap: 4px; }
.ref-item--focus .ref-img { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.ref-img-wrap {
  position: relative;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  transition: transform 0.15s;
}
.ref-img-wrap:hover { transform: scale(1.02); }
.ref-img { height: 120px; width: 100%; border-radius: 6px; display: block; background: var(--bg-secondary, #f0f0f0); }
/* R43: 加载骨架屏（防首屏多图白闪） */
.ref-img-skeleton {
  width: 100%; height: 100%;
  background: var(--bg-secondary, #f0f0f0);
  animation: ref-skeleton-pulse 1.2s ease-in-out infinite;
}
@keyframes ref-skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
/* R18: 来源角标 */
.ref-source-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.5;
  pointer-events: none;
}
.ref-source-badge--client { background: rgba(0, 0, 0, 0.55); color: #fff; }
.ref-source-badge--artist { background: var(--el-color-primary); color: #fff; }
/* 焦点指示 */
.ref-focus-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
/* 悬停操作组（✓设焦点 + 删除） */
.ref-hover-actions {
  position: absolute; top: 4px; right: 4px;
  display: flex; gap: 4px;
  opacity: 0; transition: opacity 0.15s;
}
.ref-img-wrap:hover .ref-hover-actions { opacity: 1; }
/* R44/C56: 触屏无悬停，✓ 设焦点按钮常驻 */
@media (hover: none) {
  .ref-hover-actions { opacity: 1; }
}
/* R18: 上传磁贴 */
.ref-upload-tile {
  height: 120px;
  border: 2px dashed var(--border-color);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.ref-upload-tile:hover, .ref-upload-tile--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.ref-upload-text { font-size: 12px; }
.upload-status { font-size: 12px; color: var(--el-color-primary); margin: 8px 0 0; }
.upload-error { font-size: 12px; color: var(--el-color-danger); margin: 8px 0 0; }
.no-refs { color: var(--text-secondary); font-size: 13px; margin: 0; }
.focus-hint { font-size: 12px; color: var(--text-secondary); margin: 12px 0 0; }

/* R17: 优先级分段按钮配色（选中态由 Element Plus 内部 is-checked 控制） */
.priority-group :deep(.prio-high.is-checked .el-radio-button__inner) { background: var(--el-color-danger); border-color: var(--el-color-danger); box-shadow: -1px 0 0 0 var(--el-color-danger); }
.priority-group :deep(.prio-medium.is-checked .el-radio-button__inner) { background: var(--el-color-warning); border-color: var(--el-color-warning); box-shadow: -1px 0 0 0 var(--el-color-warning); }
.priority-group :deep(.prio-low.is-checked .el-radio-button__inner) { background: var(--el-color-success); border-color: var(--el-color-success); box-shadow: -1px 0 0 0 var(--el-color-success); }

/* ─── R40: 活动时间线 ─── */
.timeline-count { font-size: 13px; color: var(--text-secondary); }
.activity-timeline { padding-top: 4px; }
.tl-item { position: relative; }
.tl-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tl-type { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.tl-item--system .tl-content { color: var(--text-secondary); font-size: 13px; }
.tl-content { font-size: 14px; color: var(--text-primary); line-height: 1.6; word-break: break-word; }
/* R46: 删除按钮悬停显示（触屏常驻，与参考图 .ref-hover-actions 交互一致 C56） */
.tl-delete { opacity: 0; transition: opacity 0.15s; margin-left: auto; }
.tl-item:hover .tl-delete { opacity: 1; }
@media (hover: none) {
  .tl-delete { opacity: 1; }
}
.note-thumb {
  display: block;
  margin-top: 6px;
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  cursor: zoom-in;
  border: 1px solid var(--border-color);
  /* UI-9: loading background color (consistent with the library's .ref-img, prevents white flash) */
  background: var(--bg-secondary, #f0f0f0);
  transition: transform 0.15s, box-shadow 0.15s;
}
.note-thumb:hover { transform: scale(1.05); box-shadow: var(--shadow-card, 0 2px 8px rgba(0,0,0,0.1)); }
.note-input { display: flex; gap: 8px; border-radius: 6px; transition: outline 0.15s; }
/* R41: 拖拽进入高亮 */
.note-input--drag-over { outline: 2px dashed var(--el-color-primary); outline-offset: 4px; }
.note-input .el-input { flex: 1; }
.note-pending {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border: 1px dashed var(--el-color-primary);
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
}
.note-pending-img { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; }

.file-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }

/* R58-6: 客户 QQ 跳转 + 复制 */
.client-qq-row { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.client-qq-row .el-button { padding: 2px 6px; height: auto; }

/* ─── SPEC-003: 附加工作项 ─── */
.extra-count { font-size: 12px; color: var(--text-secondary); }
.extra-list { display: flex; flex-direction: column; gap: 4px; }
.extra-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background 0.15s;
}
.extra-item:hover { background: var(--el-fill-color-light); }
.extra-info { flex: 1; min-width: 0; }
.extra-name { font-size: 14px; color: var(--text-primary); }
.extra-desc { display: block; font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.extra-price { font-size: 14px; font-weight: 600; color: var(--text-primary); flex-shrink: 0; }
/* 悬停显示删除（触屏常驻，与 .tl-delete 交互一致 C56） */
.extra-delete { opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.extra-item:hover .extra-delete { opacity: 1; }
@media (hover: none) { .extra-delete { opacity: 1; } }
.extra-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.extra-total { font-size: 13px; color: var(--text-secondary); }
.extra-total strong { color: var(--text-primary); }
.extra-auto-hint { font-size: 12px; color: var(--text-secondary); margin-top: 8px; }

/* ─── plan-node-speech：客户沟通 ─── */
.comm-body { display: flex; flex-direction: column; gap: 10px; }
.comm-row { display: flex; align-items: baseline; gap: 8px; font-size: 14px; }
.comm-label { color: var(--text-secondary); flex-shrink: 0; }
.comm-value { color: var(--text-primary); font-weight: 600; }
.comm-speech {
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
}
.comm-speech-text {
  font-size: 14px; line-height: 1.7; color: var(--text-primary);
  white-space: pre-wrap; word-break: break-word;
}
.comm-copy-btn { align-self: flex-start; }

/* ─── B7: 额度池收款区 ─── */
.pool-summary { margin-bottom: 16px; }
.pool-nums { display: flex; align-items: baseline; gap: 6px; font-size: 14px; color: var(--text-secondary); flex-wrap: wrap; }
.pool-nums strong { color: var(--text-primary); font-size: 16px; }
.pool-remaining { margin-left: auto; }
.pool-flow { margin-top: 12px; }
.pool-flow-title, .pool-ref-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin: 0 0 8px; }
.pool-flow-row {
  display: flex; align-items: center; gap: 10px; padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter); font-size: 13px;
}
.pool-flow-row:last-child { border-bottom: none; }
.pool-flow-date { color: var(--text-secondary); flex-shrink: 0; width: 80px; }
.pool-flow-amount { font-weight: 600; flex-shrink: 0; min-width: 80px; }
.pool-flow-amount.is-positive { color: var(--el-color-success); }
.pool-flow-amount.is-negative { color: var(--el-color-danger); }
.pool-flow-note { flex: 1; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pool-ref { margin-top: 16px; }
.pool-ref-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.pool-ref-icon { width: 18px; text-align: center; flex-shrink: 0; }
.pool-ref-name { flex: 1; color: var(--text-primary); }
.pool-ref-amount { color: var(--text-secondary); flex-shrink: 0; }
</style>
