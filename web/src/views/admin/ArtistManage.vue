<template>
  <div class="admin-page">
    <!-- 页头 -->
    <div class="admin-page-head">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.artistManage') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.artistManageSubtitle') }}</p>
      </div>
    </div>

    <!-- 819-I：画师操作收进分组卡片（组头朱砂小印点，按钮右对齐） -->
    <div class="group">
      <div class="group-head">{{ $t('admin.artistActions') }}</div>
      <div class="action-buttons">
        <el-button type="primary" @click="dialogVisible = true">{{ $t('admin.addArtist') }}</el-button>
        <el-button type="warning" plain @click="openTransfer">{{ $t('admin.transferAdmin') }}</el-button>
        <!-- REQ-039: 邀请码管理入口 -->
        <el-button plain @click="openInviteCodes">{{ $t('invite.manageTitle') }}</el-button>
        <el-button plain @click="openRecycleBin">{{ $t('admin.recycleBin.title') }}</el-button>
        <!-- 0817：已移除画师清单（软删兜底可恢复；回收站收文件，这里收画师） -->
        <el-button plain @click="openDeletedArtists">{{ $t('admin.deletedArtists.title') }}</el-button>
      </div>
    </div>

    <el-card shadow="never" class="admin-section-card">
      <!-- E14（2026-08-14）: 画师搜索 + 状态筛选（全量已拉取，客户端过滤，后端契约不动） -->
      <!-- 819-I：一行一事——说明在左、筛选控件在右 -->
      <div class="row artist-filter-row">
        <div class="artist-filter-text">
          <div class="lab">{{ $t('admin.artistFilterLabel') }}</div>
          <div class="desc">{{ $t('admin.artistFilterDesc') }}</div>
        </div>
        <div class="artist-filter-controls">
          <el-input
            v-model="artistQuery"
            :placeholder="$t('admin.artistSearchPlaceholder')"
            clearable
            prefix-icon="Search"
            class="artist-search-input"
          />
          <el-select v-model="artistStatusFilter" :placeholder="$t('admin.artistStatusAll')" style="width: 140px">
            <el-option value="" :label="$t('admin.artistStatusAll')" />
            <el-option value="open" :label="$t('common.statusShort.open')" />
            <el-option value="full" :label="$t('common.statusShort.full')" />
            <el-option value="break" :label="$t('common.statusShort.break')" />
            <el-option value="hidden" :label="$t('common.statusShort.hidden')" />
          </el-select>
          <span v-if="isArtistFiltering" class="artist-filter-count">{{ $t('admin.artistFilterCount', { n: filteredArtists.length }) }}</span>
        </div>
      </div>
      <el-table :data="filteredArtists" v-loading="loading" stripe>
        <el-table-column prop="name" :label="$t('admin.colName')" min-width="140">
          <template #default="{ row }">
            <span class="cell-name">{{ row.name }}</span>
            <el-tag v-if="row.isAdmin" type="danger" size="small" class="cell-tag">{{ $t('admin.adminTag') }}</el-tag>
            <!-- 815-b3-ban：被封禁画师行显式标识（解封入口可定位） -->
            <el-tag v-if="row.is_banned" type="warning" size="small" class="cell-tag">{{ $t('compliance.admin.bannedTag') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" min-width="140">
          <template #default="{ row }"><code class="cell-code">{{ $t('admin.domainSuffix') }}{{ row.subdomain }}</code></template>
        </el-table-column>
        <el-table-column prop="qq_number" :label="$t('admin.colQq')" width="120" />
        <el-table-column prop="bio" :label="$t('admin.colBio')" min-width="160" show-overflow-tooltip />
        <!-- 登录留痕批（v72）：列表相对时间，悬浮看完整时间+IP，详情在抽屉 -->
        <el-table-column :label="$t('admin.colLastLogin')" width="120">
          <template #default="{ row }">
            <span :title="lastLoginTooltip(row)">{{ relativeLastLogin(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.colStatus')" width="130">
          <template #default="{ row }">
            <el-select
              v-model="row.status" size="small" style="width: 100px"
              :disabled="statusUpdatingId === row.id"
              @change="(val: string | number | boolean) => changeStatus(row, val)"
            >
              <el-option value="open" :label="$t('common.statusShort.open')" />
              <el-option value="full" :label="$t('common.statusShort.full')" />
              <el-option value="break" :label="$t('common.statusShort.break')" />
              <el-option value="hidden" :label="$t('common.statusShort.hidden')" />
            </el-select>
          </template>
        </el-table-column>
        <!-- 813-fq-tail-shared 战役 S：≤760px 操作列收成图标按钮（aria-label/title 保留文案），
             防止 360px 固定列在窄屏挤压、横向溢出；817-B2：封禁/解封/移除集中同一操作区（分隔片 4px），
             窄屏宽度 176→180、宽屏 360→364（均 4px 倍数） -->
        <el-table-column :label="$t('common.actions')" :width="compactActions ? 180 : 364" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <template v-if="compactActions">
                <el-button size="small" circle :icon="View" :title="$t('admin.manage')" :aria-label="$t('admin.manage')" @click="openDetail(row)" />
                <el-button size="small" circle :icon="Tickets" :title="$t('admin.artistOrders')" :aria-label="$t('admin.artistOrders')" @click="viewOrders(row)" />
                <!-- REQ-027: TOTP 绑定入口 -->
                <el-button
                  size="small" circle type="success" plain :icon="Key"
                  :title="row.totp_verified ? $t('admin.totpRebind') : $t('admin.totpBind')"
                  :aria-label="row.totp_verified ? $t('admin.totpRebind') : $t('admin.totpBind')"
                  @click="openTotpBind(row)"
                />
                <!-- 817-B2：封禁/解封/移除统一操作区（分隔片后三键相邻；封禁参照举报管理页两步确认） -->
                <span class="row-action-divider" aria-hidden="true" />
                <el-button
                  v-if="!row.is_banned && !row.isAdmin"
                  size="small" circle type="danger" plain :icon="Lock"
                  :title="$t('compliance.admin.ban')" :aria-label="$t('compliance.admin.ban')"
                  :loading="banUpdatingId === row.id" :disabled="banUpdatingId != null"
                  @click="banArtist(row)"
                />
                <el-button
                  v-else-if="row.is_banned && !row.isAdmin"
                  size="small" circle type="success" plain :icon="Unlock"
                  :title="$t('compliance.admin.unban')" :aria-label="$t('compliance.admin.unban')"
                  :loading="banUpdatingId === row.id" :disabled="banUpdatingId != null"
                  @click="unbanArtist(row)"
                />
                <el-button size="small" circle type="danger" plain :icon="Delete" :title="$t('common.remove')" :aria-label="$t('common.remove')" @click="remove(row)" :disabled="row.isAdmin" />
              </template>
              <template v-else>
                <el-button size="small" type="primary" @click="openDetail(row)">{{ $t('admin.manage') }}</el-button>
                <el-button size="small" @click="viewOrders(row)">{{ $t('admin.artistOrders') }}</el-button>
                <!-- REQ-027: TOTP 绑定入口 -->
                <el-button size="small" type="success" plain @click="openTotpBind(row)">
                  {{ row.totp_verified ? $t('admin.totpRebind') : $t('admin.totpBind') }}
                </el-button>
                <!-- 817-B2：封禁/解封/移除统一操作区（分隔片后三键相邻；封禁两步确认） -->
                <span class="row-action-divider" aria-hidden="true" />
                <el-button
                  v-if="!row.is_banned && !row.isAdmin"
                  size="small" type="danger" plain
                  :loading="banUpdatingId === row.id" :disabled="banUpdatingId != null"
                  @click="banArtist(row)"
                >
                  {{ $t('compliance.admin.ban') }}
                </el-button>
                <el-button
                  v-else-if="row.is_banned && !row.isAdmin"
                  size="small" type="success" plain
                  :loading="banUpdatingId === row.id" :disabled="banUpdatingId != null"
                  @click="unbanArtist(row)"
                >
                  {{ $t('compliance.admin.unban') }}
                </el-button>
                <el-button size="small" type="danger" plain @click="remove(row)" :disabled="row.isAdmin">{{ $t('common.remove') }}</el-button>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加画师弹窗 -->
    <el-dialog v-model="dialogVisible" :title="$t('admin.addTitle')" width="420px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="$t('admin.qqLabel')" required>
          <el-input v-model="form.qqNumber" :placeholder="$t('admin.qqPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.nameLabel')" required>
          <el-input v-model="form.name" :placeholder="$t('admin.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.subdomainLabel')" required>
          <el-input v-model="form.subdomain" :placeholder="$t('admin.subdomainPlaceholder')">
            <template #prepend>{{ $t('admin.domainSuffix') }}</template>
          </el-input>
        </el-form-item>
        <el-form-item :label="$t('admin.codeLabel')">
          <el-input v-model="form.artistCode" :placeholder="$t('admin.codePlaceholder')" maxlength="20" />
        </el-form-item>
        <el-form-item :label="$t('admin.bioLabel')">
          <el-input v-model="form.bio" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="addArtist" :loading="saving">{{ $t('common.add') }}</el-button>
      </template>
    </el-dialog>

    <!-- 订单记录弹窗 -->
    <el-dialog v-model="ordersVisible" :title="`${ordersArtist?.name} - ${$t('admin.artistOrders')}`" width="700px">
      <!-- P1-B：加载失败不再静默——错误横幅 + 重试（张冠李戴防护：打开即清旧数据） -->
      <div v-if="ordersFailed && !ordersLoading" class="orders-error load-error-banner" role="alert">
        <span>{{ t('common.networkError') }}</span>
        <el-button size="small" @click="retryOrders">{{ t('dashboard.retry') }}</el-button>
      </div>
      <template v-else>
        <el-table :data="pagedOrders" v-loading="ordersLoading" stripe max-height="400" row-key="id">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="order-expand-pay">
                <!-- B7: 付款进度摘要 -->
                <div class="expand-pay-summary" v-if="row.final_price_cents != null || row.finalPriceCents != null">
                  <span>{{ $t('admin.payPaid') }} <strong>¥{{ formatCents(row.paidTotalCents ?? row.paid_total_cents ?? 0) }}</strong></span>
                  <span>/ {{ $t('admin.payFinal') }} <strong>¥{{ formatCents(row.finalPriceCents ?? row.final_price_cents ?? 0) }}</strong></span>
                  <span>{{ $t('admin.payRemaining') }} <strong>¥{{ formatCents(Math.max(0, (row.finalPriceCents ?? row.final_price_cents ?? 0) - (row.paidTotalCents ?? row.paid_total_cents ?? 0))) }}</strong></span>
                </div>
                <!-- 分期三态参考 -->
                <div class="expand-pay-insts" v-if="row.installments?.length">
                  <div v-for="(inst, idx) in row.installments" :key="idx" class="expand-inst-row">
                    <span>{{ inst.status === 'paid' ? '✓' : inst.status === 'partial' ? '◐' : '○' }}</span>
                    <span>{{ inst.name }}</span>
                    <span>¥{{ formatCents(inst.amountCents || inst.amount_cents || 0) }}</span>
                    <el-tag :type="inst.status === 'paid' ? 'success' : inst.status === 'partial' ? 'warning' : 'info'" size="small">
                      {{ inst.status === 'paid' ? $t('admin.payRefPaid') : inst.status === 'partial' ? $t('admin.payRefPartial') : $t('admin.payRefPending') }}
                    </el-tag>
                  </div>
                </div>
                <p v-else class="expand-no-data">{{ $t('admin.payNoData') }}</p>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="order_no" :label="$t('admin.orderColNo')" width="120" />
          <el-table-column prop="client_qq" :label="$t('admin.orderColQq')" width="120" />
          <el-table-column prop="tier_name" :label="$t('admin.orderColType')" width="100">
            <template #default="{ row }">{{ row.tier_name || $t('common.custom') }}</template>
          </el-table-column>
          <el-table-column :label="$t('admin.orderColStatus')" width="100">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">{{ $t(`common.orderStatus.${row.status}`) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" :label="$t('admin.orderColTime')">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!ordersLoading && orders.length === 0" :description="$t('admin.noOrders')" :image-size="60" />
        <!-- b3 清扫：订单弹窗客户端分页（全量已拉取，仅限制 DOM 渲染量；打开/重试时重置页码） -->
        <div v-if="orders.length > ORDERS_PAGE_SIZE" class="pager">
          <el-pagination
            v-model:current-page="ordersPage"
            :page-size="ORDERS_PAGE_SIZE"
            :total="orders.length"
            layout="total, prev, pager, next"
          />
        </div>
      </template>
    </el-dialog>

    <!-- 更换管理员弹窗（两步 TOTP 验证，REQ-027） -->
    <el-dialog v-model="transferVisible" :title="$t('admin.transferTitle')" width="450px" :close-on-click-modal="false">
      <!-- 步骤1：验证当前管理员 -->
      <div v-if="transferStep === 1">
        <h4 class="dialog-h4">{{ $t('admin.transferStep1Title') }}</h4>
        <el-form label-position="top">
          <el-form-item :label="$t('admin.currentAdminQq')">
            <el-input :model-value="currentAdminQq" disabled />
          </el-form-item>
          <el-form-item :label="$t('admin.totpCodeLabel')">
            <el-input v-model="currentCode" maxlength="6" :placeholder="$t('admin.totpCodePlaceholder')" />
          </el-form-item>
          <p class="transfer-hint">{{ $t('admin.transferTotpHint') }}</p>
        </el-form>
      </div>

      <!-- 步骤2：验证新管理员 -->
      <div v-else>
        <h4 class="dialog-h4">{{ $t('admin.transferStep2Title') }}</h4>
        <el-form label-position="top">
          <el-form-item :label="$t('admin.newAdminQq')">
            <el-input v-model="newQq" :placeholder="$t('admin.newAdminQqPlaceholder')" />
          </el-form-item>
          <el-form-item :label="$t('admin.totpCodeLabel')">
            <el-input v-model="newCode" maxlength="6" :placeholder="$t('admin.totpCodePlaceholder')" />
          </el-form-item>
          <p class="transfer-hint">{{ $t('admin.transferTotpHint') }}</p>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="transferVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button v-if="transferStep === 1" type="primary" :disabled="!currentCode" @click="transferStep = 2">
          {{ $t('admin.nextStep') }}
        </el-button>
        <el-button v-else type="primary" :disabled="!newCode" @click="confirmTransfer" :loading="transferring">
          {{ $t('admin.confirmTransfer') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- REQ-041 集成接线：更换管理员动作级再验（提交遇 STEP_UP_REQUIRED 弹窗，验证通过自动重提交） -->
    <StepUpDialog v-model="actionStepUpVisible" @verified="onActionStepUpVerified" @cancel="onActionStepUpCancel" />

    <!-- TOTP 绑定弹窗（REQ-027 R2：管理员协助画师扫码绑定） -->
    <el-dialog v-model="totpVisible" :title="$t('admin.totpBindTitle', { name: totpArtist?.name || '' })" width="420px" :close-on-click-modal="false">
      <div v-loading="totpLoading">
        <p class="totp-step">{{ $t('admin.totpStep1') }}</p>
        <div class="totp-qr-wrap">
          <img v-if="totpQr" :src="totpQr" alt="TOTP QR" class="totp-qr" />
          <el-button v-else text type="primary" @click="genTotpQr">{{ $t('admin.totpRegenerate') }}</el-button>
        </div>
        <p class="totp-step">{{ $t('admin.totpStep2') }}</p>
        <el-input
          v-model="totpCode" maxlength="6" size="large"
          :placeholder="$t('admin.totpCodePlaceholder')" @keyup.enter="confirmTotpBind"
        />
        <p class="totp-hint">{{ $t('admin.totpRegenerateHint') }}</p>
      </div>
      <template #footer>
        <el-button @click="totpVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="danger" plain :loading="totpLoading" @click="resetTotpBind">
          {{ $t('admin.totpReset') }}
        </el-button>
        <el-button @click="genTotpQr" :loading="totpLoading">{{ $t('admin.totpRegenerate') }}</el-button>
        <el-button type="primary" :disabled="!totpCode" @click="confirmTotpBind" :loading="totpLoading">
          {{ $t('admin.totpBindConfirm') }}
        </el-button>
      </template>
    </el-dialog>
    <!-- 画师详情抽屉 -->
    <!-- 回收站（从主页迁入：孤儿文件可恢复；REQ-022 F4 分页） -->
    <el-dialog v-model="recycleVisible" :title="$t('admin.recycleBin.title')" width="720px" :close-on-click-modal="false">
      <div class="recycle-body">
        <el-table v-if="recycleLoading || recycleItems.length > 0" :data="recycleItems" v-loading="recycleLoading" stripe max-height="420">
          <el-table-column prop="fileName" :label="$t('admin.recycleBin.colFile')" min-width="160" show-overflow-tooltip />
          <el-table-column prop="originalPath" :label="$t('admin.recycleBin.colPath')" min-width="180" show-overflow-tooltip />
          <el-table-column :label="$t('admin.recycleBin.colSize')" width="90">
            <template #default="{ row }">{{ formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column :label="$t('admin.recycleBin.colMovedAt')" width="160">
            <template #default="{ row }">{{ formatDateTime(row.movedAt) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else :description="$t('admin.recycleBin.emptyHint')" />
        <!-- REQ-022 F4: 分页（每页 20 条） -->
        <div v-if="recycleTotal > 0" class="pager">
          <el-pagination
            v-model:current-page="recyclePage"
            :page-size="recyclePageSize"
            :total="recycleTotal"
            layout="total, prev, pager, next"
            @current-change="loadRecycleBin"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="recycleVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button v-if="recycleTotal > 0" type="danger" plain :loading="emptying" @click="handleEmptyRecycleBin">
          {{ $t('admin.recycleBin.empty') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 0817：已移除画师（软删兜底：清单可见+可恢复；恢复后需重新登录） -->
    <el-dialog v-model="deletedVisible" :title="$t('admin.deletedArtists.title')" width="720px" :close-on-click-modal="false">
      <div class="recycle-body">
        <el-table v-if="deletedLoading || deletedItems.length > 0" :data="deletedItems" v-loading="deletedLoading" stripe max-height="420">
          <el-table-column prop="name" :label="$t('admin.colName')" min-width="120">
            <template #default="{ row }">
              <span>{{ row.name }}</span>
              <el-tag v-if="row.isBanned" type="warning" size="small" class="cell-tag">{{ $t('compliance.admin.bannedTag') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" min-width="140">
            <template #default="{ row }"><code class="cell-code">{{ $t('admin.domainSuffix') }}{{ row.subdomain }}</code></template>
          </el-table-column>
          <el-table-column prop="qqNumber" :label="$t('admin.colQq')" width="120" />
          <el-table-column :label="$t('admin.deletedArtists.colDeletedAt')" width="170">
            <template #default="{ row }">{{ formatDateTime(row.deletedAt) }}</template>
          </el-table-column>
          <!-- 824 响应式巡逻：操作列右固定，防窄屏藏进表内横滚 -->
          <el-table-column :label="$t('common.actions')" width="110" align="right" fixed="right">
            <template #default="{ row }">
              <el-button
                size="small" type="primary" plain
                :loading="restoringId === row.id" :disabled="restoringId != null"
                @click="restoreDeletedArtist(row)"
              >
                {{ $t('admin.deletedArtists.restore') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else :description="$t('admin.deletedArtists.empty')" />
      </div>
      <template #footer>
        <el-button @click="deletedVisible = false">{{ $t('common.cancel') }}</el-button>
      </template>
    </el-dialog>

    <!-- REQ-039: 邀请码管理弹窗（生成/列表/复制/吊销；纸墨 token + CardHead） -->
    <el-dialog v-model="inviteVisible" :title="$t('invite.manageTitle')" width="760px" :close-on-click-modal="false">
      <div class="invite-body">
        <CardHead :title="$t('invite.generateTitle')" />
        <div class="invite-gen">
          <el-form inline label-position="top" class="invite-form">
            <el-form-item :label="$t('invite.countLabel')">
              <el-input-number v-model="inviteCount" :min="1" :max="50" controls-position="right" />
              <span class="invite-form-hint">{{ $t('invite.countHint') }}</span>
            </el-form-item>
            <el-form-item :label="$t('invite.validDaysLabel')">
              <el-input-number v-model="inviteValidDays" :min="1" :max="30" controls-position="right" />
              <span class="invite-form-hint">{{ $t('invite.validDaysHint') }}</span>
            </el-form-item>
            <el-form-item :label="$t('invite.maxUsesLabel')">
              <el-input-number v-model="inviteMaxUses" :min="1" :max="100" controls-position="right" />
              <span class="invite-form-hint">{{ $t('invite.maxUsesHint') }}</span>
            </el-form-item>
            <el-form-item class="invite-form-action">
              <el-button type="primary" :loading="inviteGenerating" @click="generateInviteCodes">
                {{ $t('invite.generateBtn') }}
              </el-button>
            </el-form-item>
          </el-form>
          <p class="invite-hint">{{ $t('invite.manageHint') }}</p>
        </div>

        <CardHead :title="$t('invite.colCode')" />
        <!-- 服务端筛选栏：状态下拉 + 码搜索（任一变更回第 1 页重拉） -->
        <div class="invite-filter">
          <el-select v-model="inviteStatusFilter" style="width: 130px" @change="onInviteFilterChange">
            <el-option value="all" :label="$t('invite.statusAll')" />
            <el-option value="unused" :label="$t('invite.statusUnused')" />
            <el-option value="used" :label="$t('invite.statusUsed')" />
            <el-option value="expired" :label="$t('invite.statusExpired')" />
            <el-option value="revoked" :label="$t('invite.statusRevoked')" />
          </el-select>
          <el-input
            v-model="inviteQuery"
            :placeholder="$t('invite.searchPlaceholder')"
            clearable
            prefix-icon="Search"
            class="invite-search-input"
            @change="onInviteFilterChange"
          />
        </div>
        <el-table :data="inviteCodes" v-loading="inviteLoading" stripe max-height="420">
          <el-table-column :label="$t('invite.colCode')" min-width="170">
            <template #default="{ row }">
              <code class="invite-code">{{ row.code }}</code>
              <el-button
                v-if="row.status === 'unused'" size="small" text type="primary"
                class="invite-copy" @click="copyInviteCode(row.code)"
              >
                {{ $t('invite.copy') }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column :label="$t('invite.colStatus')" width="110">
            <template #default="{ row }">
              <el-tag :type="inviteStatusType(row)" size="small">
                {{ $t(inviteStatusLabelKey(row)) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('invite.colExpires')" width="180">
            <template #default="{ row }">{{ formatDateTime(row.expiresAt) }}</template>
          </el-table-column>
          <el-table-column :label="$t('invite.colUsage')" min-width="140">
            <template #default="{ row }">
              <!-- 多次码：已用 N/M 可点开使用记录；单次码保持显示使用人 -->
              <el-button
                v-if="row.maxUses > 1" size="small" text type="primary"
                @click="openInviteUses(row)"
              >
                {{ $t('invite.usedCount', { used: row.useCount, max: row.maxUses }) }}
              </el-button>
              <template v-else>
                <span v-if="row.usedBy">{{ row.usedBy.name || row.usedBy.qqNumber }}</span>
                <span v-else class="invite-unused">—</span>
              </template>
            </template>
          </el-table-column>
          <el-table-column :label="$t('invite.colActions')" width="100" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'unused'" size="small" type="danger" plain
                @click="revokeInviteCode(row)"
              >
                {{ $t('invite.revoke') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!inviteLoading && inviteCodes.length === 0" :description="$t('invite.empty')" :image-size="60" />
        <!-- 服务端分页（默认 20/页） -->
        <div v-if="inviteTotal > 0" class="pager">
          <el-pagination
            v-model:current-page="invitePage"
            :page-size="invitePageSize"
            :total="inviteTotal"
            layout="total, prev, pager, next"
            @current-change="loadInviteCodes"
          />
        </div>
      </div>
    </el-dialog>

    <!-- 邀请码使用记录子弹窗（多次码；倒序最近在前） -->
    <el-dialog v-model="inviteUsesVisible" :title="$t('invite.usesTitle')" width="560px" append-to-body>
      <el-table v-if="inviteUsesLoading || inviteUses.length > 0" :data="inviteUses" v-loading="inviteUsesLoading" stripe max-height="360">
        <el-table-column :label="$t('invite.usesColName')" min-width="120">
          <template #default="{ row }">{{ row.name || '—' }}</template>
        </el-table-column>
        <el-table-column :label="$t('invite.usesColQq')" width="130">
          <template #default="{ row }">{{ row.qqNumber || '—' }}</template>
        </el-table-column>
        <el-table-column :label="$t('invite.usesColTime')" width="180">
          <template #default="{ row }">{{ formatDateTime(row.usedAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="$t('invite.usesEmpty')" :image-size="60" />
    </el-dialog>

    <ArtistDetailDrawer v-model="detailVisible" :artist="detailArtist" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { adminApi, complianceApi, type ApiError } from '../../api/index'
import type { AdminArtistItem, AdminInviteCode, AdminOrderItem, RecycleBinItem, DeletedArtistItem, ArtistStatus, InviteCodeUse } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { View, Tickets, Key, Delete, Unlock, Lock } from '@element-plus/icons-vue'
import { ARTIST_STATUS_TYPE } from '../../constants/order'
import { formatDateTime } from '../../utils/datetime'
import { formatCents } from '../../utils/money'
import ArtistDetailDrawer from './ArtistDetailDrawer.vue'
// REQ-041 集成接线：更换管理员动作级再验对话框（后端 requireAdminReauth 已就位）
import StepUpDialog from '../../components/admin/StepUpDialog.vue'
// REQ-039: 纸墨卡片头（管理弹窗内分组标题）
import CardHead from '../../components/artist/visual/CardHead.vue'

const { t } = useI18n()
const artists = ref<AdminArtistItem[]>([])
const loading = ref(true)

// ─── E14（2026-08-14）: 画师搜索 + 状态筛选 ───
// 列表全量一次拉取（画师量小），过滤纯客户端：昵称/子域名/QQ/简介模糊匹配（大小写不敏感）+ 状态精确匹配
const artistQuery = ref('')
const artistStatusFilter = ref('')
const isArtistFiltering = computed(() => !!artistQuery.value.trim() || !!artistStatusFilter.value)
const filteredArtists = computed(() => {
  const q = artistQuery.value.trim().toLowerCase()
  const st = artistStatusFilter.value
  return artists.value.filter(a => {
    if (st && a.status !== st) return false
    if (!q) return true
    return [a.name, a.subdomain, a.qq_number, a.bio].some(v => String(v ?? '').toLowerCase().includes(q))
  })
})
const dialogVisible = ref(false)
const saving = ref(false)
// b3 清扫：行内状态切换期间禁用下拉，防连续触发
const statusUpdatingId = ref<number | null>(null)
// 815-b3-ban：封禁/解封行级操作挂起 id（prompt/请求期间按钮 loading，防重复提交）
const banUpdatingId = ref<number | null>(null)

// 813-fq-tail-shared 战役 S：≤760px 行操作按钮收成图标（防窄屏 360px 固定列挤压）
const compactActions = ref(window.matchMedia('(max-width: 760px)').matches)
const mqCompactActions = window.matchMedia('(max-width: 760px)')
function onCompactActionsChange(e: MediaQueryListEvent) { compactActions.value = e.matches }
onMounted(() => mqCompactActions.addEventListener('change', onCompactActionsChange))
onUnmounted(() => mqCompactActions.removeEventListener('change', onCompactActionsChange))

const form = reactive({ qqNumber: '', name: '', subdomain: '', bio: '', artistCode: '' })

// ─── REQ-039: 邀请码管理（多次使用码 + 服务端分页/筛选） ───
const inviteVisible = ref(false)
const inviteCodes = ref<AdminInviteCode[]>([])
const inviteLoading = ref(false)
const inviteGenerating = ref(false)
const inviteCount = ref(5)
const inviteValidDays = ref(3)
/** 每码可用次数（1=一次性，1-100） */
const inviteMaxUses = ref(1)
// 服务端筛选/分页状态（'all' 哨兵值：el-select 空串值不渲染选项文案会退化成「请选择」占位）
const inviteStatusFilter = ref<'all' | 'unused' | 'used' | 'expired' | 'revoked'>('all')
const inviteQuery = ref('')
const invitePage = ref(1)
const invitePageSize = 20
const inviteTotal = ref(0)
// 使用记录子弹窗（多次码）
const inviteUsesVisible = ref(false)
const inviteUsesLoading = ref(false)
const inviteUses = ref<InviteCodeUse[]>([])

/** status 仍 unused 但已到期 → 展示为 expired（与后端筛选口径一致） */
function inviteDisplayStatus(row: AdminInviteCode): string {
  if (row.status === 'unused' && row.expired) return 'expired'
  return row.status
}
function inviteStatusType(row: AdminInviteCode) {
  return ({ unused: 'success', used: 'info', revoked: 'danger', expired: 'info' } as Record<string, string>)[inviteDisplayStatus(row)] || 'info'
}
function inviteStatusLabelKey(row: AdminInviteCode) {
  const s = inviteDisplayStatus(row)
  return `invite.status${s[0].toUpperCase()}${s.slice(1)}`
}

async function openInviteCodes() {
  inviteVisible.value = true
  invitePage.value = 1
  await loadInviteCodes()
}

async function loadInviteCodes() {
  inviteLoading.value = true
  try {
    const res = await adminApi.getInviteCodes({
      status: inviteStatusFilter.value === 'all' ? undefined : inviteStatusFilter.value,
      q: inviteQuery.value.trim() || undefined,
      page: invitePage.value,
      pageSize: invitePageSize
    })
    inviteCodes.value = res.codes || []
    inviteTotal.value = res.total || 0
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    inviteLoading.value = false
  }
}

/** 筛选（状态/搜索）任一变更：回第 1 页重拉 */
function onInviteFilterChange() {
  invitePage.value = 1
  loadInviteCodes()
}

async function generateInviteCodes() {
  if (!inviteCount.value || inviteCount.value < 1 || inviteCount.value > 50) {
    return ElMessage.warning(t('invite.countHint'))
  }
  if (!inviteValidDays.value || inviteValidDays.value < 1 || inviteValidDays.value > 30) {
    return ElMessage.warning(t('invite.validDaysHint'))
  }
  if (!inviteMaxUses.value || inviteMaxUses.value < 1 || inviteMaxUses.value > 100) {
    return ElMessage.warning(t('invite.maxUsesHint'))
  }
  inviteGenerating.value = true
  try {
    const res = await adminApi.generateInviteCodes({
      count: inviteCount.value,
      validDays: inviteValidDays.value,
      maxUses: inviteMaxUses.value
    })
    ElMessage.success(t('invite.generated', { count: res.codes.length }))
    await loadInviteCodes()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    inviteGenerating.value = false
  }
}

/** 打开多次码使用记录子弹窗（倒序，最近在前） */
async function openInviteUses(row: AdminInviteCode) {
  inviteUses.value = []
  inviteUsesVisible.value = true
  inviteUsesLoading.value = true
  try {
    const res = await adminApi.getInviteCodeUses(row.id)
    inviteUses.value = res.uses || []
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    inviteUsesLoading.value = false
  }
}

async function copyInviteCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success(t('invite.copied'))
  } catch { /* 剪贴板受限时静默（非关键路径） */ }
}

async function revokeInviteCode(row: AdminInviteCode) {
  try {
    await ElMessageBox.confirm(
      t('invite.revokeConfirm', { code: row.code }),
      t('invite.revoke'),
      { type: 'warning', confirmButtonText: t('invite.revoke'), cancelButtonText: t('common.cancel') }
    )
  } catch { /* 取消 */ return }
  try {
    await adminApi.revokeInviteCode(row.id)
    ElMessage.success(t('invite.revoked'))
    await loadInviteCodes()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

// ─── 登录留痕批（v72）：列表相对时间展示（完整时间+IP 在详情抽屉） ───
function relativeLastLogin(row: AdminArtistItem): string {
  if (!row.last_login_at) return t('admin.lastLogin.never')
  const diff = Date.now() - new Date(row.last_login_at).getTime()
  if (Number.isNaN(diff) || diff < 0) return t('admin.lastLogin.never')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t('admin.lastLogin.justNow')
  if (minutes < 60) return t('admin.lastLogin.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('admin.lastLogin.hoursAgo', { n: hours })
  return t('admin.lastLogin.daysAgo', { n: Math.floor(hours / 24) })
}

/** 悬浮提示：完整本地时间 + IP（与抽屉同口径） */
function lastLoginTooltip(row: AdminArtistItem): string {
  if (!row.last_login_at) return ''
  const parts = [formatDateTime(row.last_login_at)]
  if (row.last_login_ip) parts.push(`IP ${row.last_login_ip}`)
  return parts.join(' · ')
}

// 画师详情抽屉
const detailVisible = ref(false)
const detailArtist = ref<AdminArtistItem | null>(null)
function openDetail(row: AdminArtistItem) {
  detailArtist.value = row
  detailVisible.value = true
}

const statusType = (s: string) => ARTIST_STATUS_TYPE[s] || 'info'

// 订单弹窗
const ordersVisible = ref(false)
const ordersLoading = ref(false)
const ordersArtist = ref<AdminArtistItem | null>(null)
const orders = ref<AdminOrderItem[]>([])
const ordersFailed = ref(false)
const ordersPage = ref(1)
/** b3 清扫：订单弹窗客户端分页（全量已拉取，仅限制 DOM 渲染量） */
const ORDERS_PAGE_SIZE = 10
const pagedOrders = computed(() =>
  orders.value.slice((ordersPage.value - 1) * ORDERS_PAGE_SIZE, ordersPage.value * ORDERS_PAGE_SIZE)
)
// P1-B：请求序号门闩——先发请求晚到不覆盖后发结果（张冠李戴防护）
const ordersReqSeq = ref(0)

// 更换管理员（REQ-027: 双 TOTP 动态码）
const transferVisible = ref(false)
const transferStep = ref(1)
const currentAdminQq = ref('')
const currentCode = ref('')
const newQq = ref('')
const newCode = ref('')
const transferring = ref(false)

async function loadArtists() {
  loading.value = true
  try {
    artists.value = await adminApi.getArtists()
    const admin = artists.value.find(a => a.isAdmin)
    if (admin) currentAdminQq.value = admin.qq_number
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function addArtist() {
  if (!form.qqNumber || !form.name || !form.subdomain) {
    return ElMessage.warning(t('admin.requiredFields'))
  }
  saving.value = true
  try {
    await adminApi.createArtist({
      qqNumber: form.qqNumber.trim(),
      name: form.name.trim(),
      subdomain: form.subdomain.trim().toLowerCase(),
      bio: form.bio.trim(),
      artistCode: form.artistCode.trim() || undefined
    })
    ElMessage.success(t('admin.added'))
    dialogVisible.value = false
    Object.assign(form, { qqNumber: '', name: '', subdomain: '', bio: '', artistCode: '' })
    await loadArtists()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

async function remove(row: AdminArtistItem) {
  try {
    await ElMessageBox.confirm(
      t('admin.confirmRemove', { name: row.name }),
      t('admin.confirmRemoveTitle'), { type: 'error', confirmButtonText: t('admin.confirmRemoveBtn') }
    )
  } catch {
    return // 用户取消，非错误
  }
  // P0 修复（前端质量战役审计）：API 失败不再被取消分支吞掉，删除失败必有反馈
  try {
    await adminApi.deleteArtist(row.id)
    ElMessage.success(t('common.removed'))
    await loadArtists()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function changeStatus(row: AdminArtistItem, status: string | number | boolean) {
  if (statusUpdatingId.value === row.id) return
  statusUpdatingId.value = row.id
  try {
    await adminApi.updateArtistStatus(row.id, status as ArtistStatus)
    ElMessage.success(t('admin.statusUpdated'))
  } catch (err) {
    ElMessage.error((err as Error).message)
    await loadArtists()
  } finally {
    statusUpdatingId.value = null
  }
}

function viewOrders(row: AdminArtistItem) {
  ordersArtist.value = row
  orders.value = []
  ordersPage.value = 1
  ordersFailed.value = false
  ordersVisible.value = true
  loadOrders(row.id)
}

async function loadOrders(artistId: number) {
  ordersLoading.value = true
  const seq = ++ordersReqSeq.value
  try {
    const res = await adminApi.getArtistOrders(artistId)
    if (seq !== ordersReqSeq.value) return // 过期响应丢弃
    orders.value = (res.items ?? res) as AdminOrderItem[]
    if (ordersPage.value > 1 && pagedOrders.value.length === 0) ordersPage.value = 1
  } catch (err) {
    if (seq !== ordersReqSeq.value) return
    ordersFailed.value = true
    ElMessage.error((err as Error).message)
  } finally {
    if (seq === ordersReqSeq.value) ordersLoading.value = false
  }
}

function retryOrders() {
  if (!ordersArtist.value) return
  ordersFailed.value = false
  loadOrders(ordersArtist.value.id)
}

// ─── 更换管理员（REQ-027: 双 TOTP 动态码验证） ───

// ─── 回收站（从主页迁入：孤儿文件可恢复；REQ-022 F4 分页） ───
const recycleVisible = ref(false)
const recycleItems = ref<RecycleBinItem[]>([])
const recycleLoading = ref(false)
const emptying = ref(false)
const recyclePage = ref(1)
const recyclePageSize = 20
const recycleTotal = ref(0)

async function openRecycleBin() {
  recyclePage.value = 1
  recycleVisible.value = true
  await loadRecycleBin()
}

async function loadRecycleBin() {
  recycleLoading.value = true
  try {
    const res = await adminApi.getRecycleBin({ page: recyclePage.value, pageSize: recyclePageSize })
    recycleItems.value = res.items || []
    recycleTotal.value = res.total || 0
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    recycleLoading.value = false
  }
}

function formatSize(bytes: number | null | undefined) {
  // A7: 后端可能不返回体积（undefined/null）——占位短横线，避免 NaN MB
  if (bytes === undefined || bytes === null || !Number.isFinite(Number(bytes))) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function handleEmptyRecycleBin() {
  try {
    await ElMessageBox.confirm(
      t('admin.recycleBin.emptyConfirm'),
      t('admin.recycleBin.emptyTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  emptying.value = true
  try {
    const res = await adminApi.emptyRecycleBin()
    ElMessage.success(t('admin.recycleBin.emptied', { n: res.deleted }))
    // REQ-022 F4: 清空后回到第 1 页并刷新
    recyclePage.value = 1
    await loadRecycleBin()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    emptying.value = false
  }
}

// ─── 0817：已移除画师（软删兜底：清单可见+可恢复） ───
const deletedVisible = ref(false)
const deletedItems = ref<DeletedArtistItem[]>([])
const deletedLoading = ref(false)
/** 恢复在途锁（单飞：一次只恢复一个，防并发双击） */
const restoringId = ref<number | null>(null)

async function openDeletedArtists() {
  deletedVisible.value = true
  await loadDeletedArtists()
}

async function loadDeletedArtists() {
  deletedLoading.value = true
  try {
    deletedItems.value = await adminApi.getDeletedArtists()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    deletedLoading.value = false
  }
}

async function restoreDeletedArtist(row: DeletedArtistItem) {
  try {
    await ElMessageBox.confirm(
      t('admin.deletedArtists.restoreConfirm', { name: row.name }),
      t('admin.deletedArtists.title'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  restoringId.value = row.id
  try {
    await adminApi.restoreArtist(row.id)
    ElMessage.success(t('admin.deletedArtists.restored'))
    await loadDeletedArtists()
    await loadArtists() // 回到在册 → 主列表同步刷新
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    restoringId.value = null
  }
}
function openTransfer() {
  transferStep.value = 1
  currentCode.value = ''
  newQq.value = ''
  newCode.value = ''
  transferVisible.value = true
}

// REQ-041 集成接线：动作级再验对话框状态（仅更换管理员提交链路使用，与 AdminLayout 入口级守卫互不干扰）
const actionStepUpVisible = ref(false)
// 815-b3-ban：被 STEP_UP_REQUIRED 拦下的动作重试队列（更换管理员走 confirmTransfer 自身重试，此处仅封禁/解封使用）
let pendingStepUpAction: (() => void) | null = null

async function confirmTransfer() {
  transferring.value = true
  try {
    const res = await adminApi.transferAdmin({
      newQq: newQq.value.trim(),
      currentCode: currentCode.value.trim(),
      newCode: newCode.value.trim()
    })
    ElMessage.success(t('admin.transferSuccess', { name: res.newAdminName }))
    transferVisible.value = false
    await loadArtists()
  } catch (err) {
    // 动作级再验：刚验证过（≤60s）才放行；否则弹 StepUpDialog，验证通过后自动重提交
    if ((err as ApiError)?.code === 'STEP_UP_REQUIRED') {
      actionStepUpVisible.value = true
      return
    }
    ElMessage.error((err as Error).message)
  } finally {
    transferring.value = false
  }
}

/** 动作级验证通过：admin_verified_at 刚刷新；优先重提交被拦下的封禁/解封，否则自动重提交更换管理员 */
function onActionStepUpVerified() {
  actionStepUpVisible.value = false
  const retry = pendingStepUpAction
  pendingStepUpAction = null
  if (retry) retry()
  else confirmTransfer()
}

/** 取消验证：关闭对话框并释放挂起的封禁/解封重试 */
function onActionStepUpCancel() {
  actionStepUpVisible.value = false
  pendingStepUpAction = null
  if (banUpdatingId.value != null) banUpdatingId.value = null
}

/** 可选原因输入（与举报管理页同款 prompt；取消=中止，空值=不带原因直接操作） */
async function askReason(title: string, message: string) {
  try {
    const { value } = await ElMessageBox.prompt(message, title, {
      inputPlaceholder: t('compliance.admin.reasonPlaceholder'),
      inputValidator: () => true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      inputValue: ''
    })
    return { cancelled: false, reason: (value || '').trim() || null }
  } catch {
    return { cancelled: true, reason: null }
  }
}

/** 封禁画师（与解封对称的两步确认：填原因 → 必要时 StepUpDialog 升级 → 调接口；禁止单步直接封禁） */
async function banArtist(row: AdminArtistItem) {
  if (banUpdatingId.value != null) return
  banUpdatingId.value = row.id
  const { cancelled, reason } = await askReason(
    t('compliance.admin.ban'),
    t('compliance.admin.banConfirm')
  )
  if (!cancelled) {
    await submitBan(Number(row.id), reason)
    return
  }
  banUpdatingId.value = null
}

/** 封禁提交（遇 STEP_UP_REQUIRED → 弹 StepUpDialog，验证通过后由 pendingStepUpAction 自动重提交） */
async function submitBan(artistId: number, reason: string | null) {
  try {
    await complianceApi.banArtist(artistId, reason)
    ElMessage.success(t('compliance.admin.bannedToast'))
    await loadArtists()
    banUpdatingId.value = null
  } catch (err) {
    if ((err as ApiError)?.code === 'STEP_UP_REQUIRED') {
      pendingStepUpAction = () => submitBan(artistId, reason)
      actionStepUpVisible.value = true
      return // 保持行级 loading，验证通过后自动重提交
    }
    ElMessage.error((err as Error).message)
    banUpdatingId.value = null
  }
}

/** 解封画师（与封禁对称的两步确认：填原因 → 必要时 StepUpDialog 升级 → 调接口） */
async function unbanArtist(row: AdminArtistItem) {
  if (banUpdatingId.value != null) return
  banUpdatingId.value = row.id
  const { cancelled, reason } = await askReason(
    t('compliance.admin.unban'),
    t('compliance.admin.unbanConfirm')
  )
  if (!cancelled) {
    await submitUnban(Number(row.id), reason)
    return
  }
  banUpdatingId.value = null
}

/** 解封提交（遇 STEP_UP_REQUIRED → 弹 StepUpDialog，验证通过后由 pendingStepUpAction 自动重提交） */
async function submitUnban(artistId: number, reason: string | null) {
  try {
    await complianceApi.unbanArtist(artistId, reason)
    ElMessage.success(t('compliance.admin.unbannedToast'))
    await loadArtists()
    banUpdatingId.value = null
  } catch (err) {
    if ((err as ApiError)?.code === 'STEP_UP_REQUIRED') {
      pendingStepUpAction = () => submitUnban(artistId, reason)
      actionStepUpVisible.value = true
      return // 保持行级 loading，验证通过后自动重提交
    }
    ElMessage.error((err as Error).message)
    banUpdatingId.value = null
  }
}

// ─── TOTP 绑定/重置（REQ-027 R2/R5） ───
const totpVisible = ref(false)
const totpArtist = ref<AdminArtistItem | null>(null)
const totpQr = ref('')
const totpCode = ref('')
const totpLoading = ref(false)

async function openTotpBind(row: AdminArtistItem) {
  totpArtist.value = row
  totpCode.value = ''
  totpQr.value = ''
  totpVisible.value = true
  await genTotpQr()
}

/** 生成/重新生成绑定二维码（覆盖旧密钥，旧 App 绑定立即失效） */
async function genTotpQr() {
  if (!totpArtist.value) return
  totpLoading.value = true
  try {
    const res = await adminApi.totpBindInit(totpArtist.value.id)
    totpQr.value = res.qrDataUrl
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    totpLoading.value = false
  }
}

/** 输入画师报的 6 位码，完成绑定 */
async function confirmTotpBind() {
  if (!totpCode.value.trim()) return
  totpLoading.value = true
  try {
    await adminApi.totpBindConfirm(totpArtist.value!.id, totpCode.value.trim())
    ElMessage.success(t('admin.totpBindSuccess'))
    totpVisible.value = false
    await loadArtists()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    totpLoading.value = false
  }
}

/** R5 恢复方案：重置绑定，旧密钥立即失效，画师须重新绑定才能登录 */
async function resetTotpBind() {
  if (!totpArtist.value) return
  try {
    await ElMessageBox.confirm(
      t('admin.totpResetConfirm', { name: totpArtist.value.name }),
      t('admin.confirmRemoveTitle'), { type: 'warning', confirmButtonText: t('admin.totpReset') }
    )
  } catch { return }
  totpLoading.value = true
  try {
    await adminApi.totpReset(totpArtist.value.id)
    ElMessage.success(t('admin.totpResetSuccess'))
    totpVisible.value = false
    await loadArtists()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    totpLoading.value = false
  }
}

onMounted(loadArtists)
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807） ═══ */
.admin-page { }

/* ─── 819-I：分组卡片 + 一行一事（对齐 QuickNote 基准） ─── */
.group {
  margin-bottom: var(--sp-4, 16px);
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}
.action-buttons { display: flex; justify-content: flex-end; gap: var(--sp-2, 8px); flex-wrap: wrap; }
/* 824 响应式巡逻：窄屏按钮行改左对齐，避免右对齐下参差换行显散 */
@container admin (max-width: 600px) {
  .action-buttons { justify-content: flex-start; }
}

.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.artist-filter-text { min-width: 0; }
.artist-filter-controls { display: flex; align-items: center; gap: var(--sp-2, 8px); flex-wrap: wrap; justify-content: flex-end; }
.artist-search-input { width: 280px; flex: none; }

.cell-name { font-weight: 600; color: var(--ink); }
.cell-tag { margin-left: var(--sp-1, 4px); }
.cell-code { font-size: 12px; color: var(--ink2); background: var(--paper2); padding: 4px 8px; border-radius: var(--r-s); }
.artist-filter-count { font-size: 12px; color: var(--ink3); }

/* 行操作按钮组（统一间距） */
.row-actions { display: flex; gap: var(--sp-1, 4px); flex-wrap: nowrap; }
/* 817-B2：封禁/解封/移除统一操作区分隔片（4px 宽，保持 4px 栅格） */
.row-action-divider { flex: none; width: 4px; }
/* 回收站分页 */
.pager { display: flex; justify-content: flex-end; margin-top: var(--sp-4, 16px); }

/* B7: 订单行展开——收款摘要 */
.order-expand-pay { padding: 8px 16px; }
.expand-pay-summary { display: flex; gap: 12px; font-size: 13px; color: var(--ink2); margin-bottom: 8px; flex-wrap: wrap; }
.expand-pay-summary strong { color: var(--ink); }
.expand-inst-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.expand-no-data { font-size: 12px; color: var(--ink3); margin: 4px 0; }
/* REQ-027: TOTP 绑定弹窗 + transfer 提示 */
.dialog-h4 { margin: 0 0 var(--sp-3, 12px); font-size: var(--fs-body, 14px); color: var(--ink); }
.totp-qr-wrap { display: flex; justify-content: center; margin: 12px 0 4px; }
.totp-qr { width: 200px; height: 200px; border: 1px solid var(--line); border-radius: var(--r-m); }
.totp-step { font-size: 13px; color: var(--ink); margin: 8px 0; }
.totp-hint { font-size: 12px; color: var(--ink2); margin-top: 8px; }
.transfer-hint { font-size: 12px; color: var(--ink2); margin: 0; }
/* ─── REQ-039: 邀请码弹窗（纸墨 token） ─── */
.invite-body { display: flex; flex-direction: column; gap: 12px; }
.invite-gen {
  padding: 12px 16px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
}
.invite-form { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.invite-form :deep(.el-form-item) { margin-bottom: 0; }
.invite-form-hint { display: block; font-size: 11px; color: var(--ink3); margin-top: 4px; }
.invite-form-action { margin-left: auto; }
.invite-hint { font-size: 12px; color: var(--ink2); margin: 8px 0 0; line-height: 1.6; }
.invite-filter { display: flex; align-items: center; gap: var(--sp-2, 8px); flex-wrap: wrap; }
.invite-search-input { width: 220px; flex: none; }
.invite-code {
  font-family: var(--f-mono, ui-monospace, monospace);
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--ink);
  background: var(--paper2);
  padding: 4px 8px;
  border-radius: var(--r-s);
}
.invite-copy { margin-left: 8px; }
.invite-unused { color: var(--ink3); }

/* P1-B：订单弹窗加载失败横幅（复用公告页 P0 同款模式） */
.orders-error { margin-bottom: var(--sp-3, 12px); }
.load-error-banner {
  padding: 12px 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--zs-t); color: var(--zs); border-radius: var(--r-m); font-size: 13px;
}

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .artist-filter-controls { justify-content: flex-start; }
  .artist-search-input { width: 100%; }
  .invite-search-input { width: 100%; }
}
</style>
