<template>
  <ArtistLayout>
    <!-- v0.38 第二批: H1 文楷 28/700（REQ §1.3） -->
    <h2 class="font-display tier-page-title">{{ $t('tiers.title') }}</h2>

    <el-tabs v-model="activeTab" style="margin-top: 16px" @tab-change="onTabChange">
      <!-- v0.35 波1 (REQ-024 F2): 「档位」tab 并入画风体系——升级为「画风与价格」；原档位 CRUD 由迁移 v37 (F5) 承接 -->
      <!-- REQ-036 批A: ref 暴露 reload —— 修复「增项库建模板后切回画风页不刷新」 -->
      <el-tab-pane :label="$t('styleManage.tabStylesAndPricing')" name="artStyles" lazy>
        <ArtStyleManager ref="styleManagerRef" />
      </el-tab-pane>

      <!-- 倍率（02H: 已并入加购项池——日常入口=画风与价格页池内三类；tab 保留过渡标注） -->
      <el-tab-pane :label="$t('tiers.tabMultipliers')" name="multipliers" lazy>
        <div class="multiplier-merged-tip">{{ $t('styleManage.multiplierMergedTip') }}</div>
        <MultiplierManager />
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
  </ArtistLayout>
</template>

<script setup>
import { ref } from 'vue'
import ArtistLayout from '../../components/ArtistLayout.vue'
import MultiplierManager from '../../components/artist/MultiplierManager.vue'
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
const styleManagerRef = ref(null)
function onTabChange(name) {
  if (name === 'artStyles') {
    styleManagerRef.value?.reload()
  }
}
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.tier-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
/* tabs 下划线与文字走花青（EP 变量已 scoped 覆写，此处仅补激活字重观感） */
/* 02H: 倍率 tab 退居预置——过渡提示 */
.multiplier-merged-tip {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2);
  background: var(--paper2); border: 1px dashed var(--line2); border-radius: var(--r-m);
  padding: 8px 12px; margin-bottom: 12px; line-height: 1.6;
}
</style>
