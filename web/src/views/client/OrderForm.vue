<template>
  <div class="order-form-page">
    <ClientFloatingActions />
    <div class="form-container" v-loading="loading">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('orderForm.backHome')" :content="$t('orderForm.title')">
        <!-- 打磨批 E：title 文本 aria-hidden——EP page-header icon 自带 aria-label=title，叠加读两遍；视觉不变 -->
        <template #title><span aria-hidden="true">{{ $t('orderForm.backHome') }}</span></template>
      </el-page-header>

      <template v-if="artist">
        <!-- R58-2: 步骤指示器（v0.32: 动态步骤——旧模型3步 / 单画风3步 / 多画风4步） -->
        <div class="step-indicator">
          <template v-for="(sd, idx) in stepDefs" :key="sd.key">
            <div class="step-item">
              <span class="step-dot" :class="{ 'step-dot--active': step === idx + 1, 'step-dot--done': step > idx + 1 }">{{ step > idx + 1 ? '✓' : idx + 1 }}</span>
              <span class="step-label" :class="{ 'step-label--on': step === idx + 1 }">{{ sd.label }}</span>
            </div>
            <span v-if="idx < stepDefs.length - 1" class="step-connector" :class="{ 'step-connector--done': step > idx + 1 }"></span>
          </template>
        </div>

        <!-- v0.35 F4: 入口 A 预选摘要横幅——展示柜带选择进来时明确显示已预选内容，可回上一步修改 -->
        <div v-if="preselectBannerText" class="preselect-banner">
          <span class="preselect-banner-text">{{ preselectBannerText }}</span>
          <!-- 多画风回选画风步；单画风回选尺寸步（改选后价格自动重算，横幅随之消失） -->
          <button
            type="button"
            class="preselect-banner-btn"
            @click="step = isMultiStyle ? 1 : sizeStep"
          >
            {{ $t('orderForm.preselectChange') }}
          </button>
        </div>

        <div class="step-layout">
          <el-card class="step-main">
            <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
              <!-- ── 步骤一：选档位（旧模型，无画风数据时） ── -->
              <div v-if="!isStyleMode" v-show="step === 1">
                <h3 class="step-title">{{ $t('orderForm.step1Title') }}</h3>
                <div class="tier-pick-grid">
                  <div
                    v-for="tier in tiers" :key="tier.id"
                    class="tier-pick" :class="{ 'tier-pick--on': form.tierId === tier.id }"
                    @click="selectTier(tier.id)"
                  >
                    <span v-if="form.tierId === tier.id" class="tier-pick-stamp">✓</span>
                    <div class="tier-pick-name">{{ tier.name }}</div>
                    <div class="tier-pick-price">¥{{ tier.price }}</div>
                    <div v-if="tier.work_days" class="tier-pick-days">{{ $t('tiers.daysUnit', { n: tier.work_days }) }}</div>
                  </div>
                </div>

                <!-- R14: 紧凑计价摘要 + 渐进展开 -->
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

                <!-- 增项选择（R14: 展开后才显示；旧模型增项已随 addons 冻结清理，仅剩倍率） -->
                <Transition name="pricing-expand">
                  <div v-if="pricingExpanded && form.tierId">
                    <!-- 倍率选择 -->
                    <el-form-item v-if="usageMultipliers.length > 0 || rushMultipliers.length > 0" :label="$t('orderForm.multiplierLabel')">
                      <div class="multiplier-section">
                        <div v-if="usageMultipliers.length > 0" class="multiplier-row">
                          <span class="multiplier-label">{{ $t('orderForm.usageLabel') }}</span>
                          <el-radio-group v-model="form.usageMultiplierId" size="small">
                            <el-radio-button :value="null">{{ $t('orderForm.personal') }}</el-radio-button>
                            <el-radio-button v-for="m in usageMultipliers" :key="m.id" :value="m.id">
                              {{ m.name }} ×{{ m.multiplier }}
                            </el-radio-button>
                          </el-radio-group>
                        </div>
                        <div v-if="rushMultipliers.length > 0" class="multiplier-row">
                          <span class="multiplier-label">{{ $t('orderForm.rushLabel') }}</span>
                          <el-radio-group v-model="form.rushMultiplierId" size="small">
                            <el-radio-button :value="null">{{ $t('orderForm.noRush') }}</el-radio-button>
                            <el-radio-button v-for="m in rushMultipliers" :key="m.id" :value="m.id">
                              {{ m.name }} ×{{ m.multiplier }}
                            </el-radio-button>
                          </el-radio-group>
                        </div>
                      </div>
                    </el-form-item>

                    <!-- 实时价格预览（R14: 展开后才显示） -->
                    <div v-if="form.tierId && pricePreview" class="price-preview">
                      <div class="price-line" v-for="item in (pricePreview.breakdown || [])" :key="item.name">
                        <span>{{ item.name }}</span>
                        <span class="price-amount">¥{{ (item.amount ?? 0).toFixed(2) }}</span>
                      </div>
                      <div class="price-divider"></div>
                      <!-- v0.31 F3: 折扣码输入行（总价行上方，画师开启折扣功能时才显示） -->
                      <div v-if="discountEnabled" class="discount-row">
                        <span class="discount-label">{{ $t('orderForm.discountLabel') }}</span>
                        <el-input
                          v-model="form.discountCode"
                          :placeholder="$t('orderForm.discountPlaceholder')"
                          size="small" class="discount-input"
                          @keyup.enter="validateDiscountCode"
                        />
                        <el-button
                          size="small" type="primary" plain
                          :loading="discountValidating"
                          :disabled="!form.discountCode.trim()"
                          @click="validateDiscountCode"
                        >
                          {{ $t('orderForm.discountValidate') }}
                        </el-button>
                        <!-- 验证通过后显示折扣信息（如 -10% 或 -¥20） -->
                        <span v-if="discountResult" class="discount-ok">
                          ✓ {{ discountResult.discountType === 'percent' ? `-${discountResult.discountValue}%` : `-¥${discountResult.discountValue}` }}
                        </span>
                      </div>
                      <!-- 验证失败提示（错误码已由 axios 拦截器 i18n 翻译） -->
                      <p v-if="discountError" class="discount-error">✕ {{ discountError }}</p>
                      <div class="price-line total">
                        <span>{{ $t('orderForm.receiptTotal') }}</span>
                        <span class="price-amount">¥{{ (pricePreview.totalPrice ?? 0).toFixed(2) }}</span>
                      </div>
                      <!-- v0.31 F3: 折扣行（红色负数，总价行下方；先倍率后折扣，前端仅估算） -->
                      <div v-if="discountResult && discountPreviewYuan > 0" class="price-line discount">
                        <span>{{ $t('orderForm.discountEstimate') }}</span>
                        <span class="price-amount discount-amount">-¥{{ discountPreviewYuan.toFixed(2) }}</span>
                      </div>
                      <!-- v0.31 F3: 预估总价（折扣后） -->
                      <div v-if="discountResult && discountPreviewYuan > 0" class="price-line discounted-total">
                        <span>{{ $t('orderForm.discountedTotal') }}</span>
                        <span class="price-amount">¥{{ discountedTotalYuan.toFixed(2) }}</span>
                      </div>
                      <div v-if="pricePreview?.installments?.length > 1" class="installment-row">
                        <span v-for="inst in pricePreview.installments" :key="inst.label" class="installment-chip">
                          {{ inst.label }} ¥{{ (inst.amount ?? 0).toFixed(2) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </Transition>

                <div class="step-nav step-nav--end">
                  <el-button type="primary" :disabled="!form.tierId" @click="step = 2">{{ $t('orderForm.nextStep') }}</el-button>
                </div>
              </div>

              <!-- ── v0.32: 选画风（多画风步骤 1，单画风跳过） ── -->
              <div v-if="isStyleMode && isMultiStyle" v-show="step === 1">
                <h3 class="step-title">{{ $t('orderForm.styleStepTitle') }}</h3>
                <div class="style-pick-grid">
                  <div
                    v-for="s in styles" :key="s.id"
                    class="style-pick" :class="{ 'style-pick--on': selectedStyleId === s.id }"
                    @click="selectStyle(s.id)"
                  >
                    <span v-if="selectedStyleId === s.id" class="style-pick-stamp">✓</span>
                    <div v-if="s.cover_image" class="style-pick-img-wrap">
                      <el-image :src="`/uploads/${s.cover_image}`" fit="cover" class="style-pick-img" :alt="s.name" />
                    </div>
                    <div v-else class="style-pick-img-empty">{{ s.name?.charAt(0) }}</div>
                    <div class="style-pick-name">{{ s.name }}</div>
                    <div v-if="s.description" class="style-pick-desc">{{ s.description }}</div>
                  </div>
                </div>
                <div class="step-nav step-nav--end">
                  <el-button type="primary" :disabled="!selectedStyleId" @click="step = 2">{{ $t('orderForm.nextStep') }}</el-button>
                </div>
              </div>

              <!-- ── v0.32: 选尺寸（画风模式步骤 2 / 单画风步骤 1） ── -->
              <div v-if="isStyleMode" v-show="step === sizeStep">
                <h3 class="step-title">{{ $t('orderForm.sizeStepTitle') }}</h3>
                <div class="size-pick-list">
                  <div
                    v-for="sz in (selectedStyle?.sizes || [])" :key="sz.id"
                    class="size-pick" :class="{ 'size-pick--on': selectedSizeId === sz.id }"
                    @click="selectSize(sz.id)"
                  >
                    <span class="size-pick-name">{{ sz.name }}</span>
                    <span class="size-pick-price">¥{{ sz.base_price }}</span>
                    <span v-if="selectedSizeId === sz.id" class="size-pick-check">✓</span>
                  </div>
                </div>
                <div class="step-nav" :class="{ 'step-nav--end': !isMultiStyle }">
                  <el-button v-if="isMultiStyle" @click="step = 1">{{ $t('orderForm.prevStep') }}</el-button>
                  <el-button type="primary" :disabled="!selectedSizeId" @click="step = addonStep">{{ $t('orderForm.nextStep') }}</el-button>
                </div>
              </div>

              <!-- ── v0.32: 勾增项 + 倍率 + 价格预览（画风模式步骤 3 / 单画风步骤 2） ── -->
              <div v-if="isStyleMode" v-show="step === addonStep">
                <h3 class="step-title">{{ $t('orderForm.addonStepTitle') }}</h3>

                <!-- 增项控件（switch / quantity / radio） -->
                <div v-if="availableStyleAddons.length" class="style-addon-list">
                  <div v-for="a in availableStyleAddons" :key="a.id" class="style-addon-item">
                    <div class="style-addon-info">
                      <span class="style-addon-name">{{ a.name }}</span>
                      <span class="style-addon-price">
                        {{ a.control_type === 'radio' ? $t('orderForm.addonOptionPrice') : `¥${a.price}${a.control_type === 'quantity' && a.unit_label ? '/' + a.unit_label : ''}` }}
                      </span>
                    </div>
                    <!-- switch → el-switch -->
                    <el-switch
                      v-if="a.control_type === 'switch'"
                      :model-value="styleAddonSelections[a.id]?.toggled || false"
                      size="small"
                      @change="(val) => { if (!styleAddonSelections[a.id]) styleAddonSelections[a.id] = { toggled: false, quantity: 0, optionLabel: null }; styleAddonSelections[a.id].toggled = val }"
                    />
                    <!-- quantity → el-input-number -->
                    <el-input-number
                      v-else-if="a.control_type === 'quantity'"
                      :model-value="styleAddonSelections[a.id]?.quantity || 0"
                      :min="0" :max="99" :step="1" size="small" style="width: 110px"
                      @change="(val) => { if (!styleAddonSelections[a.id]) styleAddonSelections[a.id] = { toggled: false, quantity: 0, optionLabel: null }; styleAddonSelections[a.id].quantity = val ?? 0 }"
                    />
                    <!-- radio → el-radio-group（选项从 options JSON 解析） -->
                    <el-radio-group
                      v-else-if="a.control_type === 'radio'"
                      :model-value="styleAddonSelections[a.id]?.optionLabel || null"
                      size="small"
                      @change="(val) => { if (!styleAddonSelections[a.id]) styleAddonSelections[a.id] = { toggled: false, quantity: 0, optionLabel: null }; styleAddonSelections[a.id].optionLabel = val }"
                    >
                      <el-radio-button v-for="opt in parseAddonOptions(a.options)" :key="opt.label" :value="opt.label">
                        {{ opt.label }} ¥{{ opt.price }}
                      </el-radio-button>
                    </el-radio-group>
                  </div>
                </div>
                <el-empty v-else :description="$t('orderForm.addonStepEmpty')" :image-size="40" />

                <!-- 倍率选择（复用现有逻辑） -->
                <el-form-item v-if="usageMultipliers.length > 0 || rushMultipliers.length > 0" :label="$t('orderForm.multiplierLabel')" style="margin-top: 16px">
                  <div class="multiplier-section">
                    <div v-if="usageMultipliers.length > 0" class="multiplier-row">
                      <span class="multiplier-label">{{ $t('orderForm.usageLabel') }}</span>
                      <el-radio-group v-model="form.usageMultiplierId" size="small">
                        <el-radio-button :value="null">{{ $t('orderForm.personal') }}</el-radio-button>
                        <el-radio-button v-for="m in usageMultipliers" :key="m.id" :value="m.id">
                          {{ m.name }} ×{{ m.multiplier }}
                        </el-radio-button>
                      </el-radio-group>
                    </div>
                    <div v-if="rushMultipliers.length > 0" class="multiplier-row">
                      <span class="multiplier-label">{{ $t('orderForm.rushLabel') }}</span>
                      <el-radio-group v-model="form.rushMultiplierId" size="small">
                        <el-radio-button :value="null">{{ $t('orderForm.noRush') }}</el-radio-button>
                        <el-radio-button v-for="m in rushMultipliers" :key="m.id" :value="m.id">
                          {{ m.name }} ×{{ m.multiplier }}
                        </el-radio-button>
                      </el-radio-group>
                    </div>
                  </div>
                </el-form-item>

                <!-- 画风价格预览（全走后端 calculate-style-price） -->
                <div v-if="stylePricePreview" class="price-preview">
                  <div class="price-line">
                    <span>{{ stylePricePreview.sizeName }}</span>
                    <span class="price-amount">¥{{ stylePricePreview.basePrice.toFixed(2) }}</span>
                  </div>
                  <div v-for="(item, idx) in stylePricePreview.addonItems" :key="idx" class="price-line">
                    <span>{{ item.name }}{{ item.quantity > 1 ? ` ×${item.quantity}` : '' }}</span>
                    <span class="price-amount">¥{{ item.amount.toFixed(2) }}</span>
                  </div>
                  <div v-if="stylePricePreview.usageMultiplier" class="price-line">
                    <span>{{ stylePricePreview.usageMultiplier.name }} ×{{ stylePricePreview.usageMultiplier.factor }}</span>
                    <span class="price-amount"></span>
                  </div>
                  <div v-if="stylePricePreview.rushMultiplier" class="price-line">
                    <span>{{ stylePricePreview.rushMultiplier.name }} ×{{ stylePricePreview.rushMultiplier.factor }}</span>
                    <span class="price-amount"></span>
                  </div>
                  <div class="price-divider"></div>
                  <!-- 折扣码输入行（复用 v0.31 逻辑） -->
                  <div v-if="discountEnabled" class="discount-row">
                    <span class="discount-label">{{ $t('orderForm.discountLabel') }}</span>
                    <el-input
                      v-model="form.discountCode"
                      :placeholder="$t('orderForm.discountPlaceholder')"
                      size="small" class="discount-input"
                      @keyup.enter="validateDiscountCode"
                    />
                    <el-button
                      size="small" type="primary" plain
                      :loading="discountValidating"
                      :disabled="!form.discountCode.trim()"
                      @click="validateDiscountCode"
                    >
                      {{ $t('orderForm.discountValidate') }}
                    </el-button>
                    <span v-if="discountResult" class="discount-ok">
                      ✓ {{ discountResult.discountType === 'percent' ? `-${discountResult.discountValue}%` : `-¥${discountResult.discountValue}` }}
                    </span>
                  </div>
                  <p v-if="discountError" class="discount-error">✕ {{ discountError }}</p>
                  <div class="price-line total">
                    <span>{{ $t('orderForm.receiptTotal') }}</span>
                    <span class="price-amount">¥{{ stylePricePreview.totalPrice.toFixed(2) }}</span>
                  </div>
                  <div v-if="stylePricePreview.discount" class="price-line discount">
                    <span>{{ $t('orderForm.discountEstimate') }}（{{ stylePricePreview.discount.code }}）</span>
                    <span class="price-amount discount-amount">-¥{{ stylePricePreview.discount.amount.toFixed(2) }}</span>
                  </div>
                </div>

                <div class="step-nav">
                  <el-button @click="step = sizeStep">{{ $t('orderForm.prevStep') }}</el-button>
                  <el-button type="primary" @click="step = detailStep">{{ $t('orderForm.nextStep') }}</el-button>
                </div>
              </div>

              <!-- ── 步骤二：写需求 + 上传（v0.32: 动态步骤号） ── -->
              <div v-show="step === detailStep">
                <h3 class="step-title">{{ $t('orderForm.step2Title') }}</h3>

                <!-- R58-4: 灵感标签快捷注入（R58-8: 改为画师自定义标签，未设置时不显示） -->
                <div v-if="inspireTags.length" class="inspire-block">
                  <span class="inspire-hint">{{ $t('orderForm.inspireHint') }}</span>
                  <div class="inspire-tags">
                    <button v-for="tag in inspireTags" :key="tag" type="button" class="inspire-tag" @click="appendTag(tag)">{{ tag }}</button>
                  </div>
                </div>

                <!-- 需求描述 -->
                <el-form-item :label="$t('orderForm.descLabel')" prop="description">
                  <el-input
                    v-model="form.description" type="textarea" :rows="5"
                    :placeholder="$t('orderForm.descPlaceholder')" maxlength="2000" show-word-limit
                  />
                </el-form-item>

                <!-- 参考图上传（P1-4: tooltip 显示详细说明） -->
                <el-form-item>
                  <template #label>
                    <span>{{ $t('orderForm.refLabel') }}</span>
                    <el-tooltip :content="$t('orderForm.refTip')" placement="top">
                      <el-icon class="ref-tip-icon"><InfoFilled /></el-icon>
                    </el-tooltip>
                  </template>
                  <el-upload
                    :auto-upload="true" :http-request="handleRefUpload"
                    accept="image/*" list-type="picture-card" :limit="5"
                    :file-list="refFileList" :on-exceed="() => ElMessage.warning($t('orderForm.refExceed'))"
                    :on-remove="handleRefRemove"
                    @dragenter.capture="guardDragEnter"
                    @dragover.capture="guardDragOver"
                    @drop.capture="guardDrop"
                  >
                    <el-icon aria-label="上传参考图"><Plus /></el-icon>
                  </el-upload>
                  <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
                </el-form-item>

                <!-- 流程与收款预览（R1: 保持原位，增加修改说明告示） -->
                <el-form-item v-if="workflowStages.length || artist?.revisionNote" :label="$t('orderForm.workflowLabel')">
                  <WorkflowOverviewStrip v-if="workflowStages.length" :stages="workflowStages" />
                  <div v-if="artist?.revisionNote" class="tpl-revision-note">
                    <span>
                      <strong class="tpl-revision-note-label">{{ $t('artistHome.revisionNote') }}</strong>
                      {{ artist.revisionNote }}
                    </span>
                  </div>
                </el-form-item>

                <div class="step-nav">
                  <el-button @click="step = isStyleMode ? addonStep : 1">{{ $t('orderForm.prevStep') }}</el-button>
                  <el-button type="primary" @click="goNextFromDetail">{{ $t('orderForm.nextStep') }}</el-button>
                </div>
              </div>

              <!-- ── 步骤三：联系方式（v0.32: 动态步骤号） ── -->
              <div v-show="step === contactStep">
                <h3 class="step-title">{{ $t('orderForm.step3Title') }}</h3>

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

                <div class="step-nav">
                  <el-button @click="step = detailStep">{{ $t('orderForm.prevStep') }}</el-button>
                  <el-button type="primary" @click="openReceipt">
                    {{ $t('orderForm.submit') }}
                    <template v-if="isStyleMode && stylePricePreview"> — ¥{{ stylePricePreview.totalPrice.toFixed(2) }}</template>
                    <template v-else-if="pricePreview"> — ¥{{ (pricePreview.totalPrice ?? 0).toFixed(2) }}</template>
                  </el-button>
                </div>
              </div>
            </el-form>
          </el-card>

          <!-- R58-2: 粘性摘要卡（宽屏右侧 / 移动端底部） -->
          <aside class="summary-card">
            <div class="summary-title">{{ $t('orderForm.summaryTitle') }}</div>
            <!-- REQ-022 F3: 客户信息回显（双模式公共，空值隐藏；描述 3 行截断） -->
            <div v-if="form.clientName.trim() || form.description.trim()" class="summary-client">
              <div v-if="form.clientName.trim()" class="summary-line">
                <span>{{ $t('orderForm.summaryNickname') }}</span>
                <span class="summary-client-value">{{ form.clientName }}</span>
              </div>
              <div v-if="form.description.trim()" class="summary-desc">
                <div class="summary-line">{{ $t('orderForm.summaryDescription') }}</div>
                <div class="summary-desc-text">{{ form.description }}</div>
              </div>
              <div class="summary-divider"></div>
            </div>
            <!-- v0.32: 画风模式摘要 -->
            <template v-if="isStyleMode">
              <div class="summary-tier">{{ selectedStyle?.name }}</div>
              <div v-if="selectedSize" class="summary-lines">
                <div class="summary-line">
                  <span>{{ selectedSize.name }}</span>
                  <span class="summary-amt">¥{{ selectedSize.base_price.toFixed(2) }}</span>
                </div>
                <template v-if="stylePricePreview">
                  <div v-for="(item, idx) in stylePricePreview.addonItems" :key="idx" class="summary-line">
                    <span>{{ item.name }}{{ item.quantity > 1 ? ` ×${item.quantity}` : '' }}</span>
                    <span class="summary-amt">¥{{ item.amount.toFixed(2) }}</span>
                  </div>
                </template>
                <div class="summary-divider"></div>
              </div>
              <div v-if="selectedSize" class="summary-total">
                <span>{{ $t('orderForm.receiptTotal') }}</span>
                <span class="summary-total-amt">¥{{ displayPrice.toFixed(2) }}</span>
              </div>
              <div v-else class="summary-empty">{{ $t('orderForm.summaryNoSize') }}</div>
            </template>
            <!-- 旧模型摘要 -->
            <template v-else-if="selectedTier">
              <div class="summary-tier">{{ selectedTier.name }}</div>
              <div v-if="pricePreview" class="summary-lines">
                <div v-for="item in (pricePreview.breakdown || [])" :key="item.name" class="summary-line">
                  <span>{{ item.name }}</span>
                  <span class="summary-amt">¥{{ (item.amount ?? 0).toFixed(2) }}</span>
                </div>
                <div class="summary-divider"></div>
              </div>
              <div class="summary-total">
                <span>{{ $t('orderForm.receiptTotal') }}</span>
                <span class="summary-total-amt">¥{{ displayPrice.toFixed(2) }}</span>
              </div>
              <div v-if="pricePreview?.installments?.length > 1" class="summary-installments">
                <span v-for="inst in pricePreview.installments" :key="inst.label" class="summary-inst">
                  {{ inst.label }} ¥{{ (inst.amount ?? 0).toFixed(2) }}
                </span>
              </div>
            </template>
            <div v-else class="summary-empty">{{ $t('orderForm.summaryNoTier') }}</div>
          </aside>
        </div>
      </template>
    </div>

    <!-- R58-3: 小票风格二次确认弹窗（锯齿边 CSS，样式在 templates.css 全局定义） -->
    <el-dialog
      v-model="receiptVisible" width="340px"
      :show-close="false" :close-on-click-modal="false"
      class="receipt-dialog" align-center
    >
      <div class="receipt">
        <div class="receipt-head">{{ artist?.name }}</div>
        <div class="receipt-sub">{{ $t('orderForm.receiptSub') }}</div>
        <div class="receipt-dashed"></div>
        <!-- v0.32: 画风模式小票 -->
        <template v-if="isStyleMode">
          <div class="receipt-row">
            <span>{{ $t('orderForm.styleStep') }}</span>
            <span>{{ selectedStyle?.name }}</span>
          </div>
          <div class="receipt-row">
            <span>{{ $t('orderForm.sizeStep') }}</span>
            <span>{{ selectedSize?.name }}</span>
          </div>
          <template v-if="stylePricePreview">
            <div v-for="(item, idx) in stylePricePreview.addonItems" :key="idx" class="receipt-row">
              <span>{{ item.name }}{{ item.quantity > 1 ? ` ×${item.quantity}` : '' }}</span>
              <span>¥{{ item.amount.toFixed(2) }}</span>
            </div>
          </template>
        </template>
        <!-- 旧模型小票 -->
        <template v-else>
          <div class="receipt-row">
            <span>{{ $t('orderForm.tierLabel') }}</span>
            <span>{{ selectedTier?.name }}</span>
          </div>
          <template v-if="pricePreview">
            <div v-for="item in (pricePreview.breakdown || [])" :key="item.name" class="receipt-row">
              <span>{{ item.name }}</span>
              <span>¥{{ (item.amount ?? 0).toFixed(2) }}</span>
            </div>
          </template>
        </template>
        <div class="receipt-dashed"></div>
        <div class="receipt-total">
          <span>{{ $t('orderForm.receiptTotal') }}</span>
          <span>¥{{ displayPrice.toFixed(2) }}</span>
        </div>
        <div v-if="!isStyleMode && pricePreview?.installments?.length > 1" class="receipt-installments">
          <span v-for="inst in pricePreview.installments" :key="inst.label" class="receipt-inst">
            {{ inst.label }} ¥{{ (inst.amount ?? 0).toFixed(2) }}
          </span>
        </div>
        <div class="receipt-barcode" aria-hidden="true"></div>
        <div class="receipt-actions">
          <button type="button" class="receipt-btn" @click="receiptVisible = false">{{ $t('common.cancel') }}</button>
          <button type="button" class="receipt-btn receipt-btn--primary" :disabled="submitting" @click="confirmSubmit">
            {{ submitting ? $t('orderForm.submitting') : $t('orderForm.receiptConfirm') }}
          </button>
        </div>
      </div>
    </el-dialog>

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
          <div class="success-actions">
            <!-- R58-5: 复制约稿信息 -->
            <el-button @click="copyOrderSummary">{{ $t('orderForm.copySummary') }}</el-button>
            <el-button type="primary" @click="$router.push(`/artist/${subdomain}/track?no=${resultNo}`)">
              {{ $t('orderForm.viewProgress') }}
            </el-button>
          </div>
        </template>
      </el-result>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import Disclaimer from '../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../components/shared/WorkflowOverviewStrip.vue'
import ClientFloatingActions from '../../components/client/ClientFloatingActions.vue'
import { useOrderForm } from '../../composables/useOrderForm.js'
import { useDropGuard } from '../../composables/useDropGuard.js'
import { usePalette } from '../../composables/usePalette.js'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain
const formRef = ref(null)

// G1: 页内拖拽守卫（参考图上传区统一防御；捕获阶段挂在 el-upload 上）
const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()

// R58-1: 表单业务逻辑全部由共享 composable 提供，页面只保留布局与样式
const {
  artist, tiers, rulesContent, loading, workflowStages,
  form, rules,
  submitting, showSuccess, resultNo, submit,
  refFileList, handleRefUpload, handleRefRemove,
  pricePreview, pricingExpanded,
  selectedTier, hasPricingExtras,
  usageMultipliers, rushMultipliers, onTierChange,
  sanitizedRules,
  // v0.31 F3: 折扣码
  discountEnabled, discountResult, discountError, discountValidating,
  validateDiscountCode, discountPreviewYuan, discountedTotalYuan,
  // v0.32 REQ-023 Phase2: 多画风
  styles, isStyleMode, isMultiStyle,
  selectedStyleId, selectedStyle, selectedSizeId, selectedSize,
  availableStyleAddons, styleAddonSelections,
  selectStyle, selectSize, parseAddonOptions,
  stylePricePreview, styleDisplayPrice,
  // v0.34 任务B：URL query 预选命中记录
  queryPreselect,
  // v0.35 F4: 预选摘要横幅文案（入口 A 预选可见，可回上一步改）
  preselectBannerText
} = useOrderForm(subdomain, formRef, route.query)

// M2: 流程页跟随画师 palette 配色（画师数据加载后生效，卸载时自动清理）
const paletteId = computed(() => artist.value?.paletteId || 'paper')
usePalette(paletteId)

// ─── D 软提示（用户拍板：需求描述可空过，仅留空时弹一次确认，不拦截） ───
function goNextFromDetail() {
  if (!form.description.trim()) {
    ElMessageBox.confirm(
      t('orderForm.descSoftMsg'),
      t('orderForm.descSoftTitle'),
      {
        confirmButtonText: t('orderForm.descSoftContinue'),
        cancelButtonText: t('common.cancel'),
        type: 'info'
      }
    )
      .then(() => { step.value = contactStep.value })
      .catch(() => { /* 用户取消：留在本步 */ })
    return
  }
  step.value = contactStep.value
}

// ─── R58-2: 分步引导（v0.32: 动态步骤号） ───
const step = ref(1)
const receiptVisible = ref(false)

/**
 * 动态步骤定义：
 * 旧模型（无画风）：选档位(1) → 写需求(2) → 联系方式(3)
 * 单画风：选尺寸(1) → 增项+倍率(2) → 写需求(3) → 联系方式(4)
 * 多画风：选画风(1) → 选尺寸(2) → 增项+倍率(3) → 写需求(4) → 联系方式(5)
 */
const stepDefs = computed(() => {
  if (!isStyleMode.value) {
    return [
      { key: 'tier', label: t('orderForm.step1') },
      { key: 'detail', label: t('orderForm.step2') },
      { key: 'contact', label: t('orderForm.step3') }
    ]
  }
  const defs = []
  if (isMultiStyle.value) defs.push({ key: 'style', label: t('orderForm.styleStep') })
  defs.push({ key: 'size', label: t('orderForm.sizeStep') })
  defs.push({ key: 'addon', label: t('orderForm.addonStep') })
  defs.push({ key: 'detail', label: t('orderForm.step2') })
  defs.push({ key: 'contact', label: t('orderForm.step3') })
  return defs
})

/** 各步骤的动态编号 */
const sizeStep = computed(() => stepDefs.value.findIndex(s => s.key === 'size') + 1)
const addonStep = computed(() => stepDefs.value.findIndex(s => s.key === 'addon') + 1)
const detailStep = computed(() => stepDefs.value.findIndex(s => s.key === 'detail') + 1)
const contactStep = computed(() => stepDefs.value.findIndex(s => s.key === 'contact') + 1)

// v0.34 任务B：主页带 query 预选进来时，初始步骤跳过已预选部分
// （画风+尺寸都选中 → 直接进增项步骤；仅画风选中 → 进选尺寸步骤）
watch(loading, (v) => {
  if (v) return
  if (!isStyleMode.value) return
  if (queryPreselect.sizeId) {
    step.value = addonStep.value
  } else if (queryPreselect.styleId && isMultiStyle.value) {
    step.value = sizeStep.value
  }
}, { once: true })

/** 档位卡片点选（与原 el-select @change 行为一致：切换时清空增项/倍率） */
function selectTier(id) {
  if (form.tierId === id) return
  form.tierId = id
  onTierChange()
}

/** 摘要卡/小票展示价：画风模式用 styleDisplayPrice，旧模型用 pricePreview/档位基础价 */
const displayPrice = computed(() =>
  isStyleMode.value
    ? styleDisplayPrice.value
    : (pricePreview.value?.totalPrice ?? selectedTier.value?.price ?? 0)
)

// ─── R58-4: 灵感标签快捷注入（R58-8: 从 API 读取画师自定义标签，未设置时不显示，不 fallback 硬编码） ───
const inspireTags = computed(() => artist.value?.inspirationTags || [])
function appendTag(tag) {
  const sep = form.description && !/[，。、\s]$/.test(form.description) ? '，' : ''
  form.description = `${form.description}${sep}${tag}`.slice(0, 2000)
}

// ─── R58-3: 小票二次确认（校验通过才弹小票，确认后走 composable 提交流程） ───
// R24: 校验失败时弹窗列出所有未通过项，关闭后滚动到第一个未通过字段
async function openReceipt() {
  try {
    await formRef.value.validate()
  } catch (invalidFields) {
    if (invalidFields && typeof invalidFields === 'object') {
      const items = Object.values(invalidFields)
        .flat()
        .map(err => err.message)
        .filter(Boolean)
      if (items.length) {
        // 内容全部来自 i18n 翻译文案，无用户输入，无 XSS 风险
        const html = items.map(msg => `<p style="margin:4px 0">• ${msg}</p>`).join('')
        await ElMessageBox.alert(html, t('order.validation.title'), {
          confirmButtonText: t('order.validation.confirm'),
          dangerouslyUseHTMLString: true
        }).catch(() => {})
      }
      // 弹窗关闭后滚动到第一个未通过字段
      const firstField = Object.keys(invalidFields)[0]
      if (firstField) formRef.value.scrollToField(firstField)
    }
    return
  }
  receiptVisible.value = true
}
async function confirmSubmit() {
  await submit()
  if (showSuccess.value) receiptVisible.value = false
}

// ─── R58-5: 复制约稿信息（订单号 + 档位 + 明细 + 总价） ───
async function copyOrderSummary() {
  const lines = [
    `${t('orderForm.summaryOrderNo')}${resultNo.value}`,
    `${t('orderForm.tierLabel')}: ${selectedTier.value?.name || ''}`,
    ...(pricePreview.value?.breakdown || []).map(i => `${i.name}: ¥${(i.amount ?? 0).toFixed(2)}`),
    `${t('orderForm.receiptTotal')}: ¥${displayPrice.value.toFixed(2)}`
  ]
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('orderForm.summaryCopied'))
  } catch {
    ElMessage.warning(text) // 剪贴板不可用时直接展示摘要供手动复制
  }
}

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
  background: var(--pal-bg, var(--bg-page));
  padding: 16px;
  transition: background 0.3s;
  position: relative;
}
/* R58-2: 加宽容器容纳 主区 + 摘要卡 双栏 */
.form-container { max-width: 920px; margin: 0 auto; }
.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
/* P1-4: 参考图说明 tooltip 图标 */
.ref-tip-icon {
  margin-left: 4px;
  color: var(--text-secondary);
  cursor: help;
  vertical-align: middle;
  transition: color 0.2s;
}
.ref-tip-icon:hover { color: var(--color-primary); }

/* ─── R58-2: 步骤指示器 ─── */
.step-indicator {
  display: flex; align-items: center; justify-content: center;
  margin: 24px 0 20px;
}
/* ─── v0.35 F4: 入口 A 预选摘要横幅（可见可改） ─── */
.preselect-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 18px;
  padding: 10px 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, var(--border-color, #dcdfe6));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 7%, var(--bg-page, #fff));
}
.preselect-banner-text {
  font-size: 13px;
  color: var(--text-primary, var(--el-text-color-primary));
}
.preselect-banner-btn {
  padding: 3px 12px;
  border: 1px solid var(--border-color-strong, #c0c4cc);
  border-radius: 999px;
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}
.preselect-banner-btn:hover {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}
.step-item { display: flex; align-items: center; gap: 8px; }
.step-dot {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
  border: 2px solid var(--border-color-strong);
  color: var(--text-muted); background: var(--bg-card);
  transition: transform 0.15s ease, background 0.2s, border-color 0.2s, color 0.2s;
}
.step-dot--active {
  border-color: var(--color-primary); color: var(--color-primary);
  transform: scale(1.15);
}
.step-dot--done {
  background: var(--color-primary); border-color: var(--color-primary); color: #fff;
}
.step-label { font-size: 13px; color: var(--text-muted); transition: color 0.2s; }
.step-label--on { color: var(--text-primary); font-weight: 600; }
.step-connector {
  width: 48px; height: 2px; margin: 0 10px;
  background: var(--border-color-strong);
  transition: background 0.3s;
}
.step-connector--done { background: var(--color-primary); }

/* ─── R58-2: 双栏布局（主区 + 粘性摘要卡） ─── */
.step-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  align-items: start;
}
.step-title {
  font-family: var(--font-display);
  font-size: clamp(18px, 3vw, 22px);
  color: var(--text-primary);
  margin: 0 0 16px;
}
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; }
.step-nav--end { justify-content: flex-end; }

/* ─── R58-2: 档位卡片选择（选中态弹性动画） ─── */
.tier-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.tier-pick {
  position: relative;
  padding: 18px 14px; text-align: center; cursor: pointer;
  background: var(--bg-card);
  border: 2px solid var(--border-color); border-radius: 12px;
  transition: transform 0.15s ease, border-color 0.2s, box-shadow 0.15s ease, background 0.2s;
}
.tier-pick:hover { transform: translateY(-2px); box-shadow: var(--shadow-card-hover); }
.tier-pick--on { border-color: var(--color-primary); background: var(--color-primary-soft); }
.tier-pick-stamp {
  position: absolute; top: -9px; right: -9px;
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--color-primary); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700;
  animation: tier-stamp-in 0.35s var(--ease-bounce);
}
@keyframes tier-stamp-in {
  from { transform: scale(0) rotate(-30deg); }
  to { transform: scale(1) rotate(0deg); }
}
.tier-pick-name {
  font-family: var(--font-display);
  font-size: 15px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 6px;
}
.tier-pick-price {
  font-size: 20px; font-weight: 700; color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.tier-pick-days { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* ─── R58-4: 灵感标签 ─── */
.inspire-block { margin-bottom: 16px; }
.inspire-hint { font-size: 12px; color: var(--text-secondary); }
.inspire-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.inspire-tag {
  padding: 5px 14px; font-size: 13px; cursor: pointer;
  background: var(--bg-card); color: var(--text-secondary);
  border: 1px dashed var(--border-color-strong); border-radius: 999px;
  transition: transform 0.15s ease, color 0.2s, border-color 0.2s, background 0.2s;
}
.inspire-tag:hover {
  color: var(--color-primary); border-color: var(--color-primary);
  background: var(--color-primary-soft);
  transform: translateY(-2px);
}
.inspire-tag:active { transform: translateY(0) scale(0.96); }

/* ─── R58-2: 粘性摘要卡 ─── */
.summary-card {
  position: sticky; top: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color); border-radius: 12px;
  padding: 18px;
}
.summary-title {
  font-size: 13px; font-weight: 600; letter-spacing: 2px;
  color: var(--text-secondary); margin-bottom: 12px;
}
.summary-tier {
  font-family: var(--font-display);
  font-size: 16px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 8px;
}
.summary-lines { margin-bottom: 4px; }
.summary-line {
  display: flex; justify-content: space-between;
  font-size: 13px; color: var(--text-secondary); padding: 3px 0;
}
.summary-amt { font-variant-numeric: tabular-nums; }
.summary-divider { border-top: 1px dashed var(--border-color); margin: 6px 0; }
.summary-total {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 14px; font-weight: 600; color: var(--text-primary);
}
.summary-total-amt {
  font-size: 22px; font-weight: 700; color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.summary-installments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.summary-inst {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: var(--el-color-primary-light-9); color: var(--el-color-primary);
}
.summary-empty { font-size: 13px; color: var(--text-muted); }
/* ─── REQ-022 F3: 客户信息回显（昵称 + 需求描述） ─── */
.summary-client { margin-bottom: 4px; }
.summary-client-value { font-weight: 600; color: var(--text-primary); }
.summary-desc { margin-top: 2px; }
.summary-desc-text {
  font-size: 12px; color: var(--text-secondary); line-height: 1.6;
  word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

/* ─── R58-2: 移动端——单栏，摘要卡移到底部 ─── */
@media (max-width: 860px) {
  .step-layout { grid-template-columns: 1fr; }
  .summary-card { position: static; }
  .step-label { display: none; }
  .step-connector { width: 32px; }
}

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
/* v0.31 F3: 折扣码输入行 + 折扣行 */
.discount-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; flex-wrap: wrap; }
.discount-label { font-size: 13px; color: var(--text-secondary); flex-shrink: 0; }
.discount-input { width: 140px; }
.discount-ok { font-size: 13px; font-weight: 600; color: var(--el-color-success); }
.discount-error { font-size: 12px; color: var(--el-color-danger); margin: 2px 0 0; }
.price-line.discount .discount-amount { color: var(--el-color-danger); font-weight: 600; }
.price-line.discounted-total { font-size: 15px; font-weight: 700; color: var(--el-color-danger); }
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
/* R58-5: 成功弹窗按钮行 */
.success-actions { display: flex; gap: 8px; justify-content: center; }

/* ─── v0.32: 画风卡片选择 ─── */
.style-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.style-pick {
  position: relative;
  padding: 0 0 14px; text-align: center; cursor: pointer;
  background: var(--bg-card);
  border: 2px solid var(--border-color); border-radius: 12px;
  overflow: hidden;
  transition: transform 0.15s ease, border-color 0.2s, box-shadow 0.15s ease;
}
.style-pick:hover { transform: translateY(-2px); box-shadow: var(--shadow-card-hover); }
.style-pick--on { border-color: var(--color-primary); }
.style-pick-stamp {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--color-primary); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  animation: tier-stamp-in 0.35s var(--ease-bounce);
}
.style-pick-img-wrap { height: 130px; overflow: hidden; }
.style-pick-img { width: 100%; height: 130px; display: block; }
.style-pick-img-empty {
  height: 130px; display: flex; align-items: center; justify-content: center;
  font-size: 40px; background: var(--bg-inset);
}
.style-pick-name {
  font-family: var(--font-display);
  font-size: 15px; font-weight: 600; color: var(--text-primary);
  margin: 10px 12px 4px;
}
.style-pick-desc {
  font-size: 12px; color: var(--text-secondary); line-height: 1.5;
  margin: 0 12px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* ─── v0.32: 尺寸选择列表 ─── */
.size-pick-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.size-pick {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; cursor: pointer;
  background: var(--bg-card);
  border: 2px solid var(--border-color); border-radius: 10px;
  transition: border-color 0.2s, box-shadow 0.15s ease, transform 0.15s ease;
}
.size-pick:hover { border-color: var(--color-primary-light-5); transform: translateX(4px); }
.size-pick--on { border-color: var(--color-primary); background: var(--color-primary-soft); }
.size-pick-name { flex: 1; font-size: 15px; font-weight: 600; color: var(--text-primary); }
.size-pick-price { font-size: 18px; font-weight: 700; color: var(--color-primary); font-variant-numeric: tabular-nums; }
.size-pick-check { font-size: 16px; color: var(--color-primary); font-weight: 700; }

/* ─── v0.32: 增项控件列表 ─── */
.style-addon-list { display: flex; flex-direction: column; gap: 4px; }
.style-addon-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; border-radius: 8px;
  background: var(--bg-card); border: 1px solid var(--border-color);
}
.style-addon-info { display: flex; flex-direction: column; gap: 2px; }
.style-addon-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.style-addon-price { font-size: 12px; color: var(--el-color-primary); font-weight: 600; }
</style>
