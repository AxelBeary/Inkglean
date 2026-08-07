import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../api/index.js'

/**
 * 截稿日/开工日（从 OrderDetail.vue 拆分，纯搬移零行为变化）
 * @param {object} ctx
 * @param {import('vue').Ref} ctx.order - 订单 ref
 * @param {string} ctx.routeId - 订单 id（route.params.id）
 */
export function useOrderDeadline({ order, routeId }) {
  const { t } = useI18n()

  // ─── v0.38: 剩余天数（REQ-026 §四.4：截稿日 − 今天；正=剩余 / 0=当天 / 负=逾期） ───
  const daysLeft = computed(() => {
    const d = order.value?.deadline
    if (!d) return null
    // 本地时区按日计算（deadline 可能带时间部分，截取日期段）
    const due = new Date(String(d).slice(0, 10) + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((due.getTime() - today.getTime()) / 86400000)
  })

  // 日期卡头 chip：剩 N 天(花青=进行中) / 今天截稿(藤黄=待确认) / 逾期 N 天(朱砂=逾期)——7 色语义一对一
  const deadlineChip = computed(() => {
    if (daysLeft.value === null) return null
    if (daysLeft.value > 0) return { type: 'doing', text: t('orderDetail.daysLeft', { n: daysLeft.value }) }
    if (daysLeft.value === 0) return { type: 'pend', text: t('orderDetail.daysToday') }
    return { type: 'over', text: t('orderDetail.daysOverdue', { n: -daysLeft.value }) }
  })

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
      order.value = await artistApi.updateDeadline(routeId, val || null)
      ElMessage.success(t('orderDetail.deadlineSavedSync'))
    } catch (err) {
      // T1: 保存失败时回弹 picker 显示值为 order 原值（watcher 同款截取逻辑，避免界面与数据不一致）
      deadlinePicker.value = order.value?.deadline ? order.value.deadline.slice(0, 10) : null
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
      order.value = await artistApi.updateStartDate(routeId, val || null)
      ElMessage.success(t('orderDetail.startDateSavedSync'))
      // 自动填截稿日：截稿日为空 + 有开工日 + 档位有工期
      if (val && !order.value.deadline && order.value.tier_work_days) {
        const start = new Date(val + 'T00:00:00')
        start.setDate(start.getDate() + order.value.tier_work_days)
        // 本地日期格式化（toISOString 转 UTC 会 off-by-one，UTC+8 下 08-15→08-14）
        const y = start.getFullYear()
        const m = String(start.getMonth() + 1).padStart(2, '0')
        const d = String(start.getDate()).padStart(2, '0')
        const autoDeadline = `${y}-${m}-${d}`
        order.value = await artistApi.updateDeadline(routeId, autoDeadline)
        ElMessage.success(t('orderDetail.deadlineAutoSet'))
      }
    } catch (err) {
      // T1: 保存失败时回弹显示值。第一个 PUT 可能已成功（开工日已入库），两个 picker 都从 order 同步
      startDatePicker.value = order.value?.startDate ?? order.value?.start_date ?? null
      deadlinePicker.value = order.value?.deadline ? order.value.deadline.slice(0, 10) : null
      ElMessage.error(err.message)
    }
  }

  return {
    daysLeft, deadlineChip, deadlinePicker, disableDeadlineDate, disableStartDateDate,
    changeDeadline, startDatePicker, changeStartDate
  }
}
