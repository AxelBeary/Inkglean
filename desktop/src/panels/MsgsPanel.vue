<script setup lang="ts">
// msgs 板块「留言」（方向 A 长卷·题跋 aside 区）：留言审核（fetchMessages）。
// 通过/驳回调 artist.ts 追加的 approveMessage / rejectMessage（同网页端口径）。
// 框架纪律（§4.3）：本地模式/断网整块隐藏，本组件只在云端且在线时被渲染。
// 数据由 Home 统一取、失败静默降级为一行轻量提示。
import { computed, ref } from 'vue'
import type { GuestbookMessage } from '../api/types'
import { approveMessage, rejectMessage } from '../api/artist'
import { WEB_BASE } from '../config'

const props = defineProps<{
  messages: GuestbookMessage[] | null
  failed: boolean
}>()

/** 行级操作态：'busy-approve' | 'busy-reject' | null */
const busy = ref<Record<number, 'approve' | 'reject' | null>>({})

const list = computed(() => props.messages ?? [])
const pendingCount = computed(() => list.value.filter(m => m.status === 'pending').length)
const earliestText = computed(() => {
  if (list.value.length === 0) return ''
  const oldest = list.value.reduce((a, b) => (a.created_at < b.created_at ? a : b))
  return `最早 ${relTime(oldest.created_at)}`
})

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

async function act(m: GuestbookMessage, action: 'approve' | 'reject') {
  if (busy.value[m.id]) return
  busy.value[m.id] = action
  try {
    if (action === 'approve') {
      const updated = await approveMessage(m.id)
      replace(m.id, updated)
    } else {
      await rejectMessage(m.id)
      replace(m.id, { ...m, status: 'rejected' })
    }
  } catch {
    // 失败静默：行保持原状，不弹错误框（下次刷新自愈）
  } finally {
    busy.value[m.id] = null
  }
}

/** 就地替换行数据（Home 传入的数组只读，板块内部维护展示态） */
const override = ref<GuestbookMessage[]>([])
function replace(id: number, row: GuestbookMessage) {
  override.value = [...override.value.filter(o => o.id !== id), row]
}
const shown = computed(() =>
  list.value.map(m => override.value.find(o => o.id === m.id) ?? m)
)

async function goWeb() {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(WEB_BASE)
  } catch {
    window.open(WEB_BASE, '_blank', 'noopener')
  }
}
</script>

<template>
  <div class="sec-head">
    <h2>留言</h2>
    <span class="meta">{{ pendingCount }} 条待审<template v-if="earliestText"> · {{ earliestText }}</template></span>
  </div>

  <p v-if="failed" class="msgs-empty">暂时取不到留言</p>
  <p v-else-if="shown.length === 0" class="msgs-empty">暂无留言</p>
  <div v-else class="slips">
    <div v-for="m in shown" :key="m.id" class="slip" :class="{ done: m.status !== 'pending' }">
      <span class="who" :title="m.nickname">{{ m.nickname }}</span>
      <span class="txt" :title="m.content">{{ m.content }}</span>
      <span class="when">{{ relTime(m.created_at) }}</span>
      <span v-if="m.status === 'pending'" class="acts">
        <button type="button" class="act act--ok" :disabled="!!busy[m.id]" @click="act(m, 'approve')">
          {{ busy[m.id] === 'approve' ? '…' : '通过' }}
        </button>
        <button type="button" class="act" :disabled="!!busy[m.id]" @click="act(m, 'reject')">
          {{ busy[m.id] === 'reject' ? '…' : '驳回' }}
        </button>
      </span>
      <span v-else class="st">{{ m.status === 'approved' ? '已展示' : '已驳回' }}</span>
    </div>
  </div>
  <div v-if="WEB_BASE" class="go">
    <button type="button" @click="goWeb">去网页版审核 →</button>
  </div>
</template>

<style scoped>
.sec-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.sec-head h2 { font-family: var(--f-d); font-size: 17px; font-weight: 700; letter-spacing: .08em; color: var(--ink); line-height: 1.25; }
.sec-head .meta { font-size: 12px; color: var(--ink4); }
.msgs-empty { margin: 10px 0; font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }

/* 竹简：一条一枚横简，左侧细装订绳贯穿（照原型移植，收敛为定高行） */
.slips { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 2px 0 2px 14px; margin-top: 8px; }
.slips::before {
  content: ""; position: absolute; left: 5px; top: -4px; bottom: -4px;
  width: 1.5px; background: rgba(90, 86, 75, .35); border-radius: 1px;
}
.slip {
  position: relative; display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px;
  background: var(--card); border: 1px solid rgba(var(--ink-rgb), .06); border-radius: 5px 7px 6px 8px;
  transition: background var(--dur-fast) var(--ease-out); min-width: 0; flex: none;
}
.slip::before {
  content: ""; position: absolute; left: -12px; top: 50%; transform: translateY(-50%);
  width: 5px; height: 1.5px; background: rgba(90, 86, 75, .35);
}
.slip:hover { background: var(--paper2); }
.slip.done { opacity: .6; }
/* 826 终验防塌方：CJK 无 nowrap 保护时窄列下会一字一行竖叠（字号放大后实测报障）；
   昵称/时间/状态签一律单行截断，昵称限宽防长名挤爆行 */
.who {
  font-size: 13px; font-weight: 600; color: var(--ink2); flex: none;
  max-width: 9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.txt { font-size: 13px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.when { font-size: 11.5px; color: var(--ink4); flex: none; white-space: nowrap; }
.st { font-size: 11.5px; color: var(--ink4); flex: none; white-space: nowrap; }
.acts { display: flex; gap: 6px; flex: none; }
.act {
  font-size: 11.5px; color: var(--ink3); padding: 3px 8px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
}
.act:hover:not(:disabled) { color: var(--ink); border-color: var(--ink4); }
.act--ok:hover:not(:disabled) { color: var(--sl); border-color: var(--sl); background: var(--sl-t); }
.act:disabled { opacity: 0.5; cursor: wait; }
.go { margin-top: auto; padding-top: 10px; }
/* 跳转签：纸签脉——纸底 + 细边 + 手剪角，去裸按钮浏览器默认框（826 终验整改） */
.go button {
  font-size: 12.5px; color: var(--hq-d); font-weight: 500;
  padding: 5px 12px; background: var(--hq-t);
  border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.go button:hover { color: var(--hq); background: var(--hq-t2); border-color: var(--hq); }
</style>
