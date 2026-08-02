<template>
  <div class="admin-page">
    <el-card>
      <GreetingTable :artist-id="null" />
    </el-card>
  </div>
</template>

<script setup>
import GreetingTable from '../../components/admin/GreetingTable.vue'
</script>

<style scoped>
.admin-page { /* 容器由 AdminLayout 提供 */ }
</style>
