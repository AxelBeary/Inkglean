<template>
  <div class="admin-page">
    <el-page-header @back="$router.push('/admin')" :title="$t('admin.backToPanel')" :content="$t('admin.greetingManage')" />
    <el-card style="margin-top: 16px">
      <GreetingTable :artist-id="null" />
    </el-card>
  </div>
</template>

<script setup>
import GreetingTable from '../../components/admin/GreetingTable.vue'
</script>

<style scoped>
.admin-page { max-width: 900px; margin: 0 auto; padding: 16px; }
</style>
