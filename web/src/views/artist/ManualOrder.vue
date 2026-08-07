<template>
  <!-- REQ-015: 手动录单全屏双栏独立页面（原 560px 抽屉 → 独立路由 /orders/new） -->
  <ArtistLayout>
    <div class="manual-order-page">
      <h2>{{ $t('manualOrder.title') }}</h2>
      <p class="hint">{{ $t('manualOrder.hint') }}</p>

      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
        <div class="mo-grid">
          <!-- ═══ 左栏：客户说了什么 ═══ -->
          <section class="mo-col">
            <h3 class="mo-section">{{ $t('manualOrder.leftTitle') }}</h3>

            <!-- 客户QQ -->
            <el-form-item :label="$t('manualOrder.clientQq')" prop="clientQq">
              <el-input v-model="form.clientQq" :placeholder="$t('manualOrder.clientQqPlaceholder')" />
            </el-form-item>

            <!-- 参考图上传（大块粘贴区，左栏最显眼位置——画师流程：QQ收图→粘贴→再填其他） -->
            <div class="mo-ref-section">
              <div class="mo-ref-label">
                <span>{{ $t('manualOrder.references') }}</span>
                <el-tooltip :content="$t('manualOrder.refTip')" placement="top">
                  <el-icon class="ref-tip-icon"><InfoFilled /></el-icon>
                </el-tooltip>
              </div>
              <!-- F2: 拖拽上传（drag + multiple），保留点击上传；G1: 页内图拖入拦截 -->
              <el-upload
                drag multiple
                :auto-upload="true" :http-request="handleRefUpload"
                accept="image/*" list-type="picture-card" :limit="5"
                :file-list="refFileList" :on-exceed="() => ElMessage.warning($t('manualOrder.refExceed'))"
                :on-remove="handleRefRemove" class="mo-ref-upload"
                @dragenter.capture="guardDragEnter"
                @dragover.capture="guardDragOver"
                @drop.capture="guardDrop"
              >
                <el-icon :size="24" :aria-label="$t('manualOrder.uploadRefLabel')"><Plus /></el-icon>
                <template #tip>
                  <span class="drag-hint">{{ $t('manualOrder.dragHint') }}</span>
                </template>
              </el-upload>
              <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
            </div>

            <!-- 客户昵称 -->
            <el-form-item :label="$t('manualOrder.clientName')">
              <el-input v-model="form.clientName" :placeholder="$t('manualOrder.clientNamePlaceholder')" />
            </el-form-item>

            <!-- 需求描述 -->
            <el-form-item :label="$t('manualOrder.desc')">
              <el-input
                v-model="form.description" type="textarea" :rows="4"
                :placeholder="$t('manualOrder.descPlaceholder')" maxlength="2000" show-word-limit
              />
            </el-form-item>

            <!-- 优先级 -->
            <el-form-item :label="$t('manualOrder.priority')">
              <el-radio-group v-model="form.priority">
                <el-radio-button value="high">{{ $t('manualOrder.priorityHigh') }}</el-radio-button>
                <el-radio-button value="medium">{{ $t('manualOrder.priorityMedium') }}</el-radio-button>
                <el-radio-button value="low">{{ $t('manualOrder.priorityLow') }}</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <!-- 截稿日 -->
            <el-form-item :label="$t('manualOrder.deadline')">
              <el-date-picker
                v-model="form.deadline" type="date" value-format="YYYY-MM-DD"
                :placeholder="$t('manualOrder.deadlinePlaceholder')"
                :disabled-date="disableDeadlineDate"
                clearable style="width: 200px"
              />
            </el-form-item>
            <!-- F3: 开稿日（可选，REQ-018 disabled-date 限今天之前不可选） -->
            <el-form-item :label="$t('manualOrder.startDate')">
              <el-date-picker
                v-model="form.startDate" type="date" value-format="YYYY-MM-DD"
                :placeholder="$t('manualOrder.startDatePlaceholder')"
                :disabled-date="disableStartDateDate"
                clearable style="width: 200px"
              />
            </el-form-item>

            <!-- QQ通知开关 -->
            <el-form-item>
              <el-checkbox v-model="form.clientNotify">{{ $t('manualOrder.clientNotify') }}</el-checkbox>
            </el-form-item>

            <!-- 该QQ历史订单面板（输入QQ后防抖500ms自动查询） -->
            <div v-if="qqValid" class="mo-history" v-loading="qqHistoryLoading" element-loading-background="transparent">
              <h4 class="mo-history-title">{{ $t('manualOrder.historyTitle') }}</h4>
              <div v-if="qqHistoryLoaded && qqHistory.length === 0" class="mo-history-empty">
                {{ $t('manualOrder.newClient') }}
              </div>
              <div v-else-if="qqHistory.length > 0" class="mo-history-list">
                <div v-for="o in qqHistory" :key="o.id" class="mo-history-item">
                  <span class="mo-history-no">{{ o.order_no }}</span>
                  <span class="mo-history-tier">{{ o.tier_name || $t('common.custom') }}</span>
                  <el-tag :type="statusType(o.status)" size="small">{{ $t(`common.orderStatus.${o.status}`) }}</el-tag>
                  <span class="mo-history-date">{{ formatDate(o.created_at) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- ═══ 右栏：怎么录 ═══ -->
          <section class="mo-col">
            <h3 class="mo-section">{{ $t('manualOrder.rightTitle') }}</h3>

            <!-- R6 (REQ-029): 图片显示开关——右栏所有卡片图片一起藏，localStorage 记忆 -->
            <div class="mo-show-images">
              <span>{{ $t('manualOrder.showImages') }}</span>
              <el-switch v-model="showImages" size="small" />
            </div>

            <!-- 档位选择（旧档位模式，卡片式） -->
            <div v-if="!isStyleMode" class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.tier') }}</div>
              <div v-if="tiers.length === 0" class="mo-empty-tiers">{{ $t('manualOrder.noTiers') }}</div>
              <div v-else class="tier-cards">
                <div
                  v-for="tier in tiers" :key="tier.id"
                  class="tier-card" :class="{ 'tier-card--active': form.tierId === tier.id }"
                  @click="selectTier(tier)"
                >
                  <span v-if="form.tierId === tier.id" class="tier-card-check">✓</span>
                  <img
                    v-if="showImages && tier.example_image"
                    :src="`/uploads/${tier.example_image}`"
                    class="tier-card-img" alt=""
                  />
                  <div class="tier-card-body">
                    <div class="tier-card-name">{{ tier.name }}</div>
                    <div class="tier-card-price">¥{{ tier.price }}</div>
                    <div v-if="tier.work_days" class="tier-card-days">{{ $t('manualOrder.tierDays', { n: tier.work_days }) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ─── v0.38 D路：画风模式（画风→尺寸→增项 三级选择，交互对齐 OrderForm） ─── -->
            <!-- 选画风（仅多画风；单画风自动选中，跳过此步） -->
            <div v-if="isStyleMode && isMultiStyle" class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.styleTitle') }}</div>
              <div class="tier-cards">
                <div
                  v-for="s in styles" :key="s.id"
                  class="tier-card" :class="{ 'tier-card--active': selectedStyleId === s.id }"
                  @click="selectStyle(s.id)"
                >
                  <span v-if="selectedStyleId === s.id" class="tier-card-check">✓</span>
                  <img v-if="showImages && s.cover_image" :src="`/uploads/${s.cover_image}`" class="tier-card-img" alt="" />
                  <div v-if="showImages && !s.cover_image" class="tier-card-img tier-card-img--empty">{{ s.name?.charAt(0) }}</div>
                  <div class="tier-card-body">
                    <div class="tier-card-name">{{ s.name }}</div>
                    <div v-if="s.description" class="tier-card-desc">{{ s.description }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- R2 (REQ-029): 自定义单提示——不选也能手输价录自定义单（画风模式通用，多/单画风都显示） -->
            <p v-if="isStyleMode" class="style-skip-hint">{{ $t('manualOrder.customHint') }}</p>

            <!-- 选尺寸（画风模式步骤 2；单画风即步骤 1） -->
            <div v-if="isStyleMode && selectedStyle" class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.sizeTitle') }}</div>
              <div v-if="selectedStyle.sizes.length === 0" class="mo-empty-tiers">{{ $t('manualOrder.noSizes') }}</div>
              <div v-else class="tier-cards">
                <div
                  v-for="sz in selectedStyle.sizes" :key="sz.id"
                  class="tier-card" :class="{ 'tier-card--active': selectedSizeId === sz.id }"
                  @click="selectSize(sz.id)"
                >
                  <span v-if="selectedSizeId === sz.id" class="tier-card-check">✓</span>
                  <img
                    v-if="showImages && sizeImage(sz)"
                    :src="`/uploads/${sizeImage(sz)}`"
                    class="tier-card-img" alt=""
                  />
                  <div class="tier-card-body">
                    <div class="tier-card-name">{{ sz.name }}</div>
                    <div class="tier-card-price">¥{{ sz.base_price }}</div>
                    <div v-if="sz.work_days" class="tier-card-days">{{ $t('manualOrder.sizeDays', { n: sz.work_days }) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 画风增项（选完尺寸后出现；select_mode 三种形态对齐 OrderForm） -->
            <div v-if="isStyleMode && selectedSizeId && availableStyleAddons.length > 0" class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.addons') }}</div>
              <div class="style-addon-list">
                <div v-for="a in availableStyleAddons" :key="a.id" class="style-addon-item">
                  <div class="addon-item-info">
                    <span class="addon-item-name">{{ a.name }}</span>
                    <span class="addon-item-price">{{ formatStyleAddonPrice(a) }}</span>
                  </div>
                  <!-- switch → el-switch -->
                  <el-switch
                    v-if="a.control_type === 'switch'"
                    :model-value="styleAddonSelections[a.id]?.toggled || false"
                    size="small"
                    @change="(val) => setStyleAddon(a.id, { toggled: !!val })"
                  />
                  <!-- quantity → el-input-number -->
                  <el-input-number
                    v-else-if="a.control_type === 'quantity'"
                    :model-value="styleAddonSelections[a.id]?.quantity || 0"
                    :min="0" :max="99" :step="1" size="small" style="width: 110px"
                    @change="(val) => setStyleAddon(a.id, { quantity: val ?? 0 })"
                  />
                  <!-- radio → el-radio-group（选项从 options JSON 解析） -->
                  <el-radio-group
                    v-else-if="a.control_type === 'radio'"
                    :model-value="styleAddonSelections[a.id]?.optionLabel || null"
                    size="small"
                    @change="(val) => setStyleAddon(a.id, { optionLabel: val })"
                  >
                    <el-radio-button v-for="opt in parseAddonOptions(a.options)" :key="opt.label" :value="opt.label">
                      {{ opt.label }} ¥{{ opt.price }}
                    </el-radio-button>
                  </el-radio-group>
                </div>
              </div>
            </div>

            <!-- 增项选择：旧档位模型增项已随 addons 冻结清理（前端停传，后端首批已恒空数组） -->
            <!-- 倍率选择（画风模式选完尺寸后 / 旧模式选完档位后出现） -->
            <div v-if="(form.tierId || (isStyleMode && selectedSizeId)) && (usageMultipliers.length > 0 || rushMultipliers.length > 0)" class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.multipliers') }}</div>
              <div class="multiplier-section">
                <div v-if="usageMultipliers.length > 0" class="multiplier-row">
                  <span class="multiplier-label">{{ $t('manualOrder.usage') }}：</span>
                  <el-radio-group v-model="form.usageMultiplierId" size="small">
                    <el-radio-button :value="null">{{ $t('manualOrder.personal') }}</el-radio-button>
                    <el-radio-button v-for="m in usageMultipliers" :key="m.id" :value="m.id">
                      {{ m.name }} ×{{ m.multiplier }}
                    </el-radio-button>
                  </el-radio-group>
                </div>
                <div v-if="rushMultipliers.length > 0" class="multiplier-row">
                  <span class="multiplier-label">{{ $t('manualOrder.rush') }}：</span>
                  <el-radio-group v-model="form.rushMultiplierId" size="small">
                    <el-radio-button :value="null">{{ $t('manualOrder.noRush') }}</el-radio-button>
                    <el-radio-button v-for="m in rushMultipliers" :key="m.id" :value="m.id">
                      {{ m.name }} ×{{ m.multiplier }}
                    </el-radio-button>
                  </el-radio-group>
                </div>
              </div>
            </div>

            <!-- F4: 初始节点状态（线下已谈好的单子可直接跳过确认） -->
            <div class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.initialStatus') }}</div>
              <el-radio-group v-model="initialStatus" size="small">
                <el-radio-button
                  v-for="opt in initialStatusOptions" :key="opt.value"
                  :value="opt.value" :disabled="opt.disabled"
                >
                  {{ $t(`common.orderStatus.${opt.value}`) }}
                </el-radio-button>
              </el-radio-group>
              <p class="initial-status-hint">{{ $t('manualOrder.initialStatusHint') }}</p>
            </div>

            <!-- 价格面板 sticky（≥600px 可见，<600px 由底部价格条替代） -->
            <div class="mo-price-sticky">
              <!-- 实时价格预览（画风模式：calculateStylePrice 明细 + R5 自定义增项并列） -->
              <div v-if="isStyleMode && stylePricePreview" class="price-preview">
                <div class="price-line">
                  <span>{{ stylePricePreview.styleName }} · {{ stylePricePreview.sizeName }}</span>
                  <span class="price-amount">¥{{ (stylePricePreview.basePrice ?? 0).toFixed(2) }}</span>
                </div>
                <div v-for="item in (stylePricePreview.addonItems || [])" :key="item.name" class="price-line">
                  <span>{{ item.name }}{{ item.quantity > 1 ? ` ×${item.quantity}` : '' }}</span>
                  <span class="price-amount">¥{{ (item.amount ?? 0).toFixed(2) }}</span>
                </div>
                <div v-if="stylePricePreview.multiplierTotal !== stylePricePreview.subtotal" class="price-line">
                  <span>{{ $t('manualOrder.afterMultiplier') }}</span>
                  <span class="price-amount">¥{{ (stylePricePreview.multiplierTotal ?? 0).toFixed(2) }}</span>
                </div>
                <div v-for="item in customAddons" :key="item.uid" class="price-line">
                  <span>{{ item.name }}</span>
                  <span class="price-amount">{{ formatCustomAddonPrice(item) }}</span>
                </div>
                <div class="price-divider"></div>
                <div class="price-line total">
                  <span>{{ $t('manualOrder.totalPrice') }}</span>
                  <span class="price-amount">¥{{ ((stylePricePreview.totalPrice ?? 0) + customAddonsTotal).toFixed(2) }}</span>
                </div>
              </div>
              <!-- 实时价格预览（旧档位模式：pricePreview 明细 + R5 自定义增项并列） -->
              <div v-else-if="form.tierId && pricePreview" class="price-preview">
                <div class="price-line" v-for="item in (pricePreview.breakdown || [])" :key="item.name">
                  <span>{{ item.name }}</span>
                  <span class="price-amount">¥{{ (item.amount ?? 0).toFixed(2) }}</span>
                </div>
                <div v-for="item in customAddons" :key="item.uid" class="price-line">
                  <span>{{ item.name }}</span>
                  <span class="price-amount">{{ formatCustomAddonPrice(item) }}</span>
                </div>
                <div class="price-divider"></div>
                <div class="price-line total">
                  <span>{{ $t('manualOrder.totalPrice') }}</span>
                  <span class="price-amount">¥{{ ((pricePreview.totalPrice ?? 0) + customAddonsTotal).toFixed(2) }}</span>
                </div>
              </div>
              <!-- R5: 自定义单（什么都不选）时无计算明细，自定义增项独立成块 -->
              <div v-else-if="customAddons.length > 0" class="price-preview">
                <div v-for="item in customAddons" :key="item.uid" class="price-line">
                  <span>{{ item.name }}</span>
                  <span class="price-amount">{{ formatCustomAddonPrice(item) }}</span>
                </div>
                <div class="price-divider"></div>
                <div class="price-line total">
                  <span>{{ $t('manualOrder.totalPrice') }}</span>
                  <span class="price-amount">¥{{ customAddonsTotal.toFixed(2) }}</span>
                </div>
              </div>

              <!-- R5 (REQ-029): 自定义增项录入（两条路径通用：选了画风可录，自定义单也可录） -->
              <div class="mo-field">
                <div class="mo-field-label custom-addon-label">
                  <span>{{ $t('manualOrder.customAddons') }}</span>
                  <el-button size="small" text type="primary" @click="customAddonOpen = !customAddonOpen">
                    ＋ {{ $t('manualOrder.addCustomAddon') }}
                  </el-button>
                </div>
                <div v-if="customAddonOpen" class="custom-addon-editor">
                  <el-input
                    v-model="customAddonName" maxlength="50" size="small"
                    :placeholder="$t('manualOrder.customAddonNamePlaceholder')"
                  />
                  <el-input-number
                    v-model="customAddonPrice" :precision="2" :step="10" :controls="false"
                    size="small" style="width: 130px"
                    :placeholder="$t('manualOrder.customAddonPricePlaceholder')"
                  />
                  <el-button type="primary" size="small" @click="addCustomAddon">✓</el-button>
                  <el-button size="small" @click="customAddonOpen = false">✕</el-button>
                </div>
                <div v-if="customAddons.length > 0" class="custom-addon-list">
                  <div v-for="(item, idx) in customAddons" :key="item.uid" class="custom-addon-item">
                    <span class="custom-addon-name">{{ item.name }}</span>
                    <span class="custom-addon-price" :class="{ 'custom-addon-price--neg': item.priceYuan < 0 }">
                      {{ formatCustomAddonPrice(item) }}
                    </span>
                    <el-button size="small" text type="danger" @click="removeCustomAddon(idx)">✕</el-button>
                  </div>
                </div>
              </div>

              <!-- 最终价格（可手动覆盖） -->
              <div class="mo-field">
                <div class="mo-field-label">{{ $t('manualOrder.finalPrice') }}</div>
                <div class="mo-final-row">
                  <el-input-number
                    v-model="priceInput"
                    :min="0" :max="999999.99" :precision="2" :step="10"
                    style="width: 200px"
                  />
                  <span class="final-price-hint">{{ $t('manualOrder.finalPriceHint') }}</span>
                </div>
              </div>

              <!-- 提交按钮（桌面/平板） -->
              <el-button type="primary" @click="submit" :loading="submitting" class="mo-submit-btn">
                {{ $t('manualOrder.submit') }}
                <template v-if="displayPrice"> — ¥{{ displayPrice }}</template>
              </el-button>
            </div>
          </section>
        </div>
      </el-form>

      <!-- ═══ 移动端底部钉住价格条（<600px，淘宝结算页模式） ═══ -->
      <div class="mo-mobile-bar">
        <!-- 展开明细（点价格区域切换） -->
        <transition name="mo-slide">
          <div v-show="mobileDetailOpen" class="mo-mobile-details">
            <div v-if="isStyleMode && stylePricePreview" class="price-preview">
              <div class="price-line">
                <span>{{ stylePricePreview.styleName }} · {{ stylePricePreview.sizeName }}</span>
                <span class="price-amount">¥{{ (stylePricePreview.basePrice ?? 0).toFixed(2) }}</span>
              </div>
              <div v-for="item in (stylePricePreview.addonItems || [])" :key="item.name" class="price-line">
                <span>{{ item.name }}{{ item.quantity > 1 ? ` ×${item.quantity}` : '' }}</span>
                <span class="price-amount">¥{{ (item.amount ?? 0).toFixed(2) }}</span>
              </div>
              <div v-if="stylePricePreview.multiplierTotal !== stylePricePreview.subtotal" class="price-line">
                <span>{{ $t('manualOrder.afterMultiplier') }}</span>
                <span class="price-amount">¥{{ (stylePricePreview.multiplierTotal ?? 0).toFixed(2) }}</span>
              </div>
              <div v-for="item in customAddons" :key="item.uid" class="price-line">
                <span>{{ item.name }}</span>
                <span class="price-amount">{{ formatCustomAddonPrice(item) }}</span>
              </div>
              <div class="price-divider"></div>
              <div class="price-line total">
                <span>{{ $t('manualOrder.totalPrice') }}</span>
                <span class="price-amount">¥{{ ((stylePricePreview.totalPrice ?? 0) + customAddonsTotal).toFixed(2) }}</span>
              </div>
            </div>
            <div v-else-if="form.tierId && pricePreview" class="price-preview">
              <div class="price-line" v-for="item in (pricePreview.breakdown || [])" :key="item.name">
                <span>{{ item.name }}</span>
                <span class="price-amount">¥{{ (item.amount ?? 0).toFixed(2) }}</span>
              </div>
              <div v-for="item in customAddons" :key="item.uid" class="price-line">
                <span>{{ item.name }}</span>
                <span class="price-amount">{{ formatCustomAddonPrice(item) }}</span>
              </div>
              <div class="price-divider"></div>
              <div class="price-line total">
                <span>{{ $t('manualOrder.totalPrice') }}</span>
                <span class="price-amount">¥{{ ((pricePreview.totalPrice ?? 0) + customAddonsTotal).toFixed(2) }}</span>
              </div>
            </div>
            <div v-else-if="customAddons.length > 0" class="price-preview">
              <div v-for="item in customAddons" :key="item.uid" class="price-line">
                <span>{{ item.name }}</span>
                <span class="price-amount">{{ formatCustomAddonPrice(item) }}</span>
              </div>
              <div class="price-divider"></div>
              <div class="price-line total">
                <span>{{ $t('manualOrder.totalPrice') }}</span>
                <span class="price-amount">¥{{ customAddonsTotal.toFixed(2) }}</span>
              </div>
            </div>

            <!-- R5: 移动端自定义增项（录入 + 列表，与桌面一致） -->
            <div class="mo-mobile-custom">
              <div class="mo-mobile-custom-label">
                <span>{{ $t('manualOrder.customAddons') }}</span>
                <el-button size="small" text type="primary" @click="customAddonOpen = !customAddonOpen">
                  ＋ {{ $t('manualOrder.addCustomAddon') }}
                </el-button>
              </div>
              <div v-if="customAddonOpen" class="custom-addon-editor">
                <el-input
                  v-model="customAddonName" maxlength="50" size="small"
                  :placeholder="$t('manualOrder.customAddonNamePlaceholder')"
                />
                <el-input-number
                  v-model="customAddonPrice" :precision="2" :step="10" :controls="false"
                  size="small" style="width: 130px"
                  :placeholder="$t('manualOrder.customAddonPricePlaceholder')"
                />
                <el-button type="primary" size="small" @click="addCustomAddon">✓</el-button>
                <el-button size="small" @click="customAddonOpen = false">✕</el-button>
              </div>
              <div v-if="customAddons.length > 0" class="custom-addon-list">
                <div v-for="(item, idx) in customAddons" :key="item.uid" class="custom-addon-item">
                  <span class="custom-addon-name">{{ item.name }}</span>
                  <span class="custom-addon-price" :class="{ 'custom-addon-price--neg': item.priceYuan < 0 }">
                    {{ formatCustomAddonPrice(item) }}
                  </span>
                  <el-button size="small" text type="danger" @click="removeCustomAddon(idx)">✕</el-button>
                </div>
              </div>
            </div>

            <div class="mo-mobile-final">
              <span>{{ $t('manualOrder.finalPrice') }}</span>
              <el-input-number
                v-model="priceInput"
                :min="0" :max="999999.99" :precision="2" :step="10"
                size="small" style="width: 150px"
              />
            </div>
          </div>
        </transition>
        <!-- 底栏：价格 + 提交 -->
        <div class="mo-mobile-actions">
          <div class="mo-mobile-price" @click="mobileDetailOpen = !mobileDetailOpen">
            <span class="mo-mobile-total">¥{{ displayPrice || '—' }}</span>
            <span class="mo-mobile-detail-link">
              {{ $t('manualOrder.priceDetail') }}
              <el-icon :size="12"><ArrowUp v-if="mobileDetailOpen" /><ArrowDown v-else /></el-icon>
            </span>
          </div>
          <el-button type="primary" @click="submit" :loading="submitting" class="mo-mobile-submit">
            {{ $t('manualOrder.submit') }}
          </el-button>
        </div>
      </div>

      <!-- 录入成功 -->
      <el-dialog v-model="showResult" :title="$t('manualOrder.resultTitle')" width="400px">
        <el-result icon="success" :title="$t('manualOrder.orderNo', { no: resultNo })">
          <template #sub-title>{{ $t('manualOrder.addedToQueue') }}</template>
          <template #extra>
            <el-button type="primary" @click="$router.push('/queue')">{{ $t('manualOrder.viewQueue') }}</el-button>
            <el-button @click="resetForm">{{ $t('manualOrder.continueEntry') }}</el-button>
          </template>
        </el-result>
      </el-dialog>
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { artistApi, artistPublicApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, InfoFilled, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import { useDropGuard } from '../../composables/useDropGuard.js'
import { useStageStatus } from '../../composables/useStageStatus.js'
import { formatDateTimeShort } from '../../utils/datetime.js'
import { ORDER_STATUS_TYPE } from '../../constants/order.js'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
const formRef = ref(null)
const tiers = ref([])
const submitting = ref(false)
const showResult = ref(false)
const resultNo = ref('')
const refFileList = ref([])
const uploadedRefs = ref([])
const refUidMap = ref(new Map())
const subdomain = ref('')

// ─── 价格计算器状态 ───
const pricingData = ref(null)
const pricePreview = ref(null)
const finalPriceYuan = ref(null)
// G2: 价格脏标记——画师是否手动改过价格（005 订单事故根因修复：
// 无脏标记时加增项后字段停在旧计算价，提交时被误判为画师有意改价而抹掉增项）
// 实现：el-input-number 绑定 priceInput（computed setter），用户输入/步进经 setter 置脏；
// doCalc 直接写 finalPriceYuan 绕过 setter，程序写入永不置脏。
const priceTouched = ref(false)
const priceInput = computed({
  get: () => finalPriceYuan.value,
  set: (v) => {
    priceTouched.value = true
    finalPriceYuan.value = v
  }
})

// ─── REQ-015 新增状态 ───
const mobileDetailOpen = ref(false)
const qqHistory = ref([])
const qqHistoryLoading = ref(false)
const qqHistoryLoaded = ref(false)

// ─── F4: 初始节点状态 ───
const workflowStages = ref([])
const { initialStatus, options: initialStatusOptions, findTarget: findTargetStage } = useStageStatus(workflowStages)

const form = reactive({
  clientQq: '',
  clientName: '',
  tierId: null,
  description: '',
  priority: 'medium',
  deadline: null,
  startDate: null,
  clientNotify: false,
  usageMultiplierId: null,
  rushMultiplierId: null
})

const rules = {
  clientQq: [{ required: true, message: () => t('manualOrder.fillClientQq'), trigger: 'blur' }]
}

// ─── 日期选择约束（B1/B2: 今天可选 + 截稿日↔开稿日双向互约束） ───
// B1: el-date-picker 面板日期是当天 0 点对象，new Date() 带当前时分秒 →
// 今天 0 点 < 当前时刻 = 今天被灰掉。归一化到当天 0 点比较：今天可选，昨天及以前灰掉。
// 录单页生命周期内跨天概率忽略不计，setup 期构造一次即可。
const today0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })()

// B2: 截稿日不可早于开稿日（对齐 OrderDetail.disableDeadlineDate；
// 两个字段是 value-format="YYYY-MM-DD" 字符串，构造边界用 T00:00:00 与 OrderDetail 一致）
function disableDeadlineDate(d) {
  if (d < today0) return true
  if (form.startDate) return d < new Date(form.startDate + 'T00:00:00')
  return false
}

// B2: 开稿日不可晚于截稿日（对齐 OrderDetail.disableStartDateDate）
function disableStartDateDate(d) {
  if (d < today0) return true
  if (form.deadline) return d > new Date(form.deadline + 'T00:00:00')
  return false
}

// ─── 辅助函数 ───
const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'
const formatDate = (str) => formatDateTimeShort(str)

// ─── 档位卡片选择（替代下拉框） ───
function selectTier(tier) {
  form.tierId = form.tierId === tier.id ? null : tier.id
  onTierChange()
}

const usageMultipliers = computed(() =>
  (pricingData.value?.multipliers || []).filter(m => m.type === 'usage')
)
const rushMultipliers = computed(() =>
  (pricingData.value?.multipliers || []).filter(m => m.type === 'rush')
)

// ─── v0.38 D路: 画风模式（画风→尺寸→增项 三级选择，交互对齐 OrderForm 的 useOrderForm） ───
/** 公开画风列表（GET /public/styles/:subdomain，只含 is_active=1；multi_style_enabled=0 时只含默认画风） */
const styles = ref([])
/** 画风模式：有画风数据时启用（styles.length > 0），旧档位模式完全不动 */
const isStyleMode = computed(() => styles.value.length > 0)
/** 多画风：需要选画风步骤（styles.length > 1）；单画风跳过选画风直接选尺寸 */
const isMultiStyle = computed(() => styles.value.length > 1)
/** 选中的画风 ID（单画风时自动选中唯一项） */
const selectedStyleId = ref(null)
const selectedStyle = computed(() => styles.value.find(s => s.id === selectedStyleId.value) || null)
/** 选中的尺寸 ID */
const selectedSizeId = ref(null)
const selectedSize = computed(() => selectedStyle.value?.sizes?.find(sz => sz.id === selectedSizeId.value) || null)
/** 当前尺寸下可用增项（后端已过滤 is_hidden / 尺寸覆盖） */
const availableStyleAddons = computed(() => selectedSize.value?.addons || [])
/** 增项选择状态 { [styleAddonId]: { toggled, quantity, optionLabel } } —— switch/quantity/radio 三形态 */
const styleAddonSelections = reactive({})
/** 画风价格预览（calculate-style-price 响应） */
const stylePricePreview = ref(null)

// ─── v0.38 补漏 R5: 自定义增项（两条路径通用，允许负数/0，上限 20） ───
/** 已录自定义增项 [{ uid, name, priceYuan }] */
const customAddons = ref([])
/** 录入区展开状态 */
const customAddonOpen = ref(false)
const customAddonName = ref('')
const customAddonPrice = ref(null)
/** 自定义增项合计（元） */
const customAddonsTotal = computed(() => customAddons.value.reduce((sum, a) => sum + (Number(a.priceYuan) || 0), 0))

/** 自定义增项金额文案（负数显示 -¥xx.xx） */
function formatCustomAddonPrice(item) {
  const v = Number(item.priceYuan) || 0
  return `${v < 0 ? '-' : ''}¥${Math.abs(v).toFixed(2)}`
}

/** 添加自定义增项（名称必填 ≤50 字；金额必填；上限 20 条） */
function addCustomAddon() {
  const name = customAddonName.value.trim()
  if (!name) {
    ElMessage.warning(t('manualOrder.customAddonNameRequired'))
    return
  }
  if (customAddons.value.length >= 20) {
    ElMessage.warning(t('manualOrder.customAddonMax'))
    return
  }
  const price = Number(customAddonPrice.value)
  if (customAddonPrice.value === null || customAddonPrice.value === undefined || Number.isNaN(price)) {
    ElMessage.warning(t('manualOrder.customAddonPriceRequired'))
    return
  }
  customAddons.value.push({ uid: `ca-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, priceYuan: price })
  customAddonName.value = ''
  customAddonPrice.value = null
  customAddonOpen.value = false
}

/** 删除已录自定义增项 */
function removeCustomAddon(idx) {
  customAddons.value.splice(idx, 1)
}

// ─── v0.38 补漏 R6: 图片显示开关（localStorage 记忆，默认开） ───
const SHOW_IMAGES_KEY = 'manualOrder_showImages'
/** 右栏卡片图片显示开关（画风 + 档位一起藏） */
const showImages = ref(localStorage.getItem(SHOW_IMAGES_KEY) !== '0')
watch(showImages, (v) => {
  try { localStorage.setItem(SHOW_IMAGES_KEY, v ? '1' : '0') } catch { /* 隐私模式等场景忽略 */ }
})

/** 画风卡片封面：F1/F3 约定 image_artwork_id 有值 → 用 artwork_image_path（实时引用），否则用 image */
function sizeImage(sz) {
  return sz.artwork_image_path || sz.image || null
}

/** 选择画风（多画风步骤 1）：切换时重置尺寸/增项/价格，脏标记恢复跟随计算（与切档语义一致） */
function selectStyle(id) {
  // B2 (REQ-029 §三 B2): 点已选中的画风卡 = 取消选中（对齐档位卡 toggle 交互），清空尺寸/增项/算价
  if (selectedStyleId.value === id) {
    selectedStyleId.value = null
    selectedSizeId.value = null
    for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
    stylePricePreview.value = null
    priceTouched.value = false
    return
  }
  selectedStyleId.value = id
  selectedSizeId.value = null
  for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
  stylePricePreview.value = null
  priceTouched.value = false
}

/** 选择尺寸（步骤 2）：切换时重置增项选择（不同尺寸可用增项不同）并重算 */
function selectSize(id) {
  if (selectedSizeId.value === id) return
  selectedSizeId.value = id
  for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
  stylePricePreview.value = null
  priceTouched.value = false
  initStyleAddonDefaults()
  scheduleStyleCalc()
}

/** 增项选择统一写入（初始化缺失的 { toggled, quantity, optionLabel } 结构） */
function setStyleAddon(id, patch) {
  if (!styleAddonSelections[id]) {
    styleAddonSelections[id] = { toggled: false, quantity: 0, optionLabel: null }
  }
  Object.assign(styleAddonSelections[id], patch)
}

/** 初始化增项默认值（el-input-number 的 v-model 不接受 undefined） */
function initStyleAddonDefaults() {
  for (const a of availableStyleAddons.value) {
    if (!styleAddonSelections[a.id]) {
      styleAddonSelections[a.id] = { toggled: false, quantity: 0, optionLabel: null }
    }
  }
}

/** 构建已选画风增项列表（计价与提交共用） */
function buildStyleAddons() {
  const addons = []
  for (const a of availableStyleAddons.value) {
    const sel = styleAddonSelections[a.id]
    if (!sel) continue
    if (a.control_type === 'switch' && sel.toggled) {
      addons.push({ styleAddonId: a.id })
    } else if (a.control_type === 'quantity' && sel.quantity > 0) {
      addons.push({ styleAddonId: a.id, quantity: sel.quantity })
    } else if (a.control_type === 'radio' && sel.optionLabel) {
      addons.push({ styleAddonId: a.id, optionLabel: sel.optionLabel })
    }
  }
  return addons
}

/** 解析 radio 选项 JSON（安全回退空数组） */
function parseAddonOptions(optionsJson) {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 画风增项价格文案（radio 按选项计价，显示"选项价"） */
function formatStyleAddonPrice(a) {
  if (a.control_type === 'radio') return t('manualOrder.addonOptionPrice')
  return `¥${a.price}${a.control_type === 'quantity' && a.unit_label ? '/' + a.unit_label : ''}`
}

/** 画风价格计算（防抖 300ms，与旧档位 doCalc 同一模式） */
let styleCalcTimer = null
function scheduleStyleCalc() {
  if (styleCalcTimer) clearTimeout(styleCalcTimer)
  styleCalcTimer = setTimeout(doStyleCalc, 300)
}

async function doStyleCalc() {
  if (!selectedSizeId.value) { stylePricePreview.value = null; return }
  try {
    stylePricePreview.value = await artistPublicApi.calculateStylePrice({
      subdomain: subdomain.value,
      styleSizeId: selectedSizeId.value,
      addons: buildStyleAddons(),
      usageMultiplierId: form.usageMultiplierId,
      rushMultiplierId: form.rushMultiplierId
    })
    // G2: 未手动改过价格 → 始终同步最新计算价；已手动改过 → 尊重画师手输。
    // 直接写 finalPriceYuan（绕过 priceInput setter，不置脏）
    if (!priceTouched.value) {
      finalPriceYuan.value = stylePricePreview.value.totalPrice
    }
  } catch {
    stylePricePreview.value = null
  }
}

/** 提交按钮上显示的价格：优先手动修改的最终价格，否则用计算价（画风模式用 stylePricePreview，均含 R5 自定义增项合计） */
const displayPrice = computed(() => {
  if (finalPriceYuan.value != null && finalPriceYuan.value > 0) return finalPriceYuan.value.toFixed(2)
  if (isStyleMode.value && stylePricePreview.value) return ((stylePricePreview.value.totalPrice ?? 0) + customAddonsTotal.value).toFixed(2)
  if (pricePreview.value) return ((pricePreview.value.totalPrice ?? 0) + customAddonsTotal.value).toFixed(2)
  if (customAddonsTotal.value !== 0) return customAddonsTotal.value.toFixed(2)
  return ''
})

/** QQ 号格式校验（5-15位纯数字） */
const qqValid = computed(() => /^\d{5,15}$/.test(form.clientQq.trim()))

/** 切换档位时清空倍率并重新计算 */
function onTierChange() {
  form.usageMultiplierId = null
  form.rushMultiplierId = null
  pricePreview.value = null
  finalPriceYuan.value = null
  priceTouched.value = false // G2: 切档后恢复"价格跟随计算"模式（倍率已清空，旧手输价失去意义）
}

// ─── 实时价格计算（防抖） ───
let calcTimer = null
function scheduleCalc() {
  if (calcTimer) clearTimeout(calcTimer)
  calcTimer = setTimeout(doCalc, 300)
}

async function doCalc() {
  if (!form.tierId) { pricePreview.value = null; return }

  try {
    pricePreview.value = await artistPublicApi.calculatePrice({
      subdomain: subdomain.value,
      tierId: form.tierId,
      usageMultiplierId: form.usageMultiplierId,
      rushMultiplierId: form.rushMultiplierId
    })
    // G2: 未手动改过价格 → 始终同步最新计算价（选档位后加倍率，字段跟随更新）；
    // 已手动改过 → 尊重画师手输。直接写 finalPriceYuan（绕过 priceInput setter，不置脏）
    if (!priceTouched.value) {
      finalPriceYuan.value = pricePreview.value.totalPrice
    }
  } catch {
    pricePreview.value = null
  }
}

watch([() => form.tierId, () => form.usageMultiplierId, () => form.rushMultiplierId], scheduleCalc)
// 画风模式：增项/倍率变化触发画风计价（旧模式路径由 doCalc 的 tierId 检查挡住，互不干扰）
watch(styleAddonSelections, scheduleStyleCalc, { deep: true })
watch([() => form.usageMultiplierId, () => form.rushMultiplierId], () => {
  if (isStyleMode.value && selectedSizeId.value) scheduleStyleCalc()
})

// ─── QQ 历史订单（防抖 500ms，客户端过滤——API 零改动） ───
let qqTimer = null
watch(() => form.clientQq, (qq) => {
  if (qqTimer) clearTimeout(qqTimer)
  const trimmed = (qq || '').trim()
  if (!/^\d{5,15}$/.test(trimmed)) {
    qqHistory.value = []
    qqHistoryLoaded.value = false
    return
  }
  qqHistoryLoading.value = true
  qqTimer = setTimeout(async () => {
    try {
      const res = await artistApi.getOrders(undefined, { page: 1, pageSize: 200 })
      const items = res.items ?? res
      qqHistory.value = items.filter(o => o.client_qq === trimmed).slice(0, 5)
    } catch {
      qqHistory.value = []
    } finally {
      qqHistoryLoading.value = false
      qqHistoryLoaded.value = true
    }
  }, 500)
})

// ─── 参考图上传 ───
async function handleRefUpload({ file }) {
  if (file.size > 10 * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    ElMessage.warning(t('manualOrder.fileTooBig', { name: file.name, size: sizeMB }))
    return
  }
  try {
    const uploaded = await uploadApi.reference(file)
    uploadedRefs.value.push(uploaded.filePath)
    refUidMap.value.set(file.uid, uploaded.filePath)
  } catch (err) {
    ElMessage.error(err.message || t('common.uploadFailed'))
    throw err
  }
}

function handleRefRemove(file) {
  const filePath = refUidMap.value.get(file.uid)
  if (filePath) {
    const idx = uploadedRefs.value.indexOf(filePath)
    if (idx > -1) uploadedRefs.value.splice(idx, 1)
    refUidMap.value.delete(file.uid)
  }
}

// ─── 粘贴上传（R5 复用） ───
const { pasteError } = usePasteUpload({
  onFiles: handlePasteRefFiles,
  maxCount: 5,
  maxSizeMB: 10
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

// G1: 页内拖拽守卫（捕获阶段挂在 el-upload 上，抢在 EP dragger 之前拦截）
const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()

async function handlePasteRefFiles(files) {
  for (const file of files) {
    if (refFileList.value.length >= 5) {
      ElMessage.warning(t('manualOrder.refExceed'))
      return
    }
    const uploaded = await uploadApi.reference(file)
    uploadedRefs.value.push(uploaded.filePath)
    const uid = `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`
    refUidMap.value.set(uid, uploaded.filePath)
    refFileList.value.push({ name: file.name || 'pasted-image.png', url: `/uploads/${uploaded.filePath}`, uid, status: 'success' })
  }
}

// ─── 提交 ───
async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // B2: 日期冲突前端兜底——开稿日晚于截稿日直接拦截不发请求（后端 INVALID_START_DATE 规则的前端子集）。
  // YYYY-MM-DD 定长字符串字典序 == 时间序，直接比较即可。
  if (form.startDate && form.deadline && form.startDate > form.deadline) {
    ElMessage.error(t('manualOrder.dateConflict'))
    return
  }

  // v0.38 D路 + 补漏 R2 (REQ-029 §四验收3): 画风模式未选尺寸时——手输过价 = 自定义单放行；
  // 未手输 = 半途状态拦截（避免误触 0 元单）
  if (isStyleMode.value && !selectedSizeId.value && !priceTouched.value) {
    ElMessage.warning(t('manualOrder.selectSizeOrPrice'))
    return
  }

  submitting.value = true
  try {
    // 画风模式：传 styleSizeId + styleAddons（替代 tierId），后端走 calculateStylePrice 自动算价
    // 旧模型档位：只传 tierId + 倍率（addons 旧字段已冻结，前端停传）
    const isStyleSubmit = isStyleMode.value && selectedSizeId.value

    const order = await artistApi.createManualOrder({
      clientQq: form.clientQq.trim(),
      clientName: form.clientName.trim() || null,
      tierId: isStyleSubmit ? null : form.tierId,
      description: form.description.trim() || null,
      priority: form.priority,
      clientNotify: form.clientNotify,
      references: uploadedRefs.value,
      // 画风模式结构化字段（后端验证+算价+创建）
      ...(isStyleSubmit ? {
        styleSizeId: selectedSizeId.value,
        styleAddons: buildStyleAddons()
      } : {}),
      usageMultiplierId: form.usageMultiplierId,
      rushMultiplierId: form.rushMultiplierId
    })

    // G2: 仅当画师手动改过价格才调 R2 接口写入（后端录单已按计算价自动入账）。
    // 无脏标记时绝不 updatePrice——修复 005 事故：字段停在旧计算价被误判为画师改价，
    // updatePrice 连带抹掉增项。手输价 ≠ 计算价（含无档位无计算价）时写入。
    let postCreateFailed = null
    if (order.id && priceTouched.value && finalPriceYuan.value != null) {
      // v0.38 D路: 画风模式的计算价来自 stylePricePreview
      const calcCents = isStyleMode.value
        ? (stylePricePreview.value?.totalPriceCents ?? null)
        : (pricePreview.value?.totalPriceCents ?? null)
      const manualCents = Math.round(finalPriceYuan.value * 100)
      if (manualCents > 0 && manualCents !== calcCents) {
        try {
          await artistApi.updatePrice(order.id, {
            finalPriceCents: manualCents,
            quoteSnapshot: order.quote_snapshot || null
          })
        } catch (e) { postCreateFailed = `价格写入失败：${e.message}` }
      }
    }

    // R5 (REQ-029): 自定义增项补写——createOrder 无自定义条目字段，创建后逐条调
    // extra-items 接口（对齐截稿日/开稿日的 postCreate 补写模式；价格允许负数=减项/让利、0=留痕）
    if (order.id && customAddons.value.length > 0) {
      for (const item of customAddons.value) {
        try {
          await artistApi.addExtraItem(order.id, {
            name: item.name,
            priceCents: Math.round((Number(item.priceYuan) || 0) * 100)
          })
        } catch (e) {
          postCreateFailed = postCreateFailed || `自定义增项「${item.name}」写入失败：${e.message}`
        }
      }
    }

    // R51: 截稿日（手动录单接口不支持 deadline 字段，创建后单独写入）
    if (order.id && form.deadline) {
      try {
        await artistApi.updateDeadline(order.id, form.deadline)
      } catch (e) { postCreateFailed = postCreateFailed || `截稿日写入失败：${e.message}` }
    }

    // F3: 开稿日（同截稿日，创建后单独写入）
    if (order.id && form.startDate) {
      try {
        await artistApi.updateStartDate(order.id, form.startDate)
      } catch (e) { postCreateFailed = postCreateFailed || `开稿日写入失败：${e.message}` }
    }

    // F4: 初始节点状态（非默认时推进到目标节点；R30d 有工作流的订单不能直接改 status）
    if (order.id && initialStatus.value !== 'pending') {
      try {
        if (workflowStages.value.length > 0) {
          const target = findTargetStage()
          if (target) await artistApi.advanceStage(order.id, target.id)
        } else {
          await artistApi.updateStatus(order.id, initialStatus.value)
        }
      } catch (e) { postCreateFailed = postCreateFailed || `初始状态设置失败：${e.message}` }
    }

    resultNo.value = order.order_no
    showResult.value = true
    // F6: 提交成功后清空草稿（下次进入不再弹恢复提示）
    clearDraft()
    if (postCreateFailed) {
      ElMessage.warning(`订单 ${order.order_no} 已创建，但${postCreateFailed}。请在订单详情中补充。`)
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  showResult.value = false
  form.clientQq = ''
  form.clientName = ''
  form.tierId = null
  form.description = ''
  form.priority = 'medium'
  form.deadline = null
  form.startDate = null
  initialStatus.value = 'pending'
  form.clientNotify = false
  form.usageMultiplierId = null
  form.rushMultiplierId = null
  // v0.38 D路: 画风状态重置（重新从画风/尺寸选起）
  selectedStyleId.value = null
  selectedSizeId.value = null
  for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
  stylePricePreview.value = null
  // v0.38 补漏 R5: 自定义增项重置
  customAddons.value = []
  customAddonOpen.value = false
  customAddonName.value = ''
  customAddonPrice.value = null
  pricePreview.value = null
  finalPriceYuan.value = null
  priceTouched.value = false // G2: 重置清脏标记，恢复"价格跟随计算"模式
  refFileList.value = []
  uploadedRefs.value = []
  refUidMap.value.clear()
  // REQ-015 新增状态重置
  qqHistory.value = []
  qqHistoryLoaded.value = false
  mobileDetailOpen.value = false
  // F6: 表单重置时同步清空草稿（继续录入 = 已消费旧草稿）
  clearDraft()
}

// ─── F6: 录单草稿暂存（localStorage 自动保存 + 恢复提示，键带 subdomain 后缀隔离画师） ───
// 对齐 useOrderForm R57 实现；差异：localStorage（录单页误关页面场景，session 失效丢数据更痛）、
// 不暂存图片文件对象（只存可序列化字段）；恢复弹窗在画风/档位数据就绪后触发。
const DRAFT_KEY_PREFIX = 'huiyue_manual_order_draft'
const draftKey = () => (subdomain.value ? `${DRAFT_KEY_PREFIX}_${subdomain.value}` : null)

/** 表单是否有内容（任一字段非空）——有内容才落盘，避免空表单刷新生造草稿键 */
const hasDraftContent = computed(() =>
  form.tierId != null
  // 多画风下"用户主动选了画风"即算；单画风自动选中不算（否则刚进页面就弹恢复框）
  || (isMultiStyle.value && selectedStyleId.value != null)
  || selectedSizeId.value != null
  || !!form.description.trim()
  || !!form.clientQq.trim()
  || !!form.clientName.trim()
  || !!form.deadline
  || !!form.startDate
  || form.priority !== 'medium'
  || form.clientNotify
  || Object.values(styleAddonSelections).some(s => s && (s.toggled || s.quantity > 0 || s.optionLabel != null))
  || customAddons.value.length > 0
  || finalPriceYuan.value != null
)

function saveDraft() {
  const key = draftKey()
  if (!key) return
  if (!hasDraftContent.value) {
    try { localStorage.removeItem(key) } catch { /* 隐私模式等场景忽略 */ }
    return
  }
  try {
    localStorage.setItem(key, JSON.stringify({
      form: {
        clientQq: form.clientQq,
        clientName: form.clientName,
        tierId: form.tierId,
        description: form.description,
        priority: form.priority,
        deadline: form.deadline,
        startDate: form.startDate,
        clientNotify: form.clientNotify,
        usageMultiplierId: form.usageMultiplierId,
        rushMultiplierId: form.rushMultiplierId
      },
      // 画风三步走状态（styleId/sizeId/增项勾选），恢复时按 isStyleMode 互斥取用
      styleState: {
        styleId: selectedStyleId.value,
        sizeId: selectedSizeId.value,
        addonSelections: { ...styleAddonSelections }
      },
      // 自定义增项（只存可序列化字段，uid 恢复时重发）
      customAddons: customAddons.value.map(a => ({ name: a.name, priceYuan: a.priceYuan })),
      // G2: 手输价格恢复（恢复时保留脏标记，避免被重算价格覆盖）
      finalPriceYuan: finalPriceYuan.value,
      priceTouched: priceTouched.value
    }))
  } catch { /* ignore */ }
}

let draftTimer = null
function scheduleDraftSave() {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(saveDraft, 800)
}

watch([() => form.clientQq, () => form.clientName, () => form.tierId, () => form.description,
  () => form.priority, () => form.deadline, () => form.startDate, () => form.clientNotify,
  () => form.usageMultiplierId, () => form.rushMultiplierId], scheduleDraftSave)
// 画风三步走状态变化也要存草稿（刷新后不丢选择）
watch(selectedStyleId, scheduleDraftSave)
watch(selectedSizeId, scheduleDraftSave)
watch(styleAddonSelections, scheduleDraftSave, { deep: true })
watch(customAddons, scheduleDraftSave, { deep: true })
watch(finalPriceYuan, scheduleDraftSave)

/** 清空草稿键（提交成功 / 恢复弹窗取消 / 重置表单时） */
function clearDraft() {
  const key = draftKey()
  if (!key) return
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

/** 把草稿回填到表单（画风/尺寸/增项若已被画师删除则逐项丢弃） */
function applyDraft(draft) {
  const f = draft.form || {}
  form.clientQq = f.clientQq || ''
  form.clientName = f.clientName || ''
  form.description = f.description || ''
  form.priority = f.priority || 'medium'
  form.deadline = f.deadline || null
  form.startDate = f.startDate || null
  form.clientNotify = !!f.clientNotify

  if (isStyleMode.value) {
    // ── 画风模式：恢复三步走状态，旧模型字段置空 ──
    form.tierId = null
    const ss = draft.styleState || {}
    if (ss.styleId != null) {
      const style = styles.value.find(s => s.id === ss.styleId)
      if (style) selectedStyleId.value = ss.styleId
    }
    const currentStyle = styles.value.find(s => s.id === selectedStyleId.value)
    if (currentStyle && ss.sizeId != null) {
      const size = (currentStyle.sizes || []).find(sz => sz.id === ss.sizeId)
      if (size) {
        selectedSizeId.value = ss.sizeId
        // 增项勾选只恢复当前尺寸可用增项中存在的键（其余可能已删/已隐藏）
        const validIds = new Set((size.addons || []).map(a => a.id))
        const saved = ss.addonSelections || {}
        for (const key of Object.keys(saved)) {
          const id = Number(key)
          if (validIds.has(id)) {
            styleAddonSelections[id] = { toggled: false, quantity: 0, optionLabel: null, ...saved[key] }
          }
        }
        // 补齐其余可用增项默认值（模板 v-model 不接受 undefined）
        initStyleAddonDefaults()
        form.usageMultiplierId = f.usageMultiplierId ?? null
        form.rushMultiplierId = f.rushMultiplierId ?? null
        // 尺寸有效 → 重算价格预览（防抖，与手动选择同路径）
        scheduleStyleCalc()
      }
    }
  } else {
    // ── 旧模型（tiers）：档位被删则丢弃该字段 ──
    const tierValid = f.tierId != null && tiers.value.some(tier => tier.id === f.tierId)
    form.tierId = tierValid ? f.tierId : null
    form.usageMultiplierId = tierValid ? (f.usageMultiplierId ?? null) : null
    form.rushMultiplierId = tierValid ? (f.rushMultiplierId ?? null) : null
  }

  // 自定义增项（uid 重发，避免草稿残留 uid 冲突）
  customAddons.value = Array.isArray(draft.customAddons)
    ? draft.customAddons.map(a => ({
        uid: `ca-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: String(a.name || ''),
        priceYuan: Number(a.priceYuan) || 0
      }))
    : []

  // G2: 手输价格恢复——保留脏标记，重算价不覆盖手输价
  if (draft.priceTouched && draft.finalPriceYuan != null) {
    priceTouched.value = true
    finalPriceYuan.value = draft.finalPriceYuan
  }
}

/** 恢复提示：mounted 且画风/档位数据就绪后调用；确认回填，取消/关闭清空草稿键 */
async function restoreDraft() {
  const key = draftKey()
  if (!key) return
  let raw
  try { raw = localStorage.getItem(key) } catch { return }
  if (!raw) return
  let draft
  try { draft = JSON.parse(raw) } catch { return }
  if (!draft || !draft.form) return

  try {
    await ElMessageBox.confirm(t('manualOrder.draftFound'), t('common.confirm'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'info'
    })
    applyDraft(draft)
    ElMessage.success(t('manualOrder.draftRestored'))
  } catch {
    // 用户取消/关闭弹窗 → 清空草稿键（下次进入不再打扰）
    clearDraft()
  }
}

/** 页面关闭/刷新前同步落盘（补防抖窗口内最后一次输入；只保存不拦截，不弹原生确认框） */
function onBeforeUnload() {
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = null }
  saveDraft()
}

// ─── 初始化 ───
onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  try {
    const profile = await artistApi.getProfile()
    subdomain.value = profile.subdomain
    tiers.value = profile.tiers || []
    // 加载价格数据（增项+倍率）
    artistPublicApi.getPricing(profile.subdomain)
      .then(res => { pricingData.value = res })
      .catch(() => {})
    // v0.38 D路: 加载画风列表（失败静默走旧档位模式兜底；单画风自动选中跳过选画风步）
    const stylesPromise = artistPublicApi.getPublicStyles(profile.subdomain)
      .then(res => {
        styles.value = res || []
        if (styles.value.length === 1) {
          selectedStyleId.value = styles.value[0].id
        }
      })
      .catch(() => {})
    // F4: 加载工作流节点（判断初始状态可达性）
    artistApi.getWorkflow()
      .then(res => { workflowStages.value = res.stages || [] })
      .catch(() => {})
    // F6: 画风/档位数据就绪后检查本地草稿——恢复回填需要 styles 已加载才能匹配画风/尺寸
    await stylesPromise
    await restoreDraft()
  } catch { /* ignore */ }
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (calcTimer) clearTimeout(calcTimer)
  if (styleCalcTimer) clearTimeout(styleCalcTimer)
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = null }
})
</script>

<style scoped>
/* ═══ v0.38: 全页换肤到纸墨 token（REQ-026 §二；模板与类名不动——测试断言依赖） ═══ */
/* ─── 页面容器 ─── */
.manual-order-page { max-width: 1200px; margin: 0 auto; }
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.manual-order-page h2 {
  font-family: var(--f-d);
  font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700;
  color: var(--ink);
  letter-spacing: .02em;
}
.hint { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); margin-top: 4px; }

/* ─── 双栏网格（≥1024px） ─── */
.mo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: start;
}
/* 分节标题：H2 思源 15/600，朱砂小方块 mark 呼应卡片头部（REQ §二） */
.mo-section {
  display: flex; align-items: center; gap: 9px;
  font-size: calc(var(--font-scale, 1) * 15px); font-weight: 600;
  color: var(--ink);
  margin: 0 0 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.mo-section::before {
  content: '';
  width: 4px; height: 13px;
  background: var(--zs);
  border-radius: 2px 1px 2px 1px;
  flex: none;
}

/* ─── R6 (REQ-029): 图片显示开关 ─── */
.mo-show-images {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; margin-bottom: 16px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600; color: var(--ink);
}

/* ─── R2 (REQ-029): 自定义单提示 ─── */
.style-skip-hint {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3);
  margin: 8px 0 0;
}

/* ─── R5 (REQ-029): 自定义增项 ─── */
.custom-addon-label {
  display: flex; align-items: center; justify-content: space-between;
}
.custom-addon-editor {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; flex-wrap: wrap;
}
.custom-addon-list {
  display: flex; flex-direction: column; gap: 4px;
  margin-top: 4px;
}
.custom-addon-item {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0;
  font-size: calc(var(--font-scale, 1) * 13px);
}
.custom-addon-name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--ink);
}
.custom-addon-price {
  font-weight: 600; color: var(--hq);
  font-variant-numeric: tabular-nums;
}
.custom-addon-price--neg { color: var(--zs); }
.mo-mobile-custom {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid var(--line);
}
.mo-mobile-custom-label {
  display: flex; align-items: center; justify-content: space-between;
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600; color: var(--ink);
}

/* ─── 参考图粘贴区（大块显眼） ─── */
.mo-ref-section {
  border: 2px dashed var(--line2);
  border-radius: var(--r-l);
  padding: 16px;
  background: var(--paper2);
  margin-bottom: 20px;
  transition: border-color 0.2s;
}
.mo-ref-section:hover, .mo-ref-section:focus-within {
  border-color: var(--hq);
}
.mo-ref-label {
  display: flex; align-items: center; gap: 4px;
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600;
  color: var(--ink);
  margin-bottom: 10px;
}
.ref-tip-icon {
  color: var(--ink3); cursor: help;
  vertical-align: middle; transition: color 0.2s;
}
.ref-tip-icon:hover { color: var(--hq); }
.mo-ref-upload :deep(.el-upload--picture-card) {
  width: 100%;
  height: 140px;
  /* F4: 46.67×100 细长条根因——固定 100px 高 + 窄父容器；改 16/9 矩形 + 最小高度兜底 */
  /* F4 修正（上传框变大根因，2026-08-07 五号实测 DOM）：EP 2.9 drag+picture-card 把 trigger 渲染进
     el-upload-list--picture-card（flex 容器）内部，aspect-ratio 参与 flex 尺寸协商导致上传后重排撑大；
     改固定高度不参与 flex 协商，list 容器设全宽（见下方新增规则） */
  border-radius: var(--r-m);
}
/* F4 修正：list flex 容器全宽，trigger/item 各自定尺寸不互相挤压 */
.mo-ref-upload :deep(.el-upload-list--picture-card) {
  width: 100%;
}
/* F4: drag 模式下 .el-upload-dragger 包在 picture-card 内——铺满整个虚线区，
   整块可拖拽（用户拍板：保留 drag，整个虚线区域可拖），中间图标垂直居中 */
.mo-ref-upload :deep(.el-upload-dragger) {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  border-radius: var(--r-m);
}
/* F4: 已上传缩略图保持 EP picture-card 默认方形（不被 dragger 铺满样式拉宽） */
.mo-ref-upload :deep(.el-upload-list--picture-card .el-upload-list__item) {
  width: 148px;
  height: 148px;
}
/* F2: 拖拽提示 */
.drag-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.paste-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-top: 6px; }

/* ─── 档位卡片 ─── */
.mo-field { margin-bottom: 20px; }
.mo-field-label {
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600;
  color: var(--ink);
  margin-bottom: 8px;
}
.tier-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.tier-card {
  position: relative;
  border: 2px solid var(--line);
  border-radius: var(--r-l);
  overflow: hidden;
  cursor: pointer;
  background: var(--card);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.tier-card:hover { border-color: color-mix(in srgb, var(--hq) 50%, transparent); box-shadow: var(--sh-1); }
.tier-card--active {
  border-color: var(--hq);
  box-shadow: 0 0 0 1px var(--hq);
}
.tier-card-check {
  position: absolute; top: 6px; right: 6px; z-index: 1;
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: var(--hq); color: #fff;
  border-radius: 50%; font-size: calc(var(--font-scale, 1) * 12px); font-weight: 700;
}
.tier-card-img {
  width: 100%; aspect-ratio: 4 / 3;
  object-fit: cover; display: block;
  background: var(--paper2);
}
/* v0.38 D路: 画风无封面时显示首字占位（与 OrderForm style-pick-img-empty 一致） */
.tier-card-img--empty {
  display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--font-scale, 1) * 32px); font-weight: 700; color: var(--ink4);
  aspect-ratio: 4 / 3;
  font-family: var(--f-d);
}
.tier-card-desc {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-top: 2px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.tier-card-body { padding: 10px 12px; }
.tier-card-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); }
/* 价格文楷落款感（REQ §1.3 数字用文楷），墨色不上色——统计数字铁律 */
.tier-card-price { font-size: calc(var(--font-scale, 1) * 15px); font-weight: 700; color: var(--ink); font-family: var(--f-d); margin-top: 2px; font-variant-numeric: tabular-nums; }
.tier-card-days { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-top: 2px; }
.mo-empty-tiers {
  padding: 24px; text-align: center;
  color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px);
  border: 1px dashed var(--line2); border-radius: var(--r-m);
}

/* ─── QQ 历史订单面板 ─── */
.mo-history {
  margin-top: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  padding: 14px 16px;
  background: var(--paper2);
  min-height: 60px;
}
.mo-history-title {
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 700;
  color: var(--ink2);
  margin: 0 0 10px;
}
.mo-history-empty {
  font-size: calc(var(--font-scale, 1) * 14px); color: var(--sl);
  font-weight: 600; padding: 4px 0;
}
.mo-history-list { display: flex; flex-direction: column; gap: 8px; }
.mo-history-item {
  display: flex; align-items: center; gap: 8px;
  font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink);
  flex-wrap: wrap;
}
.mo-history-no { font-weight: 600; font-variant-numeric: tabular-nums; font-family: var(--f-d); }
.mo-history-tier { color: var(--ink2); }
.mo-history-date { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 12px); margin-left: auto; }

/* ─── 增项分组（与 OrderForm 一致） ─── */
.addon-groups { width: 100%; }
.addon-group { margin-bottom: 12px; border: 1px solid var(--line); border-radius: var(--r-m); overflow: hidden; }
.addon-group-title {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: var(--paper2); cursor: pointer;
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink);
  user-select: none;
}
.addon-group-title:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.collapse-arrow { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 12px); }
.addon-items { padding: 8px 14px; }
.addon-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid var(--line);
}
.addon-item:last-child { border-bottom: none; }
.addon-item-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.addon-item-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 500; color: var(--ink); }
.addon-item-price { font-size: calc(var(--font-scale, 1) * 12px); color: var(--hq); font-weight: 600; font-variant-numeric: tabular-nums; }
.addon-item-desc { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink3); }

/* v0.38 D路: 画风增项列表（平铺式，对齐 OrderForm 交互；radio 选项可换行） */
.style-addon-list { width: 100%; }
.style-addon-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--line);
}
.style-addon-item:last-child { border-bottom: none; }
.style-addon-item :deep(.el-radio-group) { flex-wrap: wrap; justify-content: flex-end; }

/* ─── 倍率 ─── */
.multiplier-section { width: 100%; }
.multiplier-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.multiplier-label { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); flex-shrink: 0; }

/* ─── F4: 初始节点状态 ─── */
.initial-status-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin: 6px 0 0; }

/* ─── 价格面板 sticky ─── */
.mo-price-sticky {
  position: sticky; top: 24px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  padding: 20px;
  box-shadow: var(--sh-1);
  z-index: 10;
}
.price-preview {
  background: var(--paper2); border: 1px solid var(--line);
  border-radius: var(--r-m); padding: 14px 16px; margin-bottom: 16px;
}
.price-line { display: flex; justify-content: space-between; padding: 3px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
/* 总价：文楷落款数字（REQ §1.3），墨色不上色 */
.price-line.total { font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700; color: var(--ink); padding-top: 8px; }
.price-line.total .price-amount { font-family: var(--f-d); }
.price-amount { font-variant-numeric: tabular-nums; }
.price-divider { border-top: 1px dashed var(--line2); margin: 6px 0; }
.mo-final-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.final-price-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.mo-submit-btn { width: 100%; margin-top: 4px; }

/* ─── 移动端底部价格条（默认隐藏，<600px 显示） ─── */
.mo-mobile-bar { display: none; }

/* ─── 响应式：平板（600–1024px）单栏 ─── */
@media (max-width: 1023px) {
  .mo-grid { grid-template-columns: 1fr; }
}

/* ─── 响应式：手机（<600px）底部钉住价格条 ─── */
@media (max-width: 599px) {
  .mo-price-sticky { display: none; }
  .mo-mobile-bar {
    display: block;
    position: fixed; bottom: 0; left: 0; right: 0;
    z-index: 200;
    background: var(--card);
    border-top: 1px solid var(--line);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
  }
  .mo-mobile-details {
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    max-height: 40vh; overflow-y: auto;
  }
  .mo-mobile-final {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-top: 10px; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink);
  }
  .mo-mobile-actions {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
  }
  .mo-mobile-price {
    flex: 1; cursor: pointer;
    display: flex; flex-direction: column; gap: 2px;
  }
  /* 总价文楷（REQ §1.3 数字用文楷），墨色不上色 */
  .mo-mobile-total { font-size: calc(var(--font-scale, 1) * 20px); font-weight: 700; color: var(--ink); font-family: var(--f-d); font-variant-numeric: tabular-nums; }
  .mo-mobile-detail-link {
    font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink3);
    display: flex; align-items: center; gap: 2px;
  }
  .mo-mobile-submit { min-width: 120px; }
  /* 底部留白，防内容被价格条遮挡 */
  .manual-order-page { padding-bottom: 90px; }
}

/* ─── 明细展开动画 ─── */
.mo-slide-enter-active, .mo-slide-leave-active { transition: all 0.25s ease; }
.mo-slide-enter-from, .mo-slide-leave-to { opacity: 0; transform: translateY(8px); }
</style>
