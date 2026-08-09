/**
 * useActivityLog — 订单操作日志（v0.31 REQ-021 F1 前端）
 *
 * 封装操作日志的分页加载 + action_type 筛选。
 * 后端 API：GET /api/artist/orders/:id/logs?page=&pageSize=&type=
 * 返回 { logs: [{id, order_id, action_type, actor, detail, created_at}], total, page, pageSize }
 *
 * 用法：
 *   const { logs, total, page, pageSize, typeFilter, loading, loadLogs, onPageChange, onTypeChange } = useActivityLog(orderId)
 *   onMounted(() => loadLogs())
 */
import { ref } from 'vue'
import { artistApi } from '../api/index.js'

export function useActivityLog(orderId) {
  const logs = ref([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(50)
  /** 筛选类型（'' = 全部） */
  const typeFilter = ref('')
  const loading = ref(false)

  async function loadLogs() {
    loading.value = true
    try {
      const res = await artistApi.getOrderLogs(orderId, {
        page: page.value,
        pageSize: pageSize.value,
        type: typeFilter.value || undefined
      })
      logs.value = res.logs || []
      total.value = res.total || 0
    } catch {
      logs.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /** el-pagination current-change */
  function onPageChange(p) {
    page.value = p
    loadLogs()
  }

  /** el-select 筛选变更：重置到第一页再加载 */
  function onTypeChange() {
    page.value = 1
    loadLogs()
  }

  return {
    logs, total, page, pageSize, typeFilter, loading,
    loadLogs, onPageChange, onTypeChange
  }
}
