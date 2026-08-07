<template>
  <ArtistLayout>
    <el-page-header @back="goBack" :title="backTitle" :content="order ? `${$t('orderDetail.orderNo')}${order.order_no}` : ''" />

    <div v-if="order" class="order-detail">
      <!-- 基本信息（v0.38: CardHead 朱砂 mark 卡头） -->
      <el-card class="od-card">
        <template #header>
          <CardHead :title="$t('orderDetail.orderInfo')">
            <template #extra>
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
      <el-card class="od-card date-card">
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
            <span class="track-on-hint-text">{{ $t('orderDetail.enableTrackingHint') }}</span>
            <el-button size="small" type="primary" plain :loading="trackOnLoading" @click="enableTracking">{{ $t('orderDetail.enableTracking') }}</el-button>
          </div>
        </template>
      </el-card>

      <!-- v0.31 F5 + REQ-025 二阶段: 待收横幅——主信息订单级总待收(remainingCents=总价−已收)，
           副信息当前节点（第一个 remaining>0 的节点，无节点订单则只显示总额）；点击跳转收款区 -->
      <div v-if="!isTerminal && remainingCents > 0" class="next-due-banner" @click="scrollToPayment">
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
              @pointerdown="onSlideStart"
              @pointermove="onSlideMove"
              @pointerup="onSlideEnd"
              @pointercancel="closeSlideCancel"
            >
              →
            </div>
          </div>
          <el-button text size="small" @click="closeSlideCancel">✕</el-button>
        </div>

        <!-- 常规操作按钮 -->
        <div v-else class="action-bar">
          <!-- 有工作流：推进 / 打回 / 交付（方案 B：done 状态补交付入口，修复卡死）；T3: 飞行中本按钮 loading、兄弟按钮 disabled -->
          <template v-if="hasWorkflow">
            <el-button v-if="canAdvanceStage" type="primary" :loading="statusAction === 'advance'" :disabled="statusAction !== '' && statusAction !== 'advance'" @click="advanceStage">
              {{ $t('orderDetail.advanceTo') }}{{ nextStageName }}
            </el-button>
            <el-button v-if="canBackStage" type="warning" plain :loading="statusAction === 'back'" :disabled="statusAction !== '' && statusAction !== 'back'" @click="backStage">{{ $t('orderDetail.stageBack') }}</el-button>
            <el-button v-if="order.status === 'done'" type="success" @click="openDeliverDialog">{{ $t('orderDetail.uploadDeliver') }}</el-button>
          </template>
          <!-- 无工作流：固定状态按钮（原逻辑不变，仅位置收敛）；T3: 飞行中目标按钮 loading，其余 disabled -->
          <template v-else>
            <el-button v-if="order.status === 'pending'" type="primary" :loading="statusAction === 'confirmed'" :disabled="statusAction !== '' && statusAction !== 'confirmed'" @click="changeStatus('confirmed')">{{ $t('orderDetail.confirmOrder') }}</el-button>
            <el-button v-if="order.status === 'confirmed'" type="warning" :loading="statusAction === 'wip'" :disabled="statusAction !== '' && statusAction !== 'wip'" @click="changeStatus('wip')">{{ $t('orderDetail.startWip') }}</el-button>
            <el-button v-if="order.status === 'wip'" :loading="statusAction === 'revision'" :disabled="statusAction !== '' && statusAction !== 'revision'" @click="changeStatus('revision')">{{ $t('orderDetail.needRevision') }}</el-button>
            <el-button v-if="['wip','revision'].includes(order.status)" type="success" :loading="statusAction === 'done'" :disabled="statusAction !== '' && statusAction !== 'done'" @click="changeStatus('done')">{{ $t('orderDetail.markDone') }}</el-button>
            <el-button v-if="order.status === 'done'" type="success" @click="openDeliverDialog">{{ $t('orderDetail.uploadDeliver') }}</el-button>
          </template>
          <!-- 取消订单：固定在右侧 -->
          <el-button type="danger" plain class="action-cancel" @click="openSlideCancel">{{ $t('orderDetail.cancelOrder') }}</el-button>
        </div>
      </el-card>

      <!-- R18: 订单图库（参考图 + 画师加图，点击设焦点） -->
      <el-card class="od-card">
        <template #header>
          <CardHead :title="$t('orderDetail.gallery')">
            <template #extra>
              <span class="gallery-count">{{ order.references?.length || 0 }} / 20</span>
            </template>
          </CardHead>
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
              <!-- R44: 悬停操作组——✓设焦点（C56 手机端常驻）+ 删除；预览按钮已移除（单击图片即预览） -->
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
            @dragenter.capture="guardDragEnter"
            @dragover.capture="guardDragOver"
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
      <el-card class="od-card">
        <template #header>
          <CardHead :title="$t('orderDetail.timelineTitle')">
            <template #extra>
              <span class="timeline-count">{{ $t('orderDetail.noteCount', { n: order.notes?.length || 0 }) }}</span>
            </template>
          </CardHead>
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
                <span class="tl-type">{{ note.created_by === 'system' ? $t('orderDetail.tlTypeSystem') : (note.image_path ? $t('orderDetail.tlTypeImage') : $t('orderDetail.tlTypeNote')) }}</span>
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
        <InkEmpty v-else :title="$t('orderDetail.noNotes')" />
        <!-- 添加备注输入框（R40：移到时间线底部） -->
        <div
          class="note-input"
          :class="{ 'note-input--drag-over': isNoteDragOver }"
          @dragenter.capture="guardDragEnter"
          @dragover.capture="guardDragOver"
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

      <!-- v0.31 REQ-021 F1: 操作记录（操作日志时间线，分页 + 类型筛选） -->
      <el-card class="od-card">
        <template #header>
          <CardHead :title="$t('orderDetail.logTitle')">
            <template #extra>
              <el-select v-model="logTypeFilter" size="small" style="width: 140px" @change="onLogTypeChange">
                <el-option :label="$t('orderDetail.logTypeAll')" value="" />
                <el-option v-for="lt in logTypeOptions" :key="lt.value" :label="lt.label" :value="lt.value" />
              </el-select>
            </template>
          </CardHead>
        </template>
        <div v-loading="logLoading">
          <el-timeline v-if="logs.length" class="activity-timeline">
            <el-timeline-item
              v-for="log in logs" :key="log.id"
              :type="logTagType(log.action_type)"
              :timestamp="formatDate(log.created_at)" placement="top"
            >
              <div class="log-item">
                <div class="log-head">
                  <el-tag :type="logTagType(log.action_type)" size="small">{{ $t(`orderDetail.logType.${log.action_type}`) }}</el-tag>
                  <span class="log-actor">{{ logActorName(log.actor) }}</span>
                </div>
                <div class="log-detail">{{ formatLogDetail(log) }}</div>
              </div>
            </el-timeline-item>
          </el-timeline>
          <InkEmpty v-else-if="!logLoading" :title="$t('orderDetail.logEmpty')" />
          <div v-if="logTotal > logPageSize" class="log-pagination">
            <el-pagination
              :current-page="logPage" :page-size="logPageSize" :total="logTotal"
              layout="total, prev, pager, next" small
              @current-change="onLogPageChange"
            />
          </div>
        </div>
      </el-card>

      <!-- SPEC-003: 附加工作项（添加/删除后 final_price_cents 自动重算） -->
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
              :title="$t('orderDetail.extraDelete')"
              @click="deleteExtraItem(item)"
            >
              ✕
            </el-button>
          </div>
        </div>
        <InkEmpty v-else :title="$t('orderDetail.extraEmpty')" />
        <div class="extra-footer">
          <el-button v-if="!isTerminal" size="small" @click="openExtraDialog" :disabled="order.extraItems?.length >= 20">
            + {{ $t('orderDetail.extraAdd') }}
          </el-button>
          <span v-if="order.final_price_cents != null" class="extra-total">
            {{ $t('orderDetail.extraTotal') }} ¥{{ formatCents(order.final_price_cents) }}
          </span>
          <!-- v0.31 五号方案A：改价按钮（后端 PUT /price 已有，前端首次接通） -->
          <el-button v-if="!isTerminal" size="small" text type="primary" @click="openPriceDialog">
            {{ $t('orderDetail.priceEditBtn') }}
          </el-button>
        </div>
        <p v-if="order.extraItems?.length" class="extra-auto-hint">{{ $t('orderDetail.extraAutoHint') }}</p>
      </el-card>

      <!-- plan-node-speech：客户沟通（QQ + 价格小结 + 话术预览 + 复制唤起QQ） -->
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

      <!-- B7: 额度池收款记录 -->
      <el-card class="od-card">
        <template #header>
          <CardHead :title="$t('orderDetail.payTitle')">
            <template #extra>
              <el-button type="primary" size="small" @click="payDialogVisible = true">{{ $t('orderDetail.payAddBtn') }}</el-button>
            </template>
          </CardHead>
        </template>
        <div v-loading="paymentsLoading">
          <!-- 已收 / 应收 / 待收 + 进度条 -->
          <div class="pool-summary">
            <div class="pool-nums">
              <span>{{ $t('orderDetail.payPaid') }} <strong>¥{{ formatCents(poolPaidCents) }}</strong></span>
              <span>/ {{ $t('orderDetail.payFinal') }} <strong>¥{{ formatCents(poolFinalCents) }}</strong></span>
              <!-- P2: 多收时以"多收 ¥X"替代"待收 ¥0" -->
              <span class="pool-remaining" :class="{ 'pool-overpaid': poolOverpaidCents > 0 }">
                {{ poolOverpaidCents > 0 ? $t('orderDetail.payOverpaid') : $t('orderDetail.payRemaining') }}
                <strong>¥{{ formatCents(poolOverpaidCents > 0 ? poolOverpaidCents : poolRemainingCents) }}</strong>
              </span>
            </div>
            <el-progress :percentage="poolPercent" :stroke-width="12" :color="poolPercent >= 100 ? 'var(--sl)' : 'var(--hq)'" style="margin-top: 8px" />
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
          <InkEmpty v-else-if="!paymentsLoading" :title="$t('orderDetail.payEmpty')" />

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
      <el-card class="od-card" v-if="order.deliverables?.length">
        <template #header>
          <CardHead :title="$t('orderDetail.deliverFiles')">
            <template #extra>
              <!-- REQ-022 F1: 发布为作品入口（仅 delivered 显示；done=半终态无入口） -->
              <el-button
                v-if="order.status === 'delivered'"
                size="small" type="primary" plain
                @click="openPublishDialog"
              >
                {{ $t('orderDetail.publishArtwork') }}
              </el-button>
            </template>
          </CardHead>
        </template>
        <div v-for="d in order.deliverables" :key="d.id" class="file-item">
          <span>{{ d.original_name }}</span>
          <el-button size="small" @click="openFile(d.url)">{{ $t('common.download') }}</el-button>
        </div>
      </el-card>
    </div>

    <!-- 交付弹窗（方案 B：含无文件交付，DeliverDialog 复用） -->
    <DeliverDialog v-model="showDeliver" :order-id="route.params.id" @delivered="onDelivered" />

    <!-- REQ-022 F1: 发布为作品弹窗（仅 delivered；勾选图片默认全选，非图片置灰） -->
    <el-dialog v-model="publishDialogVisible" :title="$t('orderDetail.publishDialogTitle')" width="560px">
      <div v-if="!publishing">
        <div class="publish-hint">{{ $t('orderDetail.publishHint') }}</div>
        <el-checkbox-group v-model="publishForm.deliverableIds" class="publish-list">
          <div
            v-for="d in order.deliverables"
            :key="d.id"
            class="publish-item"
            :class="{ 'publish-item--disabled': !isPublishableImage(d) }"
          >
            <el-checkbox :value="d.id" :disabled="!isPublishableImage(d)">
              <span class="publish-file-name">{{ d.original_name }}</span>
            </el-checkbox>
            <el-tag v-if="!isPublishableImage(d)" size="small" type="info">{{ $t('orderDetail.publishNotImage') }}</el-tag>
          </div>
        </el-checkbox-group>
        <el-form label-position="top" style="margin-top: 12px">
          <el-form-item :label="$t('orderDetail.publishTitleLabel')" required>
            <el-input
              v-model="publishForm.title"
              :placeholder="$t('orderDetail.publishTitlePlaceholder')"
              maxlength="100" show-word-limit
            />
          </el-form-item>
          <el-form-item :label="$t('orderDetail.publishDescLabel')">
            <el-input
              v-model="publishForm.description"
              type="textarea" :rows="3"
              :placeholder="$t('orderDetail.publishDescPlaceholder')"
              maxlength="500" show-word-limit
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="publishDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!publishForm.deliverableIds.length || !publishForm.title.trim()"
          :loading="publishing"
          @click="submitPublish"
        >
          {{ $t('orderDetail.publishSubmit') }}
        </el-button>
      </template>
    </el-dialog>

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
            :min="0.01" :max="nodePayTarget?.remainingCents > 0 ? nodePayTarget.remainingCents / 100 : 999999.99" :precision="2" :step="50"
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
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Picture } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import OrderTimeline from '../../components/shared/OrderTimeline.vue'
import DeliverDialog from '../../components/artist/DeliverDialog.vue'
// v0.38: 统一视觉组件（REQ-026 §二）
import CardHead from '../../components/artist/visual/CardHead.vue'
import StatusChip from '../../components/artist/visual/StatusChip.vue'
import InkEmpty from '../../components/artist/visual/InkEmpty.vue'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import { useSignatureRefresh } from '../../composables/useSignatureRefresh.js'
import { useSlideConfirm } from '../../composables/useSlideConfirm.js'
import { useActivityLog } from '../../composables/useActivityLog.js'
import { formatDateTime } from '../../utils/datetime.js'
// v0.40 瘦身批：script 4 区块抽 composable（零行为变化）
import { useOrderWorkflow } from '../../composables/useOrderWorkflow.js'
import { useOrderGallery } from '../../composables/useOrderGallery.js'
import { useOrderDeadline } from '../../composables/useOrderDeadline.js'
import { useOrderPaymentPanel } from '../../composables/useOrderPaymentPanel.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const order = ref(null)
const prevPriority = ref(null)
const newNote = ref('')
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

// ─── 瘦身批装配（v0.40）：4 区块抽 composable，零行为变化 ───
const statusAction = ref('')  // 从 L1051 提前，workflow/changeStatus 共享
const { hasWorkflow, isTerminal, workflowStages, currentStageIdx, stageProgress, nextStage, nextStageName,
  canAdvanceStage, canBackStage, advanceStage, backStage, turnOffStageTracking,
  trackOnLoading, enableTracking, loadWorkflowStages } =
  useOrderWorkflow({ order, routeId: route.params.id, statusAction })
const {
  galleryInputEl, galleryUploading, isGalleryDragOver, galleryViewerVisible, galleryViewerIndex,
  openGalleryViewer, triggerGalleryUpload, handleGalleryFileSelect, handleGalleryDrop,
  guardDragEnter, guardDragOver, guardDrop, selectFocusImage, uploadGalleryFiles, validateImageFile
} = useOrderGallery({ order, routeId: route.params.id, onRefresh: loadOrder })
const { daysLeft, deadlineChip, deadlinePicker, disableDeadlineDate, disableStartDateDate, changeDeadline, startDatePicker, changeStartDate } =
  useOrderDeadline({ order, routeId: route.params.id })
const {
  payments, paymentsLoading, paymentSubmitting, loadPayments,
  payDialogVisible, payForm, submitPayment, nodePayDialogVisible, nodePayTarget, nodePayForm,
  openNodePayDialog, submitNodePayment, handleRevokePayment,
  poolPaidCents, poolFinalCents, poolRemainingCents, poolPercent, poolOverpaidCents,
  installmentRefs, nextDueInstallment, remainingCents, scrollToPayment
} = useOrderPaymentPanel({ order, routeId: route.params.id, onRefresh: loadOrder })

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

// T3: 状态变更共享守卫——推进/打回/固定状态按钮快速连点会重复发请求。
// statusAction 记录飞行动作（''=空闲；'advance'/'back'/目标状态值），精准控制哪个按钮转 loading
// （statusAction ref 定义已提前到瘦身批装配处，workflow composable 与 changeStatus 共享）

async function changeStatus(status) {
  if (statusAction.value) return
  statusAction.value = status
  try {
    order.value = await artistApi.updateStatus(route.params.id, status)
    ElMessage.success(t('orderDetail.statusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    statusAction.value = ''
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
  if (!guardDrop(event)) return // G1: 页内图拖入 → 拒绝 + 警告（dragover 已拦，此处兜底）
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
  // T2: Enter 路径与按钮共用 addNote，按钮有 :loading 防连点，Enter 没有——统一在此拦截
  if (noteSubmitting.value) return
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

// 打开交付弹窗（方案 B：DeliverDialog 组件内自管状态重置；看板 ?deliver=1 跳转时自动弹）
function openDeliverDialog() {
  showDeliver.value = true
}

// 交付成功回调（DeliverDialog emit delivered，回传最新订单）
function onDelivered(updated) {
  order.value = updated
}

// ─── REQ-022 F1: 发布为作品（delivered 门槛，一图一作品，发布不锁订单可重复） ───
const publishDialogVisible = ref(false)
const publishing = ref(false)
const publishForm = reactive({ deliverableIds: [], title: '', description: '' })

/** 可发布的图片扩展名（对齐后端 PUBLISH_ALLOWED_EXTS；zip/psd 等不可发布） */
const PUBLISH_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

function isPublishableImage(d) {
  const name = d?.original_name || d?.file_path || ''
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return PUBLISH_IMAGE_EXTS.includes(name.slice(dot).toLowerCase())
}

function openPublishDialog() {
  // 默认全选图片交付物（非图片置灰不可勾）
  publishForm.deliverableIds = (order.value?.deliverables || []).filter(isPublishableImage).map(d => d.id)
  publishForm.title = ''
  publishForm.description = ''
  publishDialogVisible.value = true
}

async function submitPublish() {
  if (!publishForm.deliverableIds.length || !publishForm.title.trim()) return
  publishing.value = true
  try {
    const res = await artistApi.publishArtwork(route.params.id, {
      deliverableIds: publishForm.deliverableIds,
      title: publishForm.title.trim(),
      description: publishForm.description.trim() || null
    })
    publishDialogVisible.value = false
    const n = res?.artworks?.length || 0
    ElMessage.success(t('orderDetail.publishSuccess', { n }))
    try {
      await ElMessageBox.confirm(
        t('orderDetail.publishGoManage', { n }),
        t('orderDetail.publishDoneTitle'),
        { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'success' }
      )
      router.push('/artworks')
    } catch { /* 用户取消跳转，留在本页 */ }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    publishing.value = false
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

// ─── v0.31 REQ-021 F1: 操作记录（操作日志时间线） ───
const {
  logs, total: logTotal, page: logPage, pageSize: logPageSize,
  typeFilter: logTypeFilter, loading: logLoading,
  loadLogs, onPageChange: onLogPageChange, onTypeChange: onLogTypeChange
} = useActivityLog(route.params.id)

/** 操作类型 → el-tag / el-timeline-item type 映射 */
const LOG_TAG_TYPE = {
  status_change: 'primary',
  price_change: 'warning',
  extra_item: 'info',
  payment: 'success',
  stage_advance: 'primary',
  note_update: 'info'
}
function logTagType(actionType) {
  return LOG_TAG_TYPE[actionType] || 'info'
}

/** 操作类型筛选选项（全部 + 6 种，computed 保证语言切换后标签更新） */
const logTypeOptions = computed(() =>
  ['status_change', 'price_change', 'payment', 'stage_advance', 'extra_item', 'note_update']
    .map(value => ({ value, label: t(`orderDetail.logType.${value}`) }))
)

/** 操作人展示名 */
function logActorName(actor) {
  if (actor === 'system') return t('orderDetail.logActorSystem')
  if (actor === 'artist') return t('orderDetail.logActorArtist')
  if (actor === 'client') return t('orderDetail.logActorClient')
  return actor
}

/** detail 摘要（按 action_type 格式化，缺字段时安全回退） */
function formatLogDetail(log) {
  const d = log.detail || {}
  switch (log.action_type) {
    case 'status_change':
      return d.from && d.to
        ? t('orderDetail.logDetail.statusChange', { from: t(`common.orderStatus.${d.from}`), to: t(`common.orderStatus.${d.to}`) })
        : ''
    case 'price_change':
      return d.oldCents != null && d.newCents != null
        ? t('orderDetail.logDetail.priceChange', { from: formatCents(d.oldCents), to: formatCents(d.newCents) }) + (d.reason ? ` · ${d.reason}` : '')
        : ''
    case 'extra_item':
      if (d.action === 'add') return t('orderDetail.logDetail.extraAdd', { name: d.name || '' }) + (d.priceCents ? ` ¥${formatCents(d.priceCents)}` : '')
      if (d.action === 'delete') return t('orderDetail.logDetail.extraDelete', { name: d.name || '' })
      return ''
    case 'payment':
      return d.amountCents != null
        ? (d.amountCents < 0
          ? t('orderDetail.logDetail.paymentRevoke', { amount: formatCents(Math.abs(d.amountCents)) })
          : t('orderDetail.logDetail.paymentAdd', { amount: formatCents(d.amountCents) })) + (d.note ? ` · ${d.note}` : '')
        : ''
    case 'stage_advance':
      if (d.action === 'advance') return t('orderDetail.logDetail.stageAdvance', { name: d.stageName || '' })
      if (d.action === 'rollback') return t('orderDetail.logDetail.stageRollback', { from: d.from || '', to: d.to || '' })
      return ''
    case 'note_update':
      if (d.action === 'add') return t('orderDetail.logDetail.noteAdd')
      if (d.action === 'delete') return t('orderDetail.logDetail.noteDelete')
      return ''
    default:
      return ''
  }
}

onMounted(() => {
  loadOrder()
  loadWorkflowStages() // R30d: 流程进度条需要节点列表
  loadPayments(route.params.id) // B7: 额度池收款流水
  loadLogs() // v0.31 REQ-021 F1: 操作记录
})
</script>

<style scoped>
/* ═══ v0.38: 全页换肤到纸墨 token（REQ-026 §二；旧变量不残留——派工 §二.3） ═══ */
/* 页面结构：卡片间距 14px（REQ §1.4） */
.order-detail { display: flex; flex-direction: column; gap: 14px; }

/* 订单号文楷——落款感（REQ §1.3：数字/单号用文楷） */
.od-order-no { font-family: var(--f-d); font-size: 15px; font-weight: 600; letter-spacing: .02em; }

/* ─── v0.38: 日期卡二合一（REQ-026 §四：两字段一卡，交互逻辑不变） ─── */
.date-card-body { display: flex; gap: 28px; flex-wrap: wrap; }
.date-field { display: flex; flex-direction: column; gap: 6px; }
.date-field-label { font-size: 13px; color: var(--ink2); }
.date-card-note { font-size: 12px; color: var(--ink3); margin: 12px 0 0; }

/* ─── R39 方案B：状态区 ─── */
/* 终态只读横幅（已交付=石绿软底 / 已取消=中性，7 色语义一对一） */
.status-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-radius: var(--r-m); font-size: 15px; font-weight: 600;
}
.status-banner--delivered { background: var(--sl-t); }
.status-banner--cancelled { background: color-mix(in srgb, var(--ink3) 12%, transparent); }
.status-banner-text { color: var(--ink); }
/* 最后活动时间 */
.status-last-active { font-size: 12px; color: var(--ink2); margin: 10px 0 0; }
/* 无工作流兜底：状态标签 + 上下文信息 */
.status-fallback { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.status-context { display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; color: var(--ink2); }
/* C53：启用流程跟踪引导（花青软底 + 虚线） */
.track-on-hint {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 14px; padding: 10px 14px;
  background: var(--hq-t); border: 1px dashed color-mix(in srgb, var(--hq) 45%, transparent);
  border-radius: var(--r-m);
}
.track-on-hint-text { font-size: 13px; color: var(--ink2); }

/* ─── R39 方案B：操作条（固定位置） ─── */
/* ─── v0.31 F5: 下一节点应收提示条（藤黄=待办提醒，非逾期不抢朱砂） ─── */
.next-due-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-radius: var(--r-m);
  background: var(--th-t);
  border: 1px solid color-mix(in srgb, var(--th) 45%, transparent);
  cursor: pointer; transition: background 0.15s;
}
.next-due-banner:hover { background: color-mix(in srgb, var(--th) 18%, transparent); }
.next-due-text { flex: 1; font-size: 14px; font-weight: 600; color: var(--th); }
/* REQ-025 二阶段: 当前节点副信息（权重低于总额，不抢主信息） */
.next-due-sub { font-size: 13px; color: var(--ink2); white-space: nowrap; }
.next-due-arrow { font-size: 16px; color: var(--th); }

.action-bar-card :deep(.el-card__body) { padding: 12px 16px; }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.action-cancel { margin-left: auto; }

/* 滑块确认（与 QueueBoard R30e 视觉一致，朱砂=危险操作） */
.slide-confirm-row { display: flex; align-items: center; gap: 8px; }
.slide-confirm {
  position: relative; flex: 1; height: 40px;
  border-radius: 999px; overflow: hidden; user-select: none;
  background: var(--zs-t);
  border: 1px solid color-mix(in srgb, var(--zs) 45%, transparent);
}
.slide-confirm-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: color-mix(in srgb, var(--zs) 28%, transparent);
  transition: width 0.05s linear;
}
.slide-confirm-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: var(--zs);
  pointer-events: none;
}
.slide-confirm-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--zs); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700;
  cursor: grab; touch-action: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.slide-confirm-thumb:active { cursor: grabbing; }

/* ─── R30d: 流程进度 ─── */
.stage-progress-text { font-size: 13px; color: var(--ink2); margin: 12px 0 0; }
.stage-revision-mark { color: var(--th); font-weight: 600; margin-left: 8px; }

/* ─── R18: 订单图库 ─── */
.gallery-count { font-size: 13px; color: var(--ink2); }
.ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.ref-item { display: flex; flex-direction: column; gap: 4px; }
.ref-item--focus .ref-img { outline: 2px solid var(--hq); outline-offset: 2px; }
.ref-img-wrap {
  position: relative;
  cursor: pointer;
  border-radius: var(--r-m);
  overflow: hidden;
  transition: transform 0.15s;
}
.ref-img-wrap:hover { transform: scale(1.02); }
.ref-img { height: 120px; width: 100%; border-radius: var(--r-m); display: block; background: var(--paper2); }
/* R43: 加载骨架屏（防首屏多图白闪） */
.ref-img-skeleton {
  width: 100%; height: 100%;
  background: var(--paper2);
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
  border-radius: var(--r-s);
  line-height: 1.5;
  pointer-events: none;
}
.ref-source-badge--client { background: rgba(0, 0, 0, 0.55); color: #fff; }
.ref-source-badge--artist { background: var(--hq); color: #fff; }
/* 焦点指示 */
.ref-focus-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--hq);
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
  border: 2px dashed var(--line2);
  border-radius: var(--r-m);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  color: var(--ink2);
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.ref-upload-tile:hover, .ref-upload-tile--active {
  border-color: var(--hq);
  background: var(--hq-t);
  color: var(--hq);
}
.ref-upload-text { font-size: 12px; }
.upload-status { font-size: 12px; color: var(--hq); margin: 8px 0 0; }
.upload-error { font-size: 12px; color: var(--zs); margin: 8px 0 0; }
.no-refs { color: var(--ink2); font-size: 13px; margin: 0; }
.focus-hint { font-size: 12px; color: var(--ink3); margin: 12px 0 0; }

/* R17: 优先级分段按钮配色（选中态由 Element Plus 内部 is-checked 控制） */
.priority-group :deep(.prio-high.is-checked .el-radio-button__inner) { background: var(--zs); border-color: var(--zs); box-shadow: -1px 0 0 0 var(--zs); }
.priority-group :deep(.prio-medium.is-checked .el-radio-button__inner) { background: var(--th); border-color: var(--th); box-shadow: -1px 0 0 0 var(--th); }
.priority-group :deep(.prio-low.is-checked .el-radio-button__inner) { background: var(--sl); border-color: var(--sl); box-shadow: -1px 0 0 0 var(--sl); }

/* ─── R40: 活动时间线 ─── */
.timeline-count { font-size: 13px; color: var(--ink2); }
.activity-timeline { padding-top: 4px; }
.tl-item { position: relative; }
.tl-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tl-type { font-size: 12px; font-weight: 600; color: var(--ink2); }
.tl-item--system .tl-content { color: var(--ink2); font-size: 13px; }
.tl-content { font-size: 14px; color: var(--ink); line-height: 1.6; word-break: break-word; }
/* R46: 删除按钮悬停显示（触屏常驻，与参考图 .ref-hover-actions 交互一致 C56） */
.tl-delete { opacity: 0; transition: opacity 0.15s; margin-left: auto; }
.tl-item:hover .tl-delete { opacity: 1; }
@media (hover: none) {
  .tl-delete { opacity: 1; }
}
/* ─── v0.31 REQ-021 F1: 操作记录 ─── */
.log-item { position: relative; }
.log-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.log-actor { font-size: 12px; color: var(--ink2); }
.log-detail { font-size: 13px; color: var(--ink); line-height: 1.6; word-break: break-word; }
.log-pagination { display: flex; justify-content: center; margin-top: 12px; }
.note-thumb {
  display: block;
  margin-top: 6px;
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: var(--r-m);
  cursor: zoom-in;
  border: 1px solid var(--line);
  background: var(--paper2);
  transition: transform 0.15s, box-shadow 0.15s;
}
.note-thumb:hover { transform: scale(1.05); box-shadow: var(--sh-2); }
.note-input { display: flex; gap: 8px; border-radius: var(--r-m); transition: outline 0.15s; }
/* R41: 拖拽进入高亮 */
.note-input--drag-over { outline: 2px dashed var(--hq); outline-offset: 4px; }
.note-input .el-input { flex: 1; }
.note-pending {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border: 1px dashed var(--hq);
  border-radius: var(--r-m);
  background: var(--hq-t);
}
.note-pending-img { width: 48px; height: 48px; object-fit: cover; border-radius: var(--r-s); }

.file-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }

/* REQ-022 F1: 发布为作品弹窗 */
.publish-hint { font-size: 12px; color: var(--ink2); margin-bottom: 10px; }
.publish-list { display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow-y: auto; }
.publish-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 6px 8px; border-radius: var(--r-s);
}
.publish-item:hover { background: var(--paper2); }
.publish-item--disabled { opacity: 0.55; }
.publish-file-name { font-size: 13px; color: var(--ink); word-break: break-all; }

/* R58-6: 客户 QQ 跳转 + 复制 */
.client-qq-row { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.client-qq-row .el-button { padding: 2px 6px; height: auto; }

/* ─── SPEC-003: 附加工作项 ─── */
.extra-count { font-size: 12px; color: var(--ink2); }
.extra-list { display: flex; flex-direction: column; gap: 4px; }
.extra-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: var(--r-m);
  transition: background 0.15s;
}
.extra-item:hover { background: var(--paper2); }
.extra-info { flex: 1; min-width: 0; }
.extra-name { font-size: 14px; color: var(--ink); }
.extra-desc { display: block; font-size: 12px; color: var(--ink2); margin-top: 2px; }
/* 金额等宽（REQ §二：金额右对齐等宽字体） */
.extra-price { font-size: 14px; font-weight: 600; color: var(--ink); flex-shrink: 0; font-variant-numeric: tabular-nums; }
/* 悬停显示删除（触屏常驻，与 .tl-delete 交互一致 C56） */
.extra-delete { opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.extra-item:hover .extra-delete { opacity: 1; }
@media (hover: none) { .extra-delete { opacity: 1; } }
.extra-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.extra-total { font-size: 13px; color: var(--ink2); }
.extra-total strong { color: var(--ink); font-family: var(--f-d); }
.extra-auto-hint { font-size: 12px; color: var(--ink3); margin-top: 8px; }

/* ─── plan-node-speech：客户沟通 ─── */
.comm-body { display: flex; flex-direction: column; gap: 10px; }
.comm-row { display: flex; align-items: baseline; gap: 8px; font-size: 14px; }
.comm-label { color: var(--ink2); flex-shrink: 0; }
.comm-value { color: var(--ink); font-weight: 600; }
.comm-speech {
  padding: 10px 14px;
  border-radius: var(--r-m);
  background: var(--hq-t);
  border-left: 3px solid var(--hq);
}
.comm-speech-text {
  font-size: 14px; line-height: 1.7; color: var(--ink);
  white-space: pre-wrap; word-break: break-word;
}
.comm-copy-btn { align-self: flex-start; }

/* ─── B7: 额度池收款区 ─── */
.pool-summary { margin-bottom: 16px; }
.pool-nums { display: flex; align-items: baseline; gap: 6px; font-size: 14px; color: var(--ink2); flex-wrap: wrap; }
.pool-nums strong { color: var(--ink); font-size: 16px; font-family: var(--f-d); font-variant-numeric: tabular-nums; }
.pool-remaining { margin-left: auto; }
/* P2: 多收（客户多付）——藤黄提示，区别于正常的待收 */
.pool-overpaid { color: var(--th); }
.pool-overpaid strong { color: var(--th); }
.pool-flow { margin-top: 12px; }
.pool-flow-title, .pool-ref-title { font-size: 13px; font-weight: 600; color: var(--ink2); margin: 0 0 8px; }
.pool-flow-row {
  display: flex; align-items: center; gap: 10px; padding: 6px 0;
  border-bottom: 1px solid var(--line); font-size: 13px;
}
.pool-flow-row:last-child { border-bottom: none; }
.pool-flow-date { color: var(--ink2); flex-shrink: 0; width: 80px; font-variant-numeric: tabular-nums; }
.pool-flow-amount { font-weight: 600; flex-shrink: 0; min-width: 80px; font-variant-numeric: tabular-nums; }
.pool-flow-amount.is-positive { color: var(--sl); }
.pool-flow-amount.is-negative { color: var(--zs); }
.pool-flow-note { flex: 1; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pool-ref { margin-top: 16px; }
.pool-ref-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.pool-ref-icon { width: 18px; text-align: center; flex-shrink: 0; }
.pool-ref-name { flex: 1; color: var(--ink); }
.pool-ref-amount { color: var(--ink2); flex-shrink: 0; }
</style>
