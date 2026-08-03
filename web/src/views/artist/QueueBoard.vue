<template>
  <ArtistLayout>
    <h2>{{ $t('queue.title') }}</h2>
    <p class="hint">{{ $t('queue.hint') }}</p>

    <!-- SPEC-005: 视图切换（列表 / 月历 / 时间条），默认视图存 localStorage -->
    <div class="view-switch">
      <el-radio-group v-model="viewMode" size="default" @change="saveViewMode">
        <el-radio-button value="board">{{ $t('queue.viewBoard') }}</el-radio-button>
        <el-radio-button value="calendar">{{ $t('queue.viewCalendar') }}</el-radio-button>
        <el-radio-button value="timeline">{{ $t('queue.viewTimeline') }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- ═══ 列表视图（原有看板） ═══ -->
    <template v-if="viewMode === 'board'">
      <!-- R20: 焦点图显示模式（全局设置，存 localStorage；仅 无/大 两态） -->
      <div class="queue-toolbar">
        <span class="toolbar-label">{{ $t('queue.focusDisplay') }}</span>
        <el-radio-group v-model="focusDisplay" size="small" @change="saveFocusDisplay">
          <el-radio-button value="off">{{ $t('queue.focusOff') }}</el-radio-button>
          <el-radio-button value="large">{{ $t('queue.focusLarge') }}</el-radio-button>
        </el-radio-group>
      </div>

      <!-- P0-3b: 标签切换（正式区 / 缓冲区） -->
      <el-tabs v-model="activeTab" class="queue-tabs">
        <el-tab-pane :label="$t('queue.tabFormal')" name="formal">
          <div class="queue-container" v-loading="loading">
            <draggable
              v-model="queue"
              item-key="id"
              handle=".drag-handle"
              ghost-class="ghost"
              @end="onDragEnd"
              class="queue-list"
            >
              <template #item="{ element }">
                <div
                  class="queue-item"
                  :class="`priority-${element.priority}`"
                  @pointerdown="onCardPointerDown"
                  @pointerup="(e) => onCardPointerUp(e, element)"
                >
                  <div class="drag-handle" :title="$t('queue.dragHint')" aria-hidden="true">⠿</div>
                  <!-- 焦点图区域：大图模式显示焦点图，无焦点图时显示空态上传入口 -->
                  <div v-if="focusDisplay === 'large'" class="focus-area">
                    <!-- R53: 已有焦点图 — 点击选文件 / 拖拽图片替换（复用 uploadAndSetFocus；
                   移除 preview-src-list 避免 el-image 内置预览吞掉点击，R18 同款陷阱） -->
                    <div
                      v-if="element.focus_image_path"
                      class="focus-img-wrap"
                      :class="{ 'focus-img-wrap--active': focusDragId === element.id }"
                      @click="triggerFocusUpload(element)"
                      @dragover.prevent="focusDragId = element.id"
                      @dragleave="onFocusDragLeave($event, element)"
                      @drop.prevent="handleFocusDrop($event, element)"
                    >
                      <el-image
                        :src="element.focusImageUrl" fit="cover" class="focus-large-img"
                        :alt="$t('orderDetail.referenceImage')"
                        lazy decoding="async"
                        @error="() => refreshNow(element.focus_image_path)"
                      />
                      <div v-if="focusDragId === element.id" class="focus-replace-overlay">
                        <span>{{ $t('queue.dropToReplace') }}</span>
                      </div>
                    </div>
                    <!-- 空态上传：点击选文件 / 拖拽图片放入，上传后直接设为焦点图 -->
                    <div
                      v-else
                      class="focus-empty"
                      :class="{ 'focus-empty--active': focusDragId === element.id }"
                      @click="triggerFocusUpload(element)"
                      @dragover.prevent="focusDragId = element.id"
                      @dragleave="onFocusDragLeave($event, element)"
                      @drop.prevent="handleFocusDrop($event, element)"
                    >
                      <el-icon :size="20"><Plus /></el-icon>
                      <span class="focus-empty-text">{{ $t('queue.uploadFocus') }}</span>
                    </div>
                  </div>
                  <div class="item-body">
                    <div class="item-header">
                      <span class="order-no">#{{ element.order_no }}</span>
                      <el-tag :type="priorityType(element.priority)" size="small" effect="dark">
                        {{ $t(`common.priority.${element.priority}`) }}
                      </el-tag>
                      <el-tag :type="statusType(element.status)" size="small">
                        {{ $t(`common.orderStatus.${element.status}`) }}
                      </el-tag>
                      <!-- R30d: 当前流程节点名（打回时带 ↩ 标记） -->
                      <el-tag v-if="element.currentStageId != null" type="info" size="small" effect="plain" class="stage-tag">
                        {{ element.status === 'revision' ? '↩ ' : '' }}{{ element.currentStageName }}
                      </el-tag>
                    </div>
                    <div class="item-info">
                      <span>{{ element.tier_name || $t('common.custom') }}</span>
                      <span>·</span>
                      <span>QQ: {{ element.client_qq }}</span>
                      <span v-if="element.client_name">· {{ element.client_name }}</span>
                    </div>
                    <div class="item-desc" v-if="element.description">
                      {{ element.description.slice(0, 60) }}{{ element.description.length > 60 ? '...' : '' }}
                    </div>
                  </div>
                  <div class="item-actions">
                    <!-- R30d: 接入流程的订单 → "推进到下一节点"（替代固定状态按钮） -->
                    <el-button
                      v-if="element.currentStageId != null && canAdvance(element)"
                      size="small" type="primary"
                      @click="advanceOrderStage(element)"
                    >
                      {{ $t('queue.advanceStage') }}
                    </el-button>
                    <!-- REQ-013 #7: 工作流订单到达最后节点(done) → "去交付"跳转详情页（交付需上传文件） -->
                    <el-button
                      v-else-if="element.currentStageId != null && element.status === 'done'"
                      size="small" type="success"
                      @click="openDeliverFor(element)"
                    >
                      {{ $t('queue.goDeliver') }}
                    </el-button>
                    <!-- R30b: 未接入流程的订单 → 固定状态主操作外露（Bug 4: 工作流订单不穿透到此按钮） -->
                    <el-button
                      v-else-if="element.currentStageId == null && nextAction(element.status)"
                      size="small"
                      :type="nextAction(element.status).type"
                      @click="quickAction(nextAction(element.status).command, element)"
                    >
                      {{ $t(nextAction(element.status).labelKey) }}
                    </el-button>
                    <el-button size="small" @click="$router.push(`/orders/${element.id}?from=queue`)">{{ $t('common.detail') }}</el-button>
                    <el-dropdown trigger="click" @command="(cmd) => quickAction(cmd, element)">
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

                  <!-- R30e: 取消订单滑块确认（替代普通弹窗，防误触） -->
                  <div v-if="cancellingId === element.id" class="slide-cancel-row">
                    <div class="slide-cancel">
                      <div class="slide-cancel-fill" :style="{ width: `calc(${slideProgress} * 100%)` }"></div>
                      <span class="slide-cancel-label">{{ $t('queue.slideToCancel') }}</span>
                      <div
                        class="slide-cancel-thumb"
                        :style="{ left: `calc(2px + ${slideProgress} * (100% - 40px))` }"
                        @pointerdown="onSlideStart"
                        @pointermove="onSlideMove"
                        @pointerup="(e) => onSlideEnd(e, element)"
                      >
                        →
                      </div>
                    </div>
                    <el-button text size="small" @click="closeSlideCancel">✕</el-button>
                  </div>
                </div>
              </template>
            </draggable>

            <el-empty v-if="!loading && queue.length === 0" :description="$t('queue.empty')" />
          </div>

          <!-- REQ-013 #7: 完成区（留在正式区标签内，不随标签切换） -->
          <template v-if="completedQueue.length || completedLoading">
            <h3 class="completed-title">{{ $t('queue.completedTitle') }}</h3>
            <p class="completed-hint">{{ $t('queue.completedHint') }}</p>
            <div class="queue-container" v-loading="completedLoading">
              <div class="queue-list">
                <div
                  v-for="element in completedQueue" :key="element.id"
                  class="queue-item completed-item"
                >
                  <div class="item-body">
                    <div class="item-header">
                      <span class="order-no">#{{ element.order_no }}</span>
                      <el-tag type="success" size="small">{{ $t('common.orderStatus.delivered') }}</el-tag>
                      <el-tag v-if="element.currentStageId != null" type="info" size="small" effect="plain" class="stage-tag">
                        {{ element.currentStageName }}
                      </el-tag>
                    </div>
                    <div class="item-info">
                      <span>{{ element.tier_name || $t('common.custom') }}</span>
                      <span>·</span>
                      <span>QQ: {{ element.client_qq }}</span>
                      <span v-if="element.client_name">· {{ element.client_name }}</span>
                    </div>
                  </div>
                  <div class="item-actions">
                    <el-button size="small" @click="$router.push(`/orders/${element.id}?from=queue`)">{{ $t('common.detail') }}</el-button>
                  </div>
                </div>
              </div>
              <el-empty v-if="!completedLoading && completedQueue.length === 0" :description="$t('queue.completedEmpty')" />
            </div>
          </template>
        </el-tab-pane>

        <!-- P0-3b: 缓冲区标签 -->
        <el-tab-pane :label="$t('queue.tabBuffer')" name="buffer">
          <p class="buffer-hint">{{ $t('queue.bufferHint') }}</p>
          <div class="queue-container" v-loading="bufferLoading">
            <div class="queue-list">
              <div
                v-for="element in bufferQueue" :key="element.id"
                class="queue-item buffer-item"
                :class="`priority-${element.priority}`"
              >
                <div v-if="focusDisplay === 'large'" class="focus-area">
                  <el-image
                    v-if="element.focus_image_path"
                    :src="element.focusImageUrl" fit="cover" class="focus-large-img"
                    :alt="$t('orderDetail.referenceImage')"
                    lazy decoding="async"
                    @error="() => refreshNow(element.focus_image_path)"
                  />
                  <div v-else class="focus-empty focus-empty--static">
                    <el-icon :size="20"><Plus /></el-icon>
                  </div>
                </div>
                <div class="item-body">
                  <div class="item-header">
                    <span class="order-no">#{{ element.order_no }}</span>
                    <el-tag type="warning" size="small" effect="dark">{{ $t('queue.bufferTag') }}</el-tag>
                    <el-tag :type="statusType(element.status)" size="small">
                      {{ $t(`common.orderStatus.${element.status}`) }}
                    </el-tag>
                  </div>
                  <div class="item-info">
                    <span>{{ element.tier_name || $t('common.custom') }}</span>
                    <span>·</span>
                    <span>QQ: {{ element.client_qq }}</span>
                    <span v-if="element.client_name">· {{ element.client_name }}</span>
                  </div>
                </div>
                <div class="item-actions">
                  <el-button size="small" type="primary" @click="promoteOrder(element)" :loading="promotingId === element.id">
                    {{ $t('queue.promote') }}
                  </el-button>
                  <el-button size="small" @click="$router.push(`/orders/${element.id}?from=queue`)">{{ $t('common.detail') }}</el-button>
                </div>
              </div>
            </div>
            <el-empty v-if="!bufferLoading && bufferQueue.length === 0" :description="$t('queue.bufferEmpty')" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
    <!-- ═══ 列表视图结束 ═══ -->

    <!-- ═══ SPEC-005: 月历视图 ═══ -->
    <template v-else-if="viewMode === 'calendar'">
      <div
        class="cal" v-loading="loading || bufferLoading"
        @touchstart.passive="onCalTouchStart"
        @touchend.passive="onCalTouchEnd"
      >
        <!-- 翻月头 -->
        <div class="cal-head">
          <el-button text @click="changeMonth(-1)" :aria-label="$t('queue.calPrev')">←</el-button>
          <span class="cal-head-title">{{ $t('queue.calTitle', { y: calYear, m: calMonth + 1 }) }}</span>
          <el-button text @click="changeMonth(1)" :aria-label="$t('queue.calNext')">→</el-button>
          <el-button v-if="!isCurrentMonth" text size="small" class="cal-today-btn" @click="goToday">{{ $t('queue.calToday') }}</el-button>
        </div>

        <!-- 星期头（周一开头） -->
        <div class="cal-weekdays">
          <span v-for="w in WEEKDAY_KEYS" :key="w" class="cal-weekday">{{ $t(w) }}</span>
        </div>

        <!-- 日期网格 + 订单带 -->
        <div class="cal-grid">
          <div
            v-for="(cell, idx) in calCells" :key="idx"
            class="cal-cell"
            :class="{
              'cal-cell--other': !cell.inMonth,
              'cal-cell--today': cell.isToday,
              'cal-cell--weekend': cell.weekend
            }"
          >
            <span class="cal-day-num">{{ cell.day }}</span>
            <!-- 该日的订单带（最多 3 条 + "+N"） -->
            <div class="cal-bands">
              <el-tooltip
                v-for="band in cell.bands.slice(0, 3)" :key="band.order.id + '-' + idx"
                :content="bandTooltip(band.order)" placement="top" :show-after="300"
              >
                <div
                  class="cal-band"
                  :class="bandClass(band.order)"
                  :data-order-id="band.order.id"
                  @click="goOrder(band.order)"
                >
                  <span class="cal-band-text">{{ bandLabel(band.order) }}</span>
                </div>
              </el-tooltip>
              <div v-if="cell.bands.length > 3" class="cal-band-more">+{{ cell.bands.length - 3 }}</div>
            </div>
          </div>
        </div>

        <!-- 图例 -->
        <div class="cal-legend">
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--formal"></i>{{ $t('queue.calLegendFormal') }}</span>
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--buffer"></i>{{ $t('queue.calLegendBuffer') }}</span>
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--nodeadline"></i>{{ $t('queue.calLegendNoDeadline') }}</span>
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--overdue"></i>{{ $t('queue.calLegendOverdue') }}</span>
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--done"></i>{{ $t('queue.calLegendDone') }}</span>
        </div>
      </div>
    </template>
    <!-- ═══ 月历视图结束 ═══ -->

    <!-- ═══ v0.25 D: 时间条视图（SPEC-005 §3） ═══ -->
    <template v-else-if="viewMode === 'timeline'">
      <div class="tl" v-loading="loading || bufferLoading">
        <!-- 工具栏：缩放 + 回到今天 -->
        <div class="tl-toolbar">
          <el-radio-group v-model="tlZoom" size="small" @change="saveTlZoom">
            <el-radio-button value="2w">{{ $t('queue.tlZoom2w') }}</el-radio-button>
            <el-radio-button value="1m">{{ $t('queue.tlZoom1m') }}</el-radio-button>
            <el-radio-button value="3m">{{ $t('queue.tlZoom3m') }}</el-radio-button>
            <el-radio-button value="6m">{{ $t('queue.tlZoom6m') }}</el-radio-button>
          </el-radio-group>
          <el-button v-if="!tlIsTodayVisible" text size="small" @click="tlGoToday">{{ $t('queue.calToday') }}</el-button>
        </div>

        <div class="tl-scroll" ref="tlScrollEl">
          <div class="tl-canvas" :style="{ width: tlCanvasWidth + 'px' }">
            <!-- 日期刻度头 -->
            <div class="tl-axis" :style="{ width: tlCanvasWidth + 'px' }">
              <div
                v-for="tick in tlTicks" :key="tick.key"
                class="tl-tick"
                :class="{ 'tl-tick--weekend': tick.weekend, 'tl-tick--today': tick.isToday }"
                :style="{ left: tick.x + 'px', width: tlDayWidth + 'px' }"
              >
                <span class="tl-tick-label">{{ tick.label }}</span>
              </div>
            </div>

            <!-- 今天竖向参考线 -->
            <div v-if="tlTodayX != null" class="tl-today-line" :style="{ left: tlTodayX + 'px' }"></div>

            <!-- 订单横条列表 -->
            <div class="tl-rows">
              <div v-for="row in tlRows" :key="row.order.id" class="tl-row">
                <div class="tl-row-label" :title="bandLabel(row.order)">
                  <span class="tl-row-no">#{{ row.order.order_no }}</span>
                  <span class="tl-row-name">{{ bandLabel(row.order) }}</span>
                </div>
                <el-tooltip :content="bandTooltip(row.order)" placement="top" :show-after="300" :disabled="tlDrag != null">
                  <div
                    class="tl-bar"
                    :class="[bandClass(row.order), { 'tl-bar--dragging': tlDrag && tlDrag.orderId === row.order.id, 'tl-bar--movable': tlCanDragMove(row) }]"
                    :data-order-id="row.order.id"
                    :style="tlBarStyle(row)"
                    @click="goOrder(row.order)"
                    @pointerdown="onTlBarDown($event, row)"
                    @pointermove="onTlHandleMove"
                    @pointerup="onTlHandleUp"
                    @pointercancel="onTlHandleCancel"
                  >
                    <span class="tl-bar-text">{{ bandLabel(row.order) }}</span>
                    <!-- v0.28: 拖拽 handle（左端改开工日 / 右端改截稿日；终态订单与被窗口裁剪的端点不显示） -->
                    <div
                      v-if="tlCanDragStart(row)"
                      class="tl-handle tl-handle--start"
                      @pointerdown="onTlHandleDown($event, row, 'start')"
                      @pointermove="onTlHandleMove"
                      @pointerup="onTlHandleUp"
                      @pointercancel="onTlHandleCancel"
                      @click.stop
                    ></div>
                    <div
                      v-if="tlCanDragEnd(row)"
                      class="tl-handle tl-handle--end"
                      @pointerdown="onTlHandleDown($event, row, 'deadline')"
                      @pointermove="onTlHandleMove"
                      @pointerup="onTlHandleUp"
                      @pointercancel="onTlHandleCancel"
                      @click.stop
                    ></div>
                  </div>
                </el-tooltip>
              </div>
              <el-empty v-if="!loading && !bufferLoading && tlRows.length === 0" :description="$t('queue.tlEmpty')" />
            </div>
          </div>
        </div>

        <!-- 图例（与月历共用） -->
        <div class="cal-legend">
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--formal"></i>{{ $t('queue.calLegendFormal') }}</span>
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--buffer"></i>{{ $t('queue.calLegendBuffer') }}</span>
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--nodeadline"></i>{{ $t('queue.calLegendNoDeadline') }}</span>
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--overdue"></i>{{ $t('queue.calLegendOverdue') }}</span>
          <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--done"></i>{{ $t('queue.calLegendDone') }}</span>
        </div>

        <!-- v0.28: 拖拽浮动日期标签（Teleport 到 body，避免祖先 transform 破坏 fixed 定位） -->
        <Teleport to="body">
          <div
            v-if="tlDrag"
            class="tl-drag-label"
            :style="{ left: tlDrag.pointerX + 'px', top: tlDrag.pointerY + 'px' }"
          >
            {{ tlDragLabelText }}
          </div>
        </Teleport>
      </div>
    </template>
    <!-- ═══ 时间条视图结束 ═══ -->

    <!-- 焦点图空态上传：隐藏文件选择器（点击占位按钮触发） -->
    <input
      ref="focusInputEl" type="file" accept="image/*" hidden
      @change="handleFocusFileSelect"
    />

    <!-- 方案 B: 交付弹窗（看板直接弹，含无文件交付） -->
    <DeliverDialog
      v-if="deliverOrderId"
      v-model="deliverDialogVisible"
      :order-id="deliverOrderId"
      @delivered="onDeliveredFromBoard"
    />
  </ArtistLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import DeliverDialog from '../../components/artist/DeliverDialog.vue'
import { useSignatureRefresh } from '../../composables/useSignatureRefresh.js'

const { t, locale } = useI18n()
const router = useRouter()
const queue = ref([])
const loading = ref(true)

// 方案 B: 看板交付弹窗（直接弹，不跳详情页）
const deliverDialogVisible = ref(false)
const deliverOrderId = ref(null)
function openDeliverFor(order) {
  deliverOrderId.value = order.id
  deliverDialogVisible.value = true
}
async function onDeliveredFromBoard() {
  // 交付成功后刷新队列（状态变 delivered，名额释放）
  await loadQueue()
}
// P0-3b: 标签切换（正式区 / 缓冲区）
const activeTab = ref('formal')

// ─── R20: 焦点图显示模式（全局设置；仅 无/大 两态，旧值 small 映射为 large） ───
const FOCUS_DISPLAY_KEY = 'queue_focus_display'
const focusDisplay = ref(
  localStorage.getItem(FOCUS_DISPLAY_KEY) === 'small' ? 'large'
    : (localStorage.getItem(FOCUS_DISPLAY_KEY) || 'large')
)
function saveFocusDisplay(val) {
  localStorage.setItem(FOCUS_DISPLAY_KEY, val)
}

// ─── SPEC-005: 视图切换（列表 / 月历）+ 默认视图（localStorage，复用"默认面板"模式） ───
const VIEW_MODE_KEY = 'queue_view_mode'
const VALID_VIEW_MODES = ['board', 'calendar', 'timeline']
const viewMode = ref(
  VALID_VIEW_MODES.includes(localStorage.getItem(VIEW_MODE_KEY)) ? localStorage.getItem(VIEW_MODE_KEY) : 'board'
)
function saveViewMode(val) {
  localStorage.setItem(VIEW_MODE_KEY, val)
}

// ─── SPEC-005: 月历视图 ───
const WEEKDAY_KEYS = ['queue.calMon', 'queue.calTue', 'queue.calWed', 'queue.calThu', 'queue.calFri', 'queue.calSat', 'queue.calSun']

/** 当前可见月份（Date 对象，指向当月 1 日） */
const calCursor = ref(startOfMonth(new Date()))

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
const calYear = computed(() => calCursor.value.getFullYear())
const calMonth = computed(() => calCursor.value.getMonth())
const isCurrentMonth = computed(() => {
  const now = new Date()
  return calYear.value === now.getFullYear() && calMonth.value === now.getMonth()
})
function changeMonth(delta) {
  calCursor.value = new Date(calYear.value, calMonth.value + delta, 1)
}
function goToday() {
  calCursor.value = startOfMonth(new Date())
}

// ─── v0.25 E: 移动端翻月手势（水平滑动 > 50px 触发，参考 TplTierGrid 实现） ───
let calTouchStartX = 0
function onCalTouchStart(e) {
  calTouchStartX = e.touches[0].clientX
}
function onCalTouchEnd(e) {
  const deltaX = e.changedTouches[0].clientX - calTouchStartX
  if (Math.abs(deltaX) < 50) return
  changeMonth(deltaX < 0 ? 1 : -1)
}

/** 日期 → 'YYYY-MM-DD' 键（本地时区） */
function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
/** 解析后端日期字符串为本地 Date（兼容 'YYYY-MM-DD' 与 ISO） */
function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** 全部日历订单（正式 + 缓冲合并，带 zone 标记） */
const calOrders = computed(() => [
  ...queue.value.map(o => ({ ...o, _zone: 'formal' })),
  ...bufferQueue.value.map(o => ({ ...o, _zone: 'buffer' }))
])

/** 订单带区间：开工日(start_date)→确认日(created_at) → 截稿日(deadline)；未设截稿 → 画满到可见月末 */
function bandRange(order) {
  const start = parseDate(order.startDate) || parseDate(order.created_at) || parseDate(order.confirmed_at)
  if (!start) return null
  let end = parseDate(order.deadline)
  const noDeadline = !end
  if (!end) {
    // 未设截稿：画满到当前可见月份末尾
    end = new Date(calYear.value, calMonth.value + 1, 0)
  }
  return { start, end, noDeadline }
}

/** 月历格子数组（42 格 = 6 行，周一开头，含上月末/下月初） */
const calCells = computed(() => {
  const first = calCursor.value
  // 周一开头：getDay() 周日=0 → 偏移 (day+6)%7
  const lead = (first.getDay() + 6) % 7
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - lead)

  const todayKey = dateKey(new Date())
  const monthEnd = new Date(first.getFullYear(), first.getMonth() + 1, 0)

  // 预计算每个订单的带区间（截断到可见范围）
  const visibleBands = calOrders.value
    .map(order => {
      const range = bandRange(order)
      if (!range) return null
      // 带与可见月无交集 → 不渲染
      if (range.end < first || range.start > monthEnd) return null
      return { order, range }
    })
    .filter(Boolean)

  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    const key = dateKey(d)
    const bands = visibleBands
      .filter(({ range }) => {
        // 区间相交判断：订单带覆盖该日
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
        return range.start <= dayEnd && range.end >= dayStart
      })
      .map(({ order, range }) => ({ order, range }))
    cells.push({
      day: d.getDate(),
      inMonth: d.getMonth() === first.getMonth(),
      isToday: key === todayKey,
      weekend: d.getDay() === 0 || d.getDay() === 6,
      bands
    })
  }
  return cells
})

/** 带内文字：昵称-类型（超长 CSS 截断） */
function bandLabel(order) {
  const name = order.client_name || order.client_qq || ''
  const tier = order.tier_name || t('common.custom')
  return name ? `${name}-${tier}` : tier
}

/** 带视觉样式（正式实心 / 缓冲半透明虚线 / 未设截稿斜纹 / 逾期红 / 完成绿） */
function bandClass(order) {
  const base = order._zone === 'buffer' ? 'cal-band--buffer' : 'cal-band--formal'
  if (!order.deadline && !['delivered', 'done'].includes(order.status)) {
    return 'cal-band--nodeadline'
  }
  if (['delivered', 'done'].includes(order.status)) return 'cal-band--done'
  const deadline = parseDate(order.deadline)
  if (deadline && deadline < new Date() && !['delivered', 'done'].includes(order.status)) {
    return 'cal-band--overdue'
  }
  return base
}

/** hover tooltip：订单号 + 截稿日 + 状态 */
function bandTooltip(order) {
  const deadline = order.deadline
    ? String(order.deadline).slice(0, 10)
    : t('queue.calNoDeadline')
  return `#${order.order_no} · ${deadline} · ${t(`common.orderStatus.${order.status}`)}`
}

function goOrder(order) {
  if (tlDragHappened) return // 拖拽松手不跳转
  router.push(`/orders/${order.id}?from=queue`)
}

// ─── v0.25 D: 时间条视图（SPEC-005 §3，共享 calOrders 数据源） ───
const TL_ZOOM_KEY = 'queue_tl_zoom'
// v0.36 波1: 四档缩放（画布宽度分别 672/960/1080/1274px，均 ≤2000px）
const TL_ZOOMS = {
  '2w': { days: 14, dayWidth: 48 },
  '1m': { days: 30, dayWidth: 32 },
  '3m': { days: 90, dayWidth: 12 },
  '6m': { days: 182, dayWidth: 7 }
}
// localStorage 兼容：老版本存的 '2m' 档已删除，落到 '3m'
const storedTlZoom = localStorage.getItem(TL_ZOOM_KEY)
const tlZoom = ref(TL_ZOOMS[storedTlZoom] ? storedTlZoom : (storedTlZoom === '2m' ? '3m' : '2w'))
function saveTlZoom(val) { localStorage.setItem(TL_ZOOM_KEY, val) }

/** 可见窗口中心日期（默认今天，"回到今天"重置） */
const tlCenter = ref(startOfDay(new Date()))
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

const tlDayWidth = computed(() => TL_ZOOMS[tlZoom.value].dayWidth)
const tlDays = computed(() => TL_ZOOMS[tlZoom.value].days)
/** 可见窗口起点（中心 - 天数/2） */
const tlRangeStart = computed(() => {
  const c = tlCenter.value
  return new Date(c.getFullYear(), c.getMonth(), c.getDate() - Math.floor(tlDays.value / 2))
})
const tlCanvasWidth = computed(() => tlDays.value * tlDayWidth.value)

/** 日期 → 画布 x 坐标（可为负/超出，由裁剪逻辑处理） */
function tlX(date) {
  const ms = startOfDay(date).getTime() - tlRangeStart.value.getTime()
  return Math.round(ms / 86_400_000) * tlDayWidth.value
}

/** 日期刻度数组
 * v0.36 波1 刻度密度适配：
 * - dayWidth ≥ 32（2w/1m）：每天标签 M/D
 * - 16 ≤ dayWidth < 32：每天标签，仅日号
 * - 8 ≤ dayWidth < 16（3m）：仅周一出标签（日号），避免重叠
 * - dayWidth < 8（6m）：仅每月 1 号出标签（短月名），周末染色跳过
 */
const tlTicks = computed(() => {
  const ticks = []
  const todayKey = dateKey(new Date())
  const start = tlRangeStart.value
  const dw = tlDayWidth.value
  const monthFmt = new Intl.DateTimeFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en', { month: 'short' })
  for (let i = 0; i < tlDays.value; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    let label
    if (dw >= 32) label = `${d.getMonth() + 1}/${d.getDate()}`
    else if (dw >= 16) label = String(d.getDate())
    else if (dw >= 8) label = d.getDay() === 1 ? String(d.getDate()) : '' // 3m: 仅周一
    else label = d.getDate() === 1 ? monthFmt.format(d) : '' // 6m: 仅每月 1 号
    ticks.push({
      key: dateKey(d),
      x: i * dw,
      label,
      weekend: dw >= 8 && (d.getDay() === 0 || d.getDay() === 6), // 低缩放跳过周末染色
      isToday: dateKey(d) === todayKey
    })
  }
  return ticks
})

/** 今天参考线 x（不在可见窗口内 → null） */
const tlTodayX = computed(() => {
  const today = startOfDay(new Date())
  if (today < tlRangeStart.value) return null
  const x = tlX(today)
  return x > tlCanvasWidth.value ? null : x + Math.floor(tlDayWidth.value / 2)
})
const tlIsTodayVisible = computed(() => tlTodayX.value != null)
function tlGoToday() { tlCenter.value = startOfDay(new Date()) }

/** 时间条行：按确认日排序，横条裁剪到可见窗口；未设截稿 → 画满到窗口末端 */
const tlRows = computed(() => {
  const winStart = tlRangeStart.value
  const winEnd = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate() + tlDays.value - 1)
  return calOrders.value
    .map(order => {
      const rawStart = parseDate(order.startDate) || parseDate(order.created_at) || parseDate(order.confirmed_at)
      if (!rawStart) return null
      const start = startOfDay(rawStart)
      const rawEnd = parseDate(order.deadline)
      const noDeadline = !rawEnd
      const end = rawEnd ? startOfDay(rawEnd) : winEnd // 未设截稿：画满到可见窗口末端
      if (end < winStart || start > winEnd) return null // 与窗口无交集
      // 裁剪到窗口
      const clipStart = start < winStart ? winStart : start
      const clipEnd = end > winEnd ? winEnd : end
      return {
        order,
        left: tlX(clipStart),
        width: (Math.round((clipEnd.getTime() - clipStart.getTime()) / 86_400_000) + 1) * tlDayWidth.value - 4,
        // v0.28 拖拽用：真实起止日（startOfDay 归一）+ 是否被窗口裁剪
        startDate: start,
        endDate: end,
        noDeadline,
        startClipped: start < winStart,
        endClipped: end > winEnd
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const sa = parseDate(a.order.startDate) || parseDate(a.order.created_at) || parseDate(a.order.confirmed_at)
      const sb = parseDate(b.order.startDate) || parseDate(b.order.created_at) || parseDate(b.order.confirmed_at)
      return (sa?.getTime() || 0) - (sb?.getTime() || 0)
    })
})

/** 切到时间条视图时，滚动到今天附近 */
const tlScrollEl = ref(null)
watch(viewMode, (mode) => {
  if (mode !== 'timeline') return
  nextTick(() => {
    const el = tlScrollEl.value
    if (!el) return
    const today = startOfDay(new Date())
    const x = tlX(today)
    el.scrollLeft = Math.max(0, x - el.clientWidth / 3)
  })
})

// ─── v0.28: 时间条拖拽（原生 Pointer Events：右端改截稿日 / 左端改开工日，吸附到天） ───
const TL_TERMINAL_STATUSES = ['done', 'delivered', 'cancelled']

/**
 * 拖拽状态（null = 未在拖拽）
 * { orderId, edge('start'|'deadline'), startDate, endDate, noDeadline,
 *   startX, dayDelta, pointerX, pointerY }
 */
const tlDrag = ref(null)

/** 终态订单不可拖；被窗口裁剪的端点不可拖（拖了等于把日期设成窗口边界，误导） */
function tlCanDragStart(row) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.startClipped
}
function tlCanDragEnd(row) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.endClipped
}
/** REQ-019: 整体平移——非终态 + 有截稿日 + 两端未被裁剪 */
function tlCanDragMove(row) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.noDeadline && !row.startClipped && !row.endClipped
}

/** 横条样式：拖拽中按 dayDelta 覆盖 left/width，其余走 tlRows 计算值 */
let tlDragHappened = false // 拖拽刚结束，抑制 click 跳转
function tlBarStyle(row) {
  const d = tlDrag.value
  if (!d || d.orderId !== row.order.id) {
    return { left: row.left + 'px', width: Math.max(row.width, 8) + 'px' }
  }
  const dw = d.dayDelta * tlDayWidth.value
  const minW = tlDayWidth.value - 4 // 最短 1 天
  // REQ-019: 整体平移——left 偏移，width 不变
  if (d.edge === 'move') {
    return { left: row.left + dw + 'px', width: Math.max(row.width, 8) + 'px' }
  }
  if (d.edge === 'deadline') {
    return { left: row.left + 'px', width: Math.max(row.width + dw, minW) + 'px' }
  }
  return { left: row.left + dw + 'px', width: Math.max(row.width - dw, minW) + 'px' }
}

/** 浮动标签文字：目标日期 M/D */
const tlDragLabelText = computed(() => {
  const d = tlDrag.value
  if (!d) return ''
  // REQ-019: 整体平移显示两端日期
  if (d.edge === 'move') {
    const s = new Date(d.startDate.getTime() + d.dayDelta * 86_400_000)
    const e = new Date(d.endDate.getTime() + d.dayDelta * 86_400_000)
    const fmt = (dt) => `${dt.getMonth() + 1}/${dt.getDate()}`
    return t('queue.tlDragMove', { s: fmt(s), e: fmt(e) })
  }
  const base = d.edge === 'deadline' ? d.endDate : d.startDate
  const target = new Date(base.getTime() + d.dayDelta * 86_400_000)
  const dStr = `${target.getMonth() + 1}/${target.getDate()}`
  return d.edge === 'deadline' ? t('queue.tlDragDeadline', { d: dStr }) : t('queue.tlDragStart', { d: dStr })
})

function onTlHandleDown(e, row, edge) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.stopPropagation()
  e.currentTarget.setPointerCapture(e.pointerId)
  tlDrag.value = {
    orderId: row.order.id,
    edge,
    startDate: row.startDate,
    endDate: row.endDate,
    noDeadline: row.noDeadline,
    startX: e.clientX,
    dayDelta: 0,
    pointerX: e.clientX,
    pointerY: e.clientY
  }
}

/** REQ-019: 横条中间区域按下 → 整体平移模式（handle 的 pointerdown 已 stopPropagation，不会冒泡到这里） */
function onTlBarDown(e, row) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (!tlCanDragMove(row)) return
  e.currentTarget.setPointerCapture(e.pointerId)
  tlDrag.value = {
    orderId: row.order.id,
    edge: 'move',
    startDate: row.startDate,
    endDate: row.endDate,
    noDeadline: row.noDeadline,
    startX: e.clientX,
    dayDelta: 0,
    pointerX: e.clientX,
    pointerY: e.clientY
  }
}

function onTlHandleMove(e) {
  const d = tlDrag.value
  if (!d) return
  let delta = Math.round((e.clientX - d.startX) / tlDayWidth.value)
  const spanDays = Math.round((d.endDate.getTime() - d.startDate.getTime()) / 86_400_000)
  // 吸附约束：截稿日 ≥ 开工日；开工日 ≤ 截稿日（未设截稿时开工日右移不受限）
  if (d.edge === 'deadline') delta = Math.max(delta, -spanDays)
  else if (d.edge === 'start' && !d.noDeadline) delta = Math.min(delta, spanDays)
  // REQ-019: 整体平移——开工日不早于今天（触达边界停止，不弹错误）
  else if (d.edge === 'move') {
    const today = startOfDay(new Date())
    const minDelta = Math.ceil((today.getTime() - d.startDate.getTime()) / 86_400_000)
    // BUG-6 修复：恒执行钳制（原版 if (minDelta > 0) 只在开工日已在过去时生效，
    // 开工日在未来时左拖可把开工日拖进过去，错误排期静默持久化）
    delta = Math.max(delta, minDelta)
  }
  d.dayDelta = delta
  d.pointerX = e.clientX
  d.pointerY = e.clientY
}

async function onTlHandleUp() {
  const d = tlDrag.value
  if (!d) return
  tlDrag.value = null
  if (d.dayDelta === 0) return // 没移动过，不发请求
  tlDragHappened = true // 抑制拖拽松手后的 click 跳转
  setTimeout(() => { tlDragHappened = false }, 50)

  const base = d.edge === 'deadline' ? d.endDate : d.startDate
  const target = new Date(base.getTime() + d.dayDelta * 86_400_000)
  const dateStr = dateKey(target)

  // 兜底校验（正常在 move 阶段被吸附约束拦住，此处防御）
  if (d.edge === 'deadline' && target < d.startDate) {
    ElMessage.warning(t('queue.tlDragDeadlineBeforeStart'))
    return
  }
  if (d.edge === 'start' && !d.noDeadline && target > d.endDate) {
    ElMessage.warning(t('queue.tlDragStartAfterDeadline'))
    return
  }

  try {
    if (d.edge === 'move') {
      // REQ-019: 整体平移——一次性更新开工日+截稿日
      const newStart = dateKey(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000))
      const newEnd = dateKey(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000))
      // 往右拖（延后）：先更新截稿日再更新开工日，避免交叉校验 400（newStart > 旧 deadline）
      // 往左拖（提前）：先更新开工日再更新截稿日，避免 newEnd < 旧 startDate
      if (d.dayDelta > 0) {
        await artistApi.updateDeadline(d.orderId, newEnd)
        await artistApi.updateStartDate(d.orderId, newStart)
      } else {
        await artistApi.updateStartDate(d.orderId, newStart)
        await artistApi.updateDeadline(d.orderId, newEnd)
      }
      const src = queue.value.find(o => o.id === d.orderId) || bufferQueue.value.find(o => o.id === d.orderId)
      if (src) { src.startDate = newStart; src.deadline = newEnd }
    } else if (d.edge === 'deadline') {
      await artistApi.updateDeadline(d.orderId, dateStr)
      const src = queue.value.find(o => o.id === d.orderId) || bufferQueue.value.find(o => o.id === d.orderId)
      if (src) src.deadline = dateStr
    } else {
      await artistApi.updateStartDate(d.orderId, dateStr)
      const src = queue.value.find(o => o.id === d.orderId) || bufferQueue.value.find(o => o.id === d.orderId)
      if (src) src.startDate = dateStr
    }
    ElMessage.success(t('queue.tlDragSaved'))
  } catch (err) {
    ElMessage.error(err.message)
    await Promise.all([loadQueue(), loadBufferQueue()]) // 回滚
  }
}

function onTlHandleCancel() {
  tlDrag.value = null
}

import { ORDER_STATUS_TYPE, PRIORITY_TYPE } from '../../constants/order.js'

const priorityType = (p) => PRIORITY_TYPE[p] || 'info'
const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'

// ─── R30b: 下一步主操作映射（外露按钮用） ───
const NEXT_ACTION = {
  pending: { command: 'confirmed', labelKey: 'queue.confirm', type: 'primary' },
  confirmed: { command: 'wip', labelKey: 'queue.startWip', type: 'warning' },
  wip: { command: 'done', labelKey: 'queue.done', type: 'success' },
  revision: { command: 'done', labelKey: 'queue.done', type: 'success' },
  done: { command: 'delivered', labelKey: 'queue.deliver', type: 'success' }
}
const nextAction = (status) => NEXT_ACTION[status] || null

// ─── R30d: 流程状态机（看板推进） ───
const workflowStages = ref([])

/** 订单是否可推进（有 stage、非终态、非最后节点） */
function canAdvance(order) {
  if (order.currentStageId == null) return false
  if (['delivered', 'cancelled'].includes(order.status)) return false
  const idx = workflowStages.value.findIndex(s => s.id === order.currentStageId)
  return idx !== -1 && idx < workflowStages.value.length - 1
}

/** 推进到下一节点（stageId = 当前节点的下一个） */
async function advanceOrderStage(order) {
  const idx = workflowStages.value.findIndex(s => s.id === order.currentStageId)
  const next = workflowStages.value[idx + 1]
  if (!next) return
  try {
    await artistApi.advanceStage(order.id, next.id)
    ElMessage.success(t('queue.stageAdvanced'))
    await loadQueue()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function loadQueue() {
  loading.value = true
  try {
    queue.value = await artistApi.getQueue()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

/**
 * P1-2: 拖拽结束 — 发送完整排序后的 ID 数组
 * vuedraggable 已就地移动数组，直接把新顺序的 ID 列表发给后端
 */
async function onDragEnd(evt) {
  const { oldIndex, newIndex } = evt
  if (oldIndex === newIndex) return

  try {
    const orderedIds = queue.value.map(item => item.id)
    const newQueue = await artistApi.reorderQueue(orderedIds)
    queue.value = newQueue
    ElMessage.success(t('queue.orderUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
    // 回滚：重新加载
    await loadQueue()
  }
}

async function quickAction(command, order) {
  // R30e: 取消不走弹窗，打开滑块确认
  if (command === 'cancelled') {
    openSlideCancel(order)
    return
  }

  try {
    await artistApi.updateStatus(order.id, command)
    ElMessage.success(t('queue.statusUpdated'))
    await loadQueue()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── 焦点图空态上传（点击选文件 / 拖拽图片，上传后直接设为焦点图） ───
// 本页不开粘贴上传：多个上传目标，全局粘贴无法路由（用户明确指示）
const focusInputEl = ref(null)
const focusDragId = ref(null) // 正在拖拽进入的订单 ID（高亮用）
let focusUploadTarget = null  // 当前点击上传的订单

function triggerFocusUpload(order) {
  focusUploadTarget = order
  focusInputEl.value?.click()
}

async function handleFocusFileSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !focusUploadTarget) return
  await uploadAndSetFocus(file, focusUploadTarget)
  focusUploadTarget = null
}

/** 防 dragleave 闪烁：子元素间移动时 relatedTarget 仍在占位区内，忽略 */
function onFocusDragLeave(e, order) {
  if (e.currentTarget.contains(e.relatedTarget)) return
  if (focusDragId.value === order.id) focusDragId.value = null
}

async function handleFocusDrop(event, order) {
  focusDragId.value = null
  const file = [...event.dataTransfer.files].find(f => f.type.startsWith('image/'))
  if (file) {
    await uploadAndSetFocus(file, order)
  } else if (event.dataTransfer.files.length > 0) {
    // BUG-2 补充：拖入非图片时提示，不再静默丢弃
    ElMessage.error(t('orderDetail.galleryNotImage'))
  }
}

/** 上传图片 → 设为该订单焦点图（复用 reference 上传 + setFocusImage 接口） */
async function uploadAndSetFocus(file, order) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('orderDetail.galleryNotImage'))
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error(t('orderDetail.galleryTooBig'))
    return
  }
  try {
    const uploaded = await uploadApi.reference(file)
    // 必须先关联到订单（写入 order_references），否则 setFocusImage 校验归属失败
    await artistApi.addReference(order.id, { filePath: uploaded.filePath })
    await artistApi.setFocusImage(order.id, { imagePath: uploaded.filePath, mode: 'large' })
    ElMessage.success(t('orderDetail.focusUpdated'))
    await loadQueue()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R30e: 滑块确认取消（拖到底触发，防误触） ───
const cancellingId = ref(null)
const slideProgress = ref(0)
let slideRect = null

function openSlideCancel(order) {
  cancellingId.value = order.id
  slideProgress.value = 0
}
function closeSlideCancel() {
  cancellingId.value = null
  slideProgress.value = 0
}
function onSlideStart(e) {
  const track = e.currentTarget.closest('.slide-cancel')
  slideRect = track.getBoundingClientRect()
  e.currentTarget.setPointerCapture(e.pointerId)
}
function onSlideMove(e) {
  if (!slideRect) return
  const x = e.clientX - slideRect.left - 20
  slideProgress.value = Math.max(0, Math.min(1, x / (slideRect.width - 40)))
}
async function onSlideEnd(e, order) {
  if (!slideRect) return
  slideRect = null
  if (slideProgress.value >= 0.9) {
    closeSlideCancel()
    try {
      await artistApi.updateStatus(order.id, 'cancelled')
      ElMessage.success(t('queue.statusUpdated'))
      await loadQueue()
    } catch (err) {
      ElMessage.error(err.message)
    }
  } else {
    slideProgress.value = 0
  }
}

// ─── R30c: 手机端左滑进详情（触屏专属，C43 桌面不做等效） ───
let swipeStart = null
function onCardPointerDown(e) {
  if (e.pointerType !== 'touch') return
  if (e.target.closest('button, .drag-handle, .slide-cancel, .el-dropdown, .el-image, .focus-empty, .focus-img-wrap')) return
  swipeStart = { x: e.clientX, y: e.clientY }
}
function onCardPointerUp(e, order) {
  if (!swipeStart) return
  const dx = e.clientX - swipeStart.x
  const dy = e.clientY - swipeStart.y
  swipeStart = null
  // 左滑 ≥60px 且水平方向主导 → 进详情
  if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    router.push(`/orders/${order.id}?from=queue`)
  }
}

// ─── SPEC-004: 缓冲区（候补订单列表 + 手动递补） ───
const bufferQueue = ref([])
const bufferLoading = ref(false)
const promotingId = ref(null)

// ─── REQ-013 #7: 完成区（最近 7 天已交付订单，沉底灰色展示） ───
const completedQueue = ref([])
const completedLoading = ref(false)

// ─── R33: 签名 URL 定时刷新（焦点图 15min 过期防 403；正式区+缓冲区+完成区统一收集） ───
const { refreshNow } = useSignatureRefresh({
  collect: () => [...queue.value, ...bufferQueue.value, ...completedQueue.value].filter(o => o.focus_image_path).map(o => o.focus_image_path),
  apply: (urlMap) => {
    for (const o of [...queue.value, ...bufferQueue.value, ...completedQueue.value]) {
      if (o.focus_image_path && urlMap[o.focus_image_path]) o.focusImageUrl = urlMap[o.focus_image_path]
    }
  }
})

async function loadBufferQueue() {
  bufferLoading.value = true
  try {
    bufferQueue.value = await artistApi.getQueue('buffer')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    bufferLoading.value = false
  }
}

/** REQ-013 #7: 加载完成区（最近 7 天已交付订单） */
async function loadCompletedQueue() {
  completedLoading.value = true
  try {
    completedQueue.value = await artistApi.getQueue('completed')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    completedLoading.value = false
  }
}

/** 递补：buffer → formal（成功后刷新两个列表） */
async function promoteOrder(order) {
  promotingId.value = order.id
  try {
    await artistApi.promoteOrder(order.id)
    ElMessage.success(t('queue.promoted'))
    await Promise.all([loadQueue(), loadBufferQueue()])
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    promotingId.value = null
  }
}

onMounted(() => {
  loadQueue()
  loadBufferQueue()
  loadCompletedQueue()
  // R30d: 加载工作流节点（看板推进需要知道"下一节点"）
  artistApi.getWorkflow()
    .then(res => { workflowStages.value = res.stages || [] })
    .catch(err => console.warn('[QueueBoard] 加载工作流节点失败:', err.message))
})
</script>

<style scoped>
.hint { color: var(--text-secondary); font-size: 13px; margin: 8px 0 16px; }
.queue-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.toolbar-label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }

/* 一行一条（用户决策：排期看板必须保持一行一条；宽屏空间由卡片内部横向展开消化） */
.queue-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.queue-item {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: var(--bg-card); border-radius: 8px; padding: 12px 16px;
  border-left: 4px solid var(--border-color); box-shadow: var(--shadow-card);
  cursor: default; transition: box-shadow 0.2s, background 0.3s;
}
.queue-item:hover { box-shadow: var(--shadow-card-hover); }
.priority-high { border-left-color: var(--el-color-danger); }
.priority-medium { border-left-color: var(--el-color-warning); }
.priority-low { border-left-color: var(--el-color-success); }

.drag-handle { cursor: grab; font-size: 20px; color: var(--text-secondary); user-select: none; }
.drag-handle:active { cursor: grabbing; }
.ghost { opacity: 0.4; }

.item-body { flex: 1; min-width: 0; }
.item-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.order-no { font-weight: bold; font-size: 15px; color: var(--text-primary); }
/* R30d: 流程节点标签 */
.stage-tag { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-info { color: var(--text-secondary); font-size: 13px; margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.item-desc { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
/* 焦点图区域：大图 160×120，左图右文 */
.focus-area { flex-shrink: 0; }
.focus-large-img { width: 160px; height: 120px; border-radius: 8px; display: block; background: var(--bg-card); }
/* R53: 已有焦点图替换（点击选文件 / 拖拽替换，不需要确认弹窗——旧图保留在图库） */
.focus-img-wrap {
  position: relative; width: 160px; height: 120px;
  border-radius: 8px; overflow: hidden; cursor: pointer;
  background: var(--bg-card);
  transition: box-shadow 0.15s;
}
.focus-img-wrap:hover { box-shadow: 0 0 0 2px var(--el-color-primary-light-5); }
.focus-replace-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); color: #fff;
  font-size: 13px; font-weight: 600;
  pointer-events: none;
}
.focus-img-wrap--active { box-shadow: 0 0 0 2px var(--el-color-primary); }
/* 焦点图空态上传占位（虚线边框 + 图标 + 文字，hover/拖拽高亮） */
.focus-empty {
  width: 160px; height: 120px;
  border: 2px dashed var(--border-color); border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; cursor: pointer; color: var(--text-secondary);
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.focus-empty:hover, .focus-empty--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.focus-empty-text { font-size: 12px; }
.item-actions { display: flex; gap: 8px; flex-shrink: 0; margin-left: auto; }

/* R30e: 滑块确认（整行，拖到底触发取消） */
.slide-cancel-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.slide-cancel {
  position: relative;
  flex: 1;
  height: 40px;
  border-radius: 999px;
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-5);
  overflow: hidden;
  user-select: none;
}
.slide-cancel-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: var(--el-color-danger-light-7);
  transition: width 0.05s linear;
}
.slide-cancel-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600;
  color: var(--el-color-danger);
  pointer-events: none;
}
.slide-cancel-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--el-color-danger);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700;
  cursor: grab;
  touch-action: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.slide-cancel-thumb:active { cursor: grabbing; }

@media (max-width: 600px) {
  .item-actions { width: 100%; justify-content: flex-end; margin-left: 0; }
}

/* ─── SPEC-004: 缓冲区 ─── */
.buffer-title { margin: 28px 0 4px; color: var(--text-primary); font-size: 16px; }
.buffer-hint { margin: 0 0 12px; font-size: 12px; color: var(--text-secondary); }
.buffer-item { border-left: 3px solid var(--el-color-warning); }
.focus-empty--static { cursor: default; }

/* ─── REQ-013 #7: 完成区（灰色沉底，不可拖拽） ─── */
.completed-title { margin: 28px 0 4px; color: var(--text-secondary); font-size: 16px; }
.completed-hint { margin: 0 0 12px; font-size: 12px; color: var(--text-muted); }
.completed-item {
  opacity: 0.5;
  border-left: 3px solid var(--el-color-success-light-5);
  cursor: default;
}
.completed-item:hover { box-shadow: var(--shadow-card); }

/* ─── SPEC-005: 视图切换 + 月历 ─── */
.view-switch { margin-bottom: 16px; }

.cal { min-height: 400px; }
.cal-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px;
}
.cal-head-title {
  font-size: 18px; font-weight: 700; color: var(--text-primary);
  min-width: 110px; text-align: center;
  font-variant-numeric: tabular-nums;
}
.cal-today-btn { margin-left: 8px; }

.cal-weekdays {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
  margin-bottom: 4px;
}
.cal-weekday {
  text-align: center; font-size: 12px; font-weight: 600;
  color: var(--text-secondary); padding: 4px 0;
}

.cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
}
.cal-cell {
  min-height: 92px;
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-card);
  padding: 4px;
  display: flex; flex-direction: column; gap: 3px;
  transition: border-color 0.15s;
}
.cal-cell--other { opacity: 0.4; background: transparent; }
.cal-cell--weekend { background: color-mix(in srgb, var(--bg-secondary, #f5f5f5) 50%, var(--bg-card)); }
.cal-cell--today {
  border-color: var(--el-color-primary);
  box-shadow: inset 0 0 0 1px var(--el-color-primary);
}
.cal-day-num {
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.cal-cell--today .cal-day-num { color: var(--el-color-primary); }

.cal-bands { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.cal-band {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px; line-height: 1.4;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
  overflow: hidden;
}
.cal-band:hover { filter: brightness(1.08); transform: translateX(1px); }
.cal-band-text {
  display: block;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* 正式订单：实心蓝 */
.cal-band--formal {
  background: var(--el-color-primary);
  color: #fff;
}
/* 缓冲位：30% 透明 + 虚线边框 */
.cal-band--buffer {
  background: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
  border: 1px dashed var(--el-color-primary);
  color: var(--el-color-primary);
}
/* 未设截稿：斜纹 + 警示色 */
.cal-band--nodeadline {
  background: repeating-linear-gradient(
    45deg,
    var(--el-color-warning-light-5),
    var(--el-color-warning-light-5) 4px,
    var(--el-color-warning-light-8) 4px,
    var(--el-color-warning-light-8) 8px
  );
  border: 1px solid var(--el-color-warning);
  color: var(--el-color-warning-dark-2);
}
/* 逾期：红 */
.cal-band--overdue {
  background: var(--el-color-danger);
  color: #fff;
}
/* 已完成：绿 */
.cal-band--done {
  background: var(--el-color-success);
  color: #fff;
}
.cal-band-more {
  font-size: 10px; color: var(--text-muted); text-align: center;
  padding: 1px 0;
}

/* 图例 */
.cal-legend {
  display: flex; flex-wrap: wrap; gap: 14px;
  margin-top: 14px; padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.cal-legend-item {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--text-secondary);
}
.cal-legend-swatch {
  display: inline-block; width: 22px; height: 12px;
  border-radius: 3px;
}

/* 移动端：格子缩小，带内文字截断 */
@media (max-width: 768px) {
  .cal-cell { min-height: 64px; padding: 2px; }
  .cal-day-num { font-size: 10px; }
  .cal-band { padding: 1px 3px; font-size: 9px; }
  .cal-head-title { font-size: 15px; min-width: 90px; }
}

/* ─── v0.25 D: 时间条视图 ─── */
.tl { min-height: 300px; }
.tl-toolbar {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 12px;
}
.tl-scroll {
  overflow-x: auto; overflow-y: visible;
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-card);
  -webkit-overflow-scrolling: touch;
}
.tl-canvas { position: relative; min-width: 100%; }
.tl-axis {
  position: relative; height: 32px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-inset, #f9f9f9);
}
.tl-tick {
  position: absolute; top: 0; bottom: 0;
  display: flex; align-items: center; justify-content: center;
  border-right: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent);
}
.tl-tick--weekend { background: color-mix(in srgb, var(--bg-secondary, #f5f5f5) 50%, transparent); }
.tl-tick--today { background: color-mix(in srgb, var(--el-color-primary) 10%, transparent); }
.tl-tick-label {
  font-size: 10px; color: var(--text-secondary);
  white-space: nowrap; overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.tl-tick--today .tl-tick-label { color: var(--el-color-primary); font-weight: 700; }

.tl-today-line {
  position: absolute; top: 32px; bottom: 0;
  width: 2px; background: var(--el-color-primary);
  z-index: 2; pointer-events: none;
}

.tl-rows { position: relative; padding: 8px 0; }
.tl-row {
  display: flex; align-items: center;
  height: 36px; position: relative;
}
.tl-row-label {
  position: sticky; left: 0; z-index: 3;
  width: 140px; min-width: 140px; flex-shrink: 0;
  padding: 0 8px;
  display: flex; align-items: center; gap: 4px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  overflow: hidden;
}
.tl-row-no { font-size: 11px; font-weight: 700; color: var(--text-secondary); white-space: nowrap; }
.tl-row-name {
  font-size: 12px; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tl-bar {
  position: absolute; top: 6px; height: 24px;
  border-radius: 4px; cursor: pointer;
  display: flex; align-items: center;
  padding: 0 6px; overflow: hidden;
  transition: filter 0.15s;
}
.tl-bar:hover { filter: brightness(1.1); }
.tl-bar-text {
  font-size: 11px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}

/* ─── v0.28: 时间条拖拽 handle + 浮动日期标签 ─── */
.tl-handle {
  position: absolute; top: 0; bottom: 0;
  width: 14px;
  cursor: col-resize;
  touch-action: none; /* 移动端：阻止浏览器接管滚动手势，拖拽优先 */
  z-index: 1;
}
.tl-handle--start { left: 0; }
.tl-handle--end { right: 0; }
/* hover / 拖拽中显示竖线指示可拖 */
.tl-handle::after {
  content: '';
  position: absolute; top: 3px; bottom: 3px;
  width: 2px; border-radius: 1px;
  background: rgba(255, 255, 255, 0.85);
  opacity: 0;
  transition: opacity 0.15s;
}
.tl-handle--start::after { left: 3px; }
.tl-handle--end::after { right: 3px; }
.tl-handle:hover::after { opacity: 1; }
.tl-bar--dragging { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6); }
.tl-bar--dragging .tl-handle::after { opacity: 1; }
/* REQ-019: 可整体平移的横条——中间区域 grab 光标 */
.tl-bar--movable { cursor: grab; }
.tl-bar--movable.tl-bar--dragging { cursor: grabbing; }

/* 拖拽浮动日期标签（Teleport 到 body，fixed 跟随指针） */
.tl-drag-label {
  position: fixed;
  transform: translate(-50%, calc(-100% - 10px));
  background: var(--el-color-primary);
  color: #fff;
  font-size: 12px; font-weight: 600;
  line-height: 1;
  padding: 5px 9px; border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .tl-row-label { width: 100px; min-width: 100px; }
  .tl-row-name { font-size: 11px; }
  .tl-tick-label { font-size: 9px; }
  .tl-handle { width: 24px; } /* 触摸热区扩大 */
}
</style>
