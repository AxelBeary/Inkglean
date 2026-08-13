<template>
  <div class="admin-page">
    <!-- 页头 -->
    <div class="admin-page-head">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.greetingManage') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.greetingGlobalHint') }}</p>
      </div>
    </div>

    <el-card shadow="never" class="admin-section-card">
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

</style>
