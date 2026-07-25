<template>
  <ArtistLayout>
    <el-page-header @back="goBack" :title="backTitle" :content="`订单 #${order?.order_no}`" />

    <div v-if="order" class="order-detail">
      <!-- 基本信息 -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>订单信息</span>
            <el-tag :type="statusType(order.status)">{{ statusLabel(order.status) }}</el-tag>
          </div>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ order.order_no }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ order.tier_name || '自定义' }}</el-descriptions-item>
          <el-descriptions-item label="客户QQ">{{ order.client_qq }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ order.client_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="优先级">
            <el-select v-model="order.priority" @change="changePriority" size="small" style="width: 100px">
              <el-option value="high" label="高" />
              <el-option value="medium" label="中" />
              <el-option value="low" label="低" />
            </el-select>
          </el-descriptions-item>
          <el-descriptions-item label="来源">{{ order.source === 'self' ? '客户自助' : '手动录入' }}</el-descriptions-item>
          <el-descriptions-item label="下单时间" :span="2">{{ formatDate(order.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="需求描述" :span="2">{{ order.description || '无' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 状态操作 -->
      <el-card style="margin-top: 16px">
        <template #header>状态流转</template>
        <el-steps :active="stepActive" finish-status="success" simple>
          <el-step title="待确认" />
          <el-step title="已确认" />
          <el-step title="制作中" />
          <el-step title="已完成" />
          <el-step title="已交付" />
        </el-steps>
        <div class="status-actions">
          <el-button v-if="order.status === 'pending'" type="primary" @click="changeStatus('confirmed')">✅ 确认接单</el-button>
          <el-button v-if="order.status === 'confirmed'" type="warning" @click="changeStatus('wip')">🎨 开始制作</el-button>
          <el-button v-if="['wip','revision'].includes(order.status)" @click="changeStatus('revision')">✏️ 需要修改</el-button>
          <el-button v-if="['wip','revision'].includes(order.status)" type="success" @click="changeStatus('done')">✔ 标记完成</el-button>
          <el-button v-if="order.status === 'done'" type="success" @click="showDeliver = true">📦 上传交付</el-button>
          <el-button v-if="!['delivered','cancelled'].includes(order.status)" type="danger" plain @click="changeStatus('cancelled')">❌ 取消订单</el-button>
        </div>
      </el-card>

      <!-- 参考图 -->
      <el-card style="margin-top: 16px" v-if="order.references?.length">
        <template #header>参考图</template>
        <div class="ref-grid">
          <el-image v-for="ref in order.references" :key="ref.id"
            :src="`/uploads/${ref.file_path}`" fit="cover" class="ref-img"
            :preview-src-list="order.references.map(r => `/uploads/${r.file_path}`)" />
        </div>
      </el-card>

      <!-- 备注 -->
      <el-card style="margin-top: 16px">
        <template #header>备注记录</template>
        <div class="notes">
          <div v-for="note in order.notes" :key="note.id" class="note-item">
            <span class="note-time">{{ formatDate(note.created_at) }}</span>
            <span class="note-content">{{ note.content }}</span>
          </div>
          <el-empty v-if="!order.notes?.length" description="暂无备注" :image-size="60" />
        </div>
        <div class="note-input">
          <el-input v-model="newNote" placeholder="添加备注..." @keyup.enter="addNote" />
          <el-button type="primary" @click="addNote">添加</el-button>
        </div>
      </el-card>

      <!-- 交付文件 -->
      <el-card style="margin-top: 16px" v-if="order.deliverables?.length">
        <template #header>交付文件</template>
        <div v-for="d in order.deliverables" :key="d.id" class="file-item">
          <span>📄 {{ d.original_name }}</span>
          <el-button size="small" @click="openFile(d.file_path)">下载</el-button>
        </div>
      </el-card>
    </div>

    <!-- 交付弹窗 -->
    <el-dialog v-model="showDeliver" title="上传交付文件" width="400px">
      <el-upload drag :auto-upload="false" :limit="1" :on-change="handleDeliverFile">
        <el-icon style="font-size: 40px; color: #999"><Upload /></el-icon>
        <p>拖拽文件到此处，或点击上传</p>
      </el-upload>
      <template #footer>
        <el-button @click="showDeliver = false">取消</el-button>
        <el-button type="primary" @click="submitDeliver" :disabled="!deliverFile">确认交付</el-button>
      </template>
    </el-dialog>
  </ArtistLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import ArtistLayout from '../../components/ArtistLayout.vue'

const route = useRoute()
const router = useRouter()
const order = ref(null)
const newNote = ref('')
const showDeliver = ref(false)
const deliverFile = ref(null)

// 返回来源页：排期看板进来回排期，订单列表进来回列表，直接访问则默认回列表
const fromQueue = route.query.from === 'queue'
const backTitle = fromQueue ? '返回排期看板' : '返回订单列表'
function goBack() {
  router.push(fromQueue ? '/queue' : '/orders')
}

const statusType = (s) => ({
  pending: 'info', confirmed: 'primary', wip: 'warning',
  revision: 'warning', done: 'success', delivered: 'success', cancelled: 'danger'
}[s] || 'info')
const statusLabel = (s) => ({
  pending: '待确认', confirmed: '已确认', wip: '制作中',
  revision: '修改中', done: '已完成', delivered: '已交付', cancelled: '已取消'
}[s] || s)

const stepActive = computed(() => {
  const map = { pending: 0, confirmed: 1, wip: 2, revision: 2, done: 3, delivered: 4, cancelled: -1 }
  return map[order.value?.status] ?? 0
})

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleString('zh-CN')
}

async function loadOrder() {
  try {
    order.value = await artistApi.getOrder(route.params.id)
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function changeStatus(status) {
  if (status === 'cancelled') {
    try {
      await ElMessageBox.confirm('确定取消此订单？', '确认', { type: 'warning' })
    } catch { return }
  }
  try {
    order.value = await artistApi.updateStatus(route.params.id, status)
    ElMessage.success('状态已更新')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function changePriority(priority) {
  try {
    await artistApi.updatePriority(route.params.id, priority)
    ElMessage.success('优先级已更新')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function addNote() {
  if (!newNote.value.trim()) return
  try {
    order.value = await artistApi.addNote(route.params.id, newNote.value.trim())
    newNote.value = ''
    ElMessage.success('备注已添加')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

function openFile(filePath) {
  window.open(`/uploads/${filePath}`, '_blank')
}

function handleDeliverFile(file) {
  deliverFile.value = file.raw
}

async function submitDeliver() {
  if (!deliverFile.value) return
  try {
    const uploaded = await uploadApi.deliverable(deliverFile.value)
    order.value = await artistApi.deliver(route.params.id, {
      filePath: uploaded.filePath,
      fileName: uploaded.originalName
    })
    showDeliver.value = false
    deliverFile.value = null
    ElMessage.success('交付成功！')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(loadOrder)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.status-actions { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
.ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.ref-img { height: 120px; width: 100%; border-radius: 6px; }
.notes { max-height: 200px; overflow-y: auto; margin-bottom: 12px; }
.note-item { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.note-time { color: #999; font-size: 12px; margin-right: 8px; }
.note-input { display: flex; gap: 8px; }
.note-input .el-input { flex: 1; }
.file-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
</style>
