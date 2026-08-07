<template>
  <div class="admin-page">
    <!-- 页头 -->
    <div class="page-head">
      <div>
        <h1 class="page-title font-display">{{ $t('admin.greetingManage') }}</h1>
        <p class="page-sub">{{ $t('admin.greetingGlobalHint') }}</p>
      </div>
    </div>

    <el-card shadow="never" class="section-card">
      <GreetingTable :artist-id="null" />
    </el-card>
  </div>
</template>

<script setup>
import GreetingTable from '../../components/admin/GreetingTable.vue'
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807） ═══ */
.admin-page { }

/* 页头 */
.page-head { margin-bottom: var(--sp-5, 24px); }
.page-title {
  font-size: var(--fs-page-title, 26px);
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 var(--sp-1, 4px);
  letter-spacing: .02em;
}
.page-sub { margin: 0; font-size: var(--fs-aux, 12.5px); color: var(--ink3); }

.section-card {
  border-radius: var(--r-l, 11px);
  border: 1px solid var(--line);
}
</style>
