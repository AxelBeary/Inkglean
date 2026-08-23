<template>
  <div class="special-day">
    <!-- 819-I：组头朱砂小印点 + 新建按钮在右 -->
    <div class="group-head sd-head">
      <div class="sd-head-text">
        <h2 class="sd-title font-display">{{ $t('admin.specialDayTitle') }}</h2>
        <p class="scope-hint">{{ $t('admin.specialDayHint') }}</p>
      </div>
      <el-button type="primary" size="small" @click="openCreate">
        ＋ {{ $t('admin.specialDayAdd') }}
      </el-button>
    </div>

    <!-- 特别日列表 -->
    <div class="sd-table-head">
      <span class="sd-col sd-col--name">{{ $t('admin.specialDayColName') }}</span>
      <span class="sd-col sd-col--date">{{ $t('admin.specialDayColDate') }}</span>
      <span class="sd-col sd-col--scope">{{ $t('admin.specialDayColScope') }}</span>
      <span class="sd-col sd-col--count">{{ $t('admin.specialDayColCount') }}</span>
      <span class="sd-col sd-col--enabled">{{ $t('admin.greetingColEnabled') }}</span>
      <span class="sd-col sd-col--actions">{{ $t('common.actions') }}</span>
    </div>
    <TransitionGroup tag="div" name="sd-row" class="sd-table-list" v-loading="loading">
      <div v-for="day in days" :key="day.id" class="sd-row" :class="{ 'sd-row--active': selected?.id === day.id }">
        <span class="sd-col sd-col--name" :class="{ 'sd-col--disabled': !day.is_enabled }" :data-label="$t('admin.specialDayColName')">{{ day.name }}</span>
        <span class="sd-col sd-col--date" :data-label="$t('admin.specialDayColDate')">
          <el-tag size="small" type="info">{{ day.date_key }}</el-tag>
        </span>
        <span class="sd-col sd-col--scope" :data-label="$t('admin.specialDayColScope')">
          {{ day.artist_id == null ? $t('admin.specialDayScopeGlobal') : `${$t('admin.specialDayScopeArtist')} · ${artistName(day.artist_id)}` }}
        </span>
        <span class="sd-col sd-col--count" :data-label="$t('admin.specialDayColCount')">{{ day.greeting_count }}</span>
        <span class="sd-col sd-col--enabled" :data-label="$t('admin.greetingColEnabled')">
          <el-switch
            v-model="day.is_enabled" :active-value="1" :inactive-value="0" size="small"
            :loading="togglingId === day.id" :disabled="togglingId === day.id || removingId != null"
            @change="(val: number) => toggleEnabled(day, val)"
          />
        </span>
        <span class="sd-col sd-col--actions">
          <el-button size="small" text type="primary" :disabled="removingId != null" @click="selectDay(day)">
            {{ $t('admin.specialDayEditGreetings') }}
          </el-button>
          <el-button
            size="small" type="danger" text
            :aria-label="$t('common.delete')"
            :loading="removingId === day.id" :disabled="removingId != null"
            @click="removeDay(day)"
          >✕</el-button>
        </span>
      </div>
    </TransitionGroup>
    <el-empty v-if="!loading && days.length === 0" :description="$t('admin.specialDayEmpty')" />

    <!-- 选中日的当日文案编辑（复用问候文案交互：增/删/启停） -->
    <div v-if="selected" class="sd-greetings">
      <div class="sd-greetings-head">
        <h3 class="sd-greetings-title">{{ $t('admin.specialDayGreetingsTitle', { name: selected.name }) }}</h3>
        <el-button size="small" text @click="selected = null">{{ $t('admin.specialDayCollapse') }}</el-button>
      </div>
      <!-- 819-I：一行一事——说明在左、添加控件在右 -->
      <div class="row add-row">
        <div class="sd-greeting-add-text">
          <div class="lab">{{ $t('admin.specialDayGreetingAddLabel') }}</div>
          <div class="desc">{{ $t('admin.specialDayGreetingAddDesc') }}</div>
        </div>
        <div class="sd-greeting-add-controls">
          <el-input
            v-model="newText" :placeholder="$t('admin.specialDayGreetingPh')" size="small"
            @keyup.enter="addGreeting" class="sd-greeting-input"
          />
          <el-button
            type="primary" size="small" @click="addGreeting" :loading="saving"
            :disabled="!newText.trim()"
          >
            ＋ {{ $t('common.add') }}
          </el-button>
        </div>
      </div>
      <TransitionGroup tag="div" name="sd-row" class="sd-greeting-list" v-loading="greetingsLoading">
        <div v-for="row in greetings" :key="row.id" class="sd-greeting-row">
          <span class="sd-greeting-text" :class="{ 'sd-col--disabled': !row.is_enabled }">{{ row.text }}</span>
          <el-switch
            v-model="row.is_enabled" :active-value="1" :inactive-value="0" size="small"
            :loading="greetingTogglingId === row.id" :disabled="greetingTogglingId === row.id || greetingRemovingId != null"
            @change="(val: number) => toggleGreetingEnabled(row, val)"
          />
          <el-button
            size="small" type="danger" text
            :aria-label="$t('common.delete')"
            :loading="greetingRemovingId === row.id" :disabled="greetingRemovingId != null"
            @click="removeGreeting(row)"
          >
            ✕
          </el-button>
        </div>
      </TransitionGroup>
      <el-empty v-if="!greetingsLoading && greetings.length === 0" :description="$t('admin.greetingEmpty')" />
    </div>

    <!-- 新建特别日弹窗 -->
    <el-dialog v-model="dialogVisible" :title="$t('admin.specialDayAdd')" width="560px" append-to-body>
      <!-- 819-I：一行一事——说明在左、控件在右 -->
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.specialDayNameLabel') }}</div>
          <div class="desc">{{ $t('admin.specialDayNameHint') }}</div>
        </div>
        <el-input v-model="form.name" :placeholder="$t('admin.specialDayNamePh')" maxlength="50" class="sd-name-input" />
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.specialDayDateLabel') }}</div>
          <div class="desc">{{ $t('admin.specialDayDateHint') }}</div>
        </div>
        <el-date-picker
          v-model="form.dateKey" type="date" value-format="MM-DD"
          :placeholder="$t('admin.specialDayDatePh')" class="sd-date-input"
        />
      </div>
      <div class="row">
        <div class="form-text">
          <div class="lab">{{ $t('admin.specialDayColScope') }}</div>
          <div class="desc">{{ $t('admin.specialDayScopeHint') }}</div>
        </div>
        <el-radio-group v-model="form.scope">
          <el-radio value="global">{{ $t('admin.specialDayScopeGlobal') }}</el-radio>
          <el-radio value="artist">{{ $t('admin.specialDayScopeArtist') }}</el-radio>
        </el-radio-group>
      </div>
      <div class="row" v-if="form.scope === 'artist'">
        <div class="form-text">
          <div class="lab">{{ $t('admin.specialDayArtistLabel') }}</div>
          <div class="desc">{{ $t('admin.specialDayArtistHint') }}</div>
        </div>
        <el-select v-model="form.artistId" :placeholder="$t('admin.specialDayArtistPh')" class="sd-artist-input">
          <el-option v-for="a in artists" :key="a.id" :value="a.id" :label="a.name" />
        </el-select>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" :disabled="!canSubmit" @click="submitCreate">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '../../api/index'
import type { SpecialDayListItem, GreetingTemplate, AdminArtistItem } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const days = ref<SpecialDayListItem[]>([])
const artists = ref<AdminArtistItem[]>([])
const loading = ref(false)
const selected = ref<SpecialDayListItem | null>(null)
const greetings = ref<GreetingTemplate[]>([])
const greetingsLoading = ref(false)
const newText = ref('')
const saving = ref(false)
const togglingId = ref<number | null>(null)
const removingId = ref<number | null>(null)
const greetingTogglingId = ref<number | null>(null)
const greetingRemovingId = ref<number | null>(null)

// 新建弹窗状态
const dialogVisible = ref(false)
const creating = ref(false)
/** 新建特别日表单（scope: global=全平台 / artist=指定画师） */
interface SpecialDayForm {
  name: string
  dateKey: string
  scope: string
  artistId: number | null
}
const form = ref<SpecialDayForm>({ name: '', dateKey: '', scope: 'global', artistId: null })

const canSubmit = computed(() =>
  form.value.name.trim() !== ''
  && /^\d{2}-\d{2}$/.test(form.value.dateKey || '')
  && (form.value.scope === 'global' || form.value.artistId != null)
)

const artistName = (id: number) => artists.value.find(a => a.id === id)?.name || `#${id}`

async function load() {
  loading.value = true
  try { days.value = await adminApi.getSpecialDays() }
  catch (err) { ElMessage.error((err as Error).message) }
  finally { loading.value = false }
}

async function loadArtists() {
  try { artists.value = await adminApi.getArtists() }
  catch { /* 画师列表加载失败不阻塞页面，指定画师选项会为空 */ }
}

function openCreate() {
  form.value = { name: '', dateKey: '', scope: 'global', artistId: null }
  dialogVisible.value = true
}

async function submitCreate() {
  if (!canSubmit.value) return
  creating.value = true
  try {
    await adminApi.createSpecialDay({
      name: form.value.name.trim(),
      dateKey: form.value.dateKey,
      artistId: form.value.scope === 'artist' ? form.value.artistId : null
    })
    dialogVisible.value = false
    await load()
  } catch (err) { ElMessage.error((err as Error).message) }
  finally { creating.value = false }
}

async function toggleEnabled(day: SpecialDayListItem, val: unknown) {
  if (togglingId.value === day.id) return
  togglingId.value = day.id
  try { await adminApi.updateSpecialDay(day.id, { isEnabled: !!val }) }
  catch (err) {
    ElMessage.error((err as Error).message)
    await load()
  } finally {
    togglingId.value = null
  }
}

async function removeDay(day: SpecialDayListItem) {
  try {
    await ElMessageBox.confirm(
      t('admin.specialDayDeleteConfirm', { name: day.name }),
      t('common.confirmDeleteTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  if (removingId.value === day.id) return
  removingId.value = day.id
  try {
    await adminApi.deleteSpecialDay(day.id)
    if (selected.value?.id === day.id) { selected.value = null; greetings.value = [] }
    await load()
  } catch (err) { ElMessage.error((err as Error).message) }
  finally { removingId.value = null }
}

// ─── 当日文案编辑 ───

async function selectDay(day: SpecialDayListItem) {
  selected.value = day
  newText.value = ''
  await loadGreetings()
}

async function loadGreetings() {
  if (!selected.value) return
  greetingsLoading.value = true
  try { greetings.value = await adminApi.getSpecialDayGreetings(selected.value.id) }
  catch (err) { ElMessage.error((err as Error).message) }
  finally { greetingsLoading.value = false }
}

async function addGreeting() {
  if (!newText.value.trim() || !selected.value) return
  saving.value = true
  try {
    // 当日文案按时段无差别投放，固定 any；关联当前特别日
    await adminApi.createGreeting({ text: newText.value.trim(), timeSlot: 'any', specialDayId: selected.value.id })
    newText.value = ''
    await Promise.all([loadGreetings(), load()])
  } catch (err) { ElMessage.error((err as Error).message) }
  finally { saving.value = false }
}

async function toggleGreetingEnabled(row: GreetingTemplate, val: unknown) {
  if (greetingTogglingId.value === row.id) return
  greetingTogglingId.value = row.id
  try { await adminApi.updateGreeting(row.id, { isEnabled: !!val }) }
  catch (err) {
    ElMessage.error((err as Error).message)
    await loadGreetings()
  } finally {
    greetingTogglingId.value = null
  }
}

async function removeGreeting(row: GreetingTemplate) {
  try {
    await ElMessageBox.confirm(
      t('admin.greetingDeleteConfirm'),
      t('common.confirmDeleteTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  if (greetingRemovingId.value === row.id) return
  greetingRemovingId.value = row.id
  try {
    await adminApi.deleteGreeting(row.id)
    await Promise.all([loadGreetings(), load()])
  } catch (err) { ElMessage.error((err as Error).message) }
  finally { greetingRemovingId.value = null }
}

onMounted(() => {
  load()
  loadArtists()
})
</script>

<style scoped>
/* 819-I：组头带朱砂小印点（对齐 QuickNote 基准） */
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}
.sd-head { justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.sd-head-text { min-width: 0; }
.sd-title { font-size: 16px; color: var(--ink); margin: 0 0 4px; }
.scope-hint { font-size: 12px; color: var(--ink2); margin: 0; }

/* ─── 特别日列表（对齐 GreetingTable 纸墨网格列表） ─── */
.sd-table-head,
.sd-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 90px minmax(120px, 1fr) 60px 70px 140px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  box-sizing: border-box;
}
.sd-table-head {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink2);
  background: var(--paper2);
  border: 1px solid var(--line);
  border-bottom: none;
  border-radius: var(--r-m) var(--r-m) 0 0;
}
.sd-table-list {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 0 0 var(--r-m) var(--r-m);
  overflow: hidden;
}
.sd-row {
  background: var(--card);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink);
}
.sd-row:nth-child(even) { background: var(--paper2); }
.sd-row:last-child { border-bottom: none; }
.sd-row--active { background: color-mix(in srgb, var(--ink) 6%, var(--card)); }
.sd-col--disabled { opacity: 0.4; transition: opacity var(--dur-mid); }
.sd-col--actions { text-align: right; }
.sd-row-enter-active,
.sd-row-leave-active { transition: opacity var(--dur-mid); }
.sd-row-enter-from,
.sd-row-leave-to { opacity: 0; }
.sd-row-leave-active { position: absolute; width: 100%; }

/* ─── 当日文案编辑区 ─── */
.sd-greetings { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--line); }
.sd-greetings-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.sd-greetings-title { font-size: 14px; color: var(--ink); margin: 0; }

/* 819-I：一行一事（说明在左、控件在右） */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.sd-greeting-add-text { min-width: 0; }
.sd-greeting-add-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.sd-greeting-input { width: 320px; flex: none; }
.add-row { margin-bottom: 12px; }
.form-text { min-width: 0; }
.sd-name-input { width: 280px; flex: none; }
.sd-date-input { width: 200px; flex: none; }
.sd-artist-input { width: 280px; flex: none; }
.sd-greeting-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  overflow: hidden;
}
.sd-greeting-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 70px 70px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  background: var(--card);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink);
}
.sd-greeting-row:nth-child(even) { background: var(--paper2); }
.sd-greeting-row:last-child { border-bottom: none; }
.sd-greeting-text { min-width: 0; word-break: break-word; }

/* ≤720px 容器宽单列布局（对齐 GreetingTable P1-B 模式；824 响应式巡逻：
   @media 改 @container——768 窗口下容器已不足 720，窗口断点不触发致操作列溢出 18px） */
@container (max-width: 720px) {
  .sd-table-head { display: none; }
  .sd-row {
    grid-template-columns: 1fr auto auto;
    gap: 8px 12px;
    padding: 12px;
  }
  .sd-col--name { grid-column: 1 / -1; }
  .sd-col--date { grid-column: 1; }
  .sd-col--enabled { grid-column: 2; }
  .sd-col--actions { grid-column: 3; text-align: right; }
  .sd-col--date::before,
  .sd-col--enabled::before {
    content: attr(data-label);
    display: block;
    font-size: 11px;
    color: var(--ink3);
    margin-bottom: 4px;
  }
  .sd-greeting-row { grid-template-columns: 1fr auto auto; }
  .row { grid-template-columns: 1fr; }
  .sd-greeting-add-controls { justify-content: flex-start; }
  .sd-greeting-input { width: 100%; }
  .sd-name-input, .sd-date-input, .sd-artist-input { width: 100%; }
}
</style>
