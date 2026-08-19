<template>
  <!-- v0.38 第二批: H1 文楷 28/700（REQ §1.3） -->
  <!-- 817 修复：不再内嵌 ArtistLayout——/tiers 已归入嵌套路由，布局由 ArtistLayoutRoute 单实例承载 -->
  <h2 class="font-display tier-page-title">{{ $t('tiers.title') }}</h2>

  <el-tabs v-model="activeTab" style="margin-top: 16px" @tab-change="onTabChange">
    <!-- v0.35 波1 (REQ-024 F2): 「档位」tab 并入画风体系——升级为「画风与价格」；原档位 CRUD 由迁移 v37 (F5) 承接 -->
    <!-- REQ-036 批A: ref 暴露 reload —— 修复「增项库建模板后切回画风页不刷新」 -->
    <el-tab-pane :label="$t('styleManage.tabStylesAndPricing')" name="artStyles" lazy>
      <ArtStyleManager ref="styleManagerRef" />
    </el-tab-pane>

    <!-- 流程与比例 -->
    <el-tab-pane :label="$t('tiers.tabWorkflow')" name="workflow" lazy>
      <WorkflowPaymentEditor />
    </el-tab-pane>

    <!-- v0.31 F3: 折扣码 -->
    <el-tab-pane :label="$t('tiers.tabDiscount')" name="discount" lazy>
      <DiscountCodeManager />
    </el-tab-pane>

    <!-- v0.32 REQ-023 Phase1: 增项库 -->
    <el-tab-pane :label="$t('styleManage.tabTemplates')" name="addonTemplates" lazy>
      <AddonTemplateManager />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WorkflowPaymentEditor from '../../components/artist/WorkflowPaymentEditor.vue'
import DiscountCodeManager from '../../components/artist/DiscountCodeManager.vue'
import ArtStyleManager from '../../components/artist/ArtStyleManager.vue'
import AddonTemplateManager from '../../components/artist/AddonTemplateManager.vue'

// v0.35 波1 (REQ-024 F2): 默认落在「画风与价格」（原「档位」tab 已移除）
const activeTab = ref('artStyles')

// REQ-036 批A (任务1-1): 切 tab 数据不刷新修复
// 背景: el-tab-pane lazy 首次激活后保持挂载，切回「画风与价格」不会重新 onMounted
// 表现: 画师在「增项库」新建模板后切回，看不到新模板（旧代码必须手动刷新页面）
// 修复: 切回 artStyles 时调用子组件暴露的 reload() 重新拉取
const styleManagerRef = ref<{ reload: () => void } | null>(null)
function onTabChange(name: string | number) {
  if (name === 'artStyles') {
    styleManagerRef.value?.reload()
  }
}
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.tier-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
/* SPEC-PRICE-2（v50）：倍率 tab 已彻底移除——用途/加急统一为增项库/加购项池内的 category 维度 */
</style>
