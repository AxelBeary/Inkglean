<template>
  <div class="order-form-page">
    <div class="page-prefs"><ThemeToggle /></div>
    <div class="form-container" v-loading="loading">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('orderForm.backHome')" :content="$t('orderForm.title')" />

      <el-card style="margin-top: 16px" v-if="artist">
        <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
          <!-- 档位选择 -->
          <el-form-item :label="$t('orderForm.tierLabel')" prop="tierId">
            <el-select v-model="form.tierId" :placeholder="$t('orderForm.tierPlaceholder')" style="width: 100%" @change="onTierChange">
              <el-option v-for="tier in tiers" :key="tier.id" :label="`${tier.name} - ¥${tier.price}`" :value="tier.id" />
            </el-select>
          </el-form-item>

          <!-- R14: 紧凑计价摘要（选完档位后先显示基础价，详细计价渐进展开） -->
          <div v-if="form.tierId && selectedTier" class="pricing-summary">
            <span class="pricing-summary-name">{{ selectedTier.name }}</span>
            <span class="pricing-summary-price">¥{{ selectedTier.price }}</span>
            <button
              v-if="hasPricingExtras"
              type="button"
              class="pricing-expand-btn"
              @click="pricingExpanded = !pricingExpanded"
            >
              {{ $t('orderForm.pricingDetail') }} {{ pricingExpanded ? '▾' : '▸' }}
            </button>
          </div>

          <!-- 增项选择（R14: 展开后才显示） -->
          <Transition name="pricing-expand">
            <div v-if="pricingExpanded && form.tierId">
              <el-form-item v-if="availableAddons.length > 0" label="可选增项">
                <div class="addon-groups">
                  <div v-for="group in addonGroups" :key="group.category" class="addon-group">
                    <div class="addon-group-title" @click="group.collapsed = !group.collapsed">
                      <span>{{ group.icon }} {{ group.label }}</span>
                      <span class="collapse-arrow">{{ group.collapsed ? '▸' : '▾' }}</span>
                    </div>
                    <div v-show="!group.collapsed" class="addon-items">
                      <div v-for="a in group.items" :key="a.id" class="addon-item">
                        <div class="addon-item-info">
                          <span class="addon-item-name">{{ a.name }}</span>
                          <span class="addon-item-price">{{ formatAddonPrice(a) }}</span>
                          <span v-if="a.description" class="addon-item-desc">{{ a.description }}</span>
                        </div>
                        <!-- 数量模式 -->
                        <el-input-number
                          v-if="a.select_mode === 'quantity'"
                          v-model="addonSelections[a.id]"
                          :min="0" :max="a.max_qty" size="small" style="width: 110px"
                        />
                        <!-- 开关模式 -->
                        <el-switch
                          v-else-if="a.select_mode === 'toggle'"
                          v-model="addonToggles[a.id]" size="small"
                        />
                        <!-- 面议模式（P1-C 修复：改为 toggle，需用户显式勾选） -->
                        <el-switch
                          v-else-if="a.select_mode === 'inquiry'"
                          v-model="addonToggles[a.id]" size="small"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </el-form-item>

              <!-- 倍率选择 -->
              <el-form-item v-if="usageMultipliers.length > 0 || rushMultipliers.length > 0" label="用途与加急">
                <div class="multiplier-section">
                  <div v-if="usageMultipliers.length > 0" class="multiplier-row">
                    <span class="multiplier-label">用途：</span>
                    <el-radio-group v-model="form.usageMultiplierId" size="small">
                      <el-radio-button :value="null">个人</el-radio-button>
                      <el-radio-button v-for="m in usageMultipliers" :key="m.id" :value="m.id">
                        {{ m.name }} ×{{ m.multiplier }}
                      </el-radio-button>
                    </el-radio-group>
                  </div>
                  <div v-if="rushMultipliers.length > 0" class="multiplier-row">
                    <span class="multiplier-label">加急：</span>
                    <el-radio-group v-model="form.rushMultiplierId" size="small">
                      <el-radio-button :value="null">不加急</el-radio-button>
                      <el-radio-button v-for="m in rushMultipliers" :key="m.id" :value="m.id">
                        {{ m.name }} ×{{ m.multiplier }}
                      </el-radio-button>
                    </el-radio-group>
                  </div>
                </div>
              </el-form-item>

              <!-- 实时价格预览（R14: 展开后才显示） -->
              <div v-if="form.tierId && pricePreview" class="price-preview">
                <div class="price-line" v-for="item in pricePreview.breakdown" :key="item.name">
                  <span>{{ item.name }}</span>
                  <span class="price-amount">¥{{ item.amount.toFixed(2) }}</span>
                </div>
                <div class="price-divider"></div>
                <div class="price-line total">
                  <span>总价</span>
                  <span class="price-amount">¥{{ pricePreview.totalPrice.toFixed(2) }}</span>
                </div>
                <div v-if="pricePreview.installments.length > 1" class="installment-row">
                  <span v-for="inst in pricePreview.installments" :key="inst.label" class="installment-chip">
                    {{ inst.label }} ¥{{ inst.amount.toFixed(2) }}
                  </span>
                </div>
              </div>
            </div>
          </Transition>

          <!-- 流程与收款预览（R1: 保持原位，增加修改说明告示） -->
          <el-form-item v-if="workflowStages.length || artist?.revisionNote" :label="$t('orderForm.workflowLabel')">
            <WorkflowOverviewStrip v-if="workflowStages.length" :stages="workflowStages" />
            <div v-if="artist?.revisionNote" class="tpl-revision-note">
              <span class="tpl-revision-note-icon" aria-hidden="true">✏️</span>
              <span>
                <strong class="tpl-revision-note-label">{{ $t('artistHome.revisionNote') }}</strong>
                {{ artist.revisionNote }}
              </span>
            </div>
          </el-form-item>

          <!-- 需求描述 -->
          <el-form-item :label="$t('orderForm.descLabel')" prop="description">
            <el-input
              v-model="form.description" type="textarea" :rows="5"
              :placeholder="$t('orderForm.descPlaceholder')" maxlength="2000" show-word-limit
            />
          </el-form-item>

          <!-- 参考图上传 -->
          <el-form-item :label="$t('orderForm.refLabel')">
            <el-upload
              :auto-upload="true" :http-request="handleRefUpload"
              accept="image/*" list-type="picture-card" :limit="5"
              :file-list="refFileList" :on-exceed="() => ElMessage.warning($t('orderForm.refExceed'))"
              :on-remove="handleRefRemove"
            >
              <el-icon aria-label="上传参考图"><Plus /></el-icon>
            </el-upload>
            <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
          </el-form-item>

          <!-- QQ号 -->
          <el-form-item :label="$t('orderForm.qqLabel')" prop="clientQq">
            <el-input v-model="form.clientQq" :placeholder="$t('orderForm.qqPlaceholder')" />
          </el-form-item>

          <!-- 昵称 -->
          <el-form-item :label="$t('orderForm.nameLabel')">
            <el-input v-model="form.clientName" :placeholder="$t('orderForm.namePlaceholder')" />
          </el-form-item>

          <!-- QQ通知 -->
          <el-form-item v-if="artist.notifyEnabled">
            <el-checkbox v-model="form.notifyEnabled">{{ $t('orderForm.notifyLabel') }}</el-checkbox>
          </el-form-item>

          <!-- 须知确认（消毒后渲染） -->
          <el-form-item v-if="rulesContent" prop="agreed">
            <el-card shadow="never" class="rules-preview">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-html="sanitizedRules" class="rules-html"></div>
            </el-card>
            <el-checkbox v-model="form.agreed" style="margin-top: 8px">
              {{ $t('orderForm.agreeLabel') }}
            </el-checkbox>
          </el-form-item>

          <!-- 平台职责声明 -->
          <el-form-item>
            <Disclaimer />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="submit" :loading="submitting" style="width: 100%">
              {{ $t('orderForm.submit') }}
              <template v-if="pricePreview"> — ¥{{ pricePreview.totalPrice.toFixed(2) }}</template>
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <!-- 成功弹窗 -->
    <el-dialog v-model="showSuccess" :title="$t('orderForm.successTitle')" width="380px" :close-on-click-modal="false">
      <el-result icon="success" :title="$t('orderForm.orderNoIs') + resultNo">
        <template #sub-title>{{ $t('orderForm.addQqHint') }}</template>
        <template #extra>
          <!-- R58-6: 画师 QQ 跳转 + 复制 -->
          <div v-if="artist?.contactQq" class="success-qq">
            <span class="success-qq-label">{{ $t('orderForm.artistQqLabel') }}</span>
            <code class="success-qq-no">{{ artist.contactQq }}</code>
            <div class="success-qq-actions">
              <el-button type="primary" @click="jumpToQq(artist.contactQq)">{{ $t('orderForm.jumpQq') }}</el-button>
              <el-button @click="copyQq(artist.contactQq)">{{ $t('orderForm.copyQq') }}</el-button>
            </div>
          </div>
          <el-button type="primary" @click="$router.push(`/artist/${subdomain}/track?no=${resultNo}`)">
            {{ $t('orderForm.viewProgress') }}
          </el-button>
        </template>
      </el-result>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import Disclaimer from '../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../components/shared/WorkflowOverviewStrip.vue'
import ThemeToggle from '../../components/ThemeToggle.vue'
import { useOrderForm } from '../../composables/useOrderForm.js'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain
const formRef = ref(null)

// R58-1: 表单业务逻辑全部由共享 composable 提供，页面只保留布局与样式
const {
  artist, tiers, rulesContent, loading, workflowStages,
  form, rules,
  submitting, showSuccess, resultNo, submit,
  refFileList, handleRefUpload, handleRefRemove,
  addonSelections, addonToggles, pricePreview, pricingExpanded,
  selectedTier, hasPricingExtras, addonGroups,
  usageMultipliers, rushMultipliers, formatAddonPrice, onTierChange,
  sanitizedRules
} = useOrderForm(subdomain, formRef)

// ─── R58-6: QQ 跳转 + 复制（提交成功后联系画师） ───
function jumpToQq(qq) {
  window.open(`tencent://message/?uin=${encodeURIComponent(qq)}`, '_self')
}
async function copyQq(qq) {
  try {
    await navigator.clipboard.writeText(qq)
    ElMessage.success(t('orderForm.qqCopied'))
  } catch {
    ElMessage.warning(qq) // 剪贴板不可用时直接展示 QQ 号供手动复制
  }
}
</script>

<style scoped>
.order-form-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding: 16px;
  transition: background 0.3s;
  position: relative;
}
.page-prefs { position: absolute; top: 16px; right: 16px; z-index: 10; }
.form-container { max-width: 600px; margin: 0 auto; }
.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

/* R14: 紧凑计价摘要 + 渐进展开 */
.pricing-summary {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; margin-bottom: 12px;
  background: var(--bg-inset); border: 1px solid var(--border-color); border-radius: 8px;
}
.pricing-summary-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.pricing-summary-price { font-size: 16px; font-weight: 700; color: var(--el-color-primary); }
.pricing-expand-btn {
  margin-left: auto; padding: 4px 10px;
  background: transparent; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 12px; color: var(--text-secondary); cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.pricing-expand-btn:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.pricing-expand-enter-active, .pricing-expand-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.pricing-expand-enter-from, .pricing-expand-leave-to { opacity: 0; transform: translateY(-8px); }
.rules-preview { max-height: 200px; overflow-y: auto; }
.rules-html { line-height: 1.8; color: var(--text-primary); }

/* 增项分组 */
.addon-groups { width: 100%; }
.addon-group { margin-bottom: 12px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.addon-group-title {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: var(--bg-inset); cursor: pointer;
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  user-select: none;
}
.addon-group-title:hover { background: var(--bg-hover); }
.collapse-arrow { color: var(--text-muted); font-size: 12px; }
.addon-items { padding: 8px 14px; }
.addon-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid var(--border-color);
}
.addon-item:last-child { border-bottom: none; }
.addon-item-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.addon-item-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.addon-item-price { font-size: 12px; color: var(--el-color-primary); font-weight: 600; }
.addon-item-desc { font-size: 11px; color: var(--text-secondary); }

/* 倍率 */
.multiplier-section { width: 100%; }
.multiplier-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.multiplier-label { font-size: 13px; color: var(--text-secondary); flex-shrink: 0; }

/* 价格预览 */
.price-preview {
  background: var(--bg-inset); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;
}
.price-line { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; color: var(--text-secondary); }
.price-line.total { font-size: 16px; font-weight: 700; color: var(--text-primary); padding-top: 8px; }
.price-amount { font-variant-numeric: tabular-nums; }
.price-divider { border-top: 1px dashed var(--border-color); margin: 6px 0; }
.installment-row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.installment-chip {
  font-size: 12px; padding: 3px 10px; border-radius: 12px;
  background: var(--el-color-primary-light-9); color: var(--el-color-primary);
  font-weight: 500;
}

/* R58-6: 成功弹窗画师 QQ 区 */
.success-qq {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  margin-bottom: 16px;
}
.success-qq-label { font-size: 13px; color: var(--text-secondary); }
.success-qq-no {
  font-size: 18px; font-weight: 700; color: var(--text-primary);
  background: var(--bg-inset); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 6px 16px;
  font-variant-numeric: tabular-nums;
}
.success-qq-actions { display: flex; gap: 8px; }
</style>
