<script setup lang="ts">
// 825 波0：应用壳瘦身为路由出口；登录态与页面结构归各视图管。
// 原脚手架桥接自检页随路由化退役（桥接能力由 bridge 单测与登录链实测覆盖）。
</script>

<template>
  <router-view />
</template>

<style>
/* 全局底：纸墨纸色铺底，字体栈走 token */
:root {
  font-family: var(--f-b);
  font-size: 16px;
  line-height: 1.5;
  color: var(--ink);
  background-color: var(--paper);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
body { margin: 0; }
</style>
