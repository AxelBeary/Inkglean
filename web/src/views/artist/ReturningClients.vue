<template>
  <div class="returning-page">
    <h2 class="od-page-title">{{ $t('returning.title') }}</h2>

    <!-- 818-H：筛选行按行结构整理（说明在左、控件在右） -->
    <div class="group returning-filter">
      <div class="group-head">{{ $t('returning.filterLabel') }}</div>
      <!-- 天数筛选：30/60/90（后端 GET /artist/tools/returning-clients?days=） -->
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('returning.filterLabel') }}</div>
          <div class="desc">{{ $t('returning.filterDesc') }}</div>
        </div>
        <div class="ctrl">
          <el-radio-group v-model="days" class="returning-days" @change="loadClients">
            <el-radio-button :value="30">{{ $t('returning.days30') }}</el-radio-button>
            <el-radio-button :value="60">{{ $t('returning.days60') }}</el-radio-button>
            <el-radio-button :value="90">{{ $t('returning.days90') }}</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </div>

    <!-- 老客列表 -->
    <el-table :data="items" v-loading="loading" class="returning-table">
      <el-table-column :label="$t('clients.qq')" prop="clientQq" min-width="120" />
      <el-table-column :label="$t('returning.ordersColumn')" min-width="100">
        <template #default="{ row }">{{ $t('returning.totalOrders', { n: row.totalOrders }) }}</template>
      </el-table-column>
      <el-table-column :label="$t('returning.totalPaid')" min-width="120">
        <template #default="{ row }">¥{{ formatCents(row.totalPaidCents) }}</template>
      </el-table-column>
      <el-table-column :label="$t('returning.lastOrder')" min-width="150">
        <template #default="{ row }">{{ formatDate(row.lastOrderAt) }}</template>
      </el-table-column>
      <el-table-column :label="$t('returning.daysSince')" min-width="140">
        <template #default="{ row }">{{ $t('returning.daysSince', { n: row.daysSinceLastOrder }) }}</template>
      </el-table-column>
      <el-table-column :label="$t('returning.copyScript')" width="130" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="copyScript(row)">{{ $t('returning.copyScript') }}</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span>{{ $t('returning.empty') }}</span>
      </template>
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../api/index.js'
import { formatDateTimeShort } from '../../utils/datetime.js'
import { formatCents } from '../../utils/money.js'

const { t } = useI18n()
const days = ref(30)
const items = ref([])
const loading = ref(false)

const formatDate = (str) => formatDateTimeShort(str)

// 天数快切竞态守卫：仅最新一次请求可写 items/loading（对齐项目 seq 模式）
let clientsSeq = 0
async function loadClients() {
  const mySeq = ++clientsSeq
  loading.value = true
  try {
    const res = await artistApi.getReturningClients(days.value)
    if (mySeq !== clientsSeq) return
    items.value = res.items || []
  } catch (err) {
    if (mySeq !== clientsSeq) return
    items.value = []
    ElMessage.error(err.message || t('returning.loadFailed'))
  } finally {
    if (mySeq === clientsSeq) loading.value = false
  }
}

/** 复制召回话术（含 QQ 与未下单天数） */
async function copyScript(row) {
  const text = t('returning.script', { days: row.daysSinceLastOrder, qq: row.clientQq })
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('returning.copySuccess'))
  } catch {
    ElMessage.warning(t('returning.copyFailed'))
  }
}

onMounted(loadClients)
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.returning-page { padding: 24px; max-width: 960px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点 */
.group {
  margin-top: 20px;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.returning-days { margin: 0; }
.returning-table { margin-top: 16px; background: var(--card, #fff); border: 1px solid var(--line, #e5e5e5); border-radius: var(--r-m, 8px); }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
