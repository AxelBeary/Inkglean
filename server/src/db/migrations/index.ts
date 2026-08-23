/**
 * 版本化迁移列表
 * 每个迁移有唯一 version 号，按顺序执行，已执行的自动跳过
 */
import type { Migration } from './types.js'
import { migration as v01 } from './v01-add-artist-code.js'
import { migration as v02 } from './v02-add-contact-qq.js'
import { migration as v03 } from './v03-completed-at-price-snapshot.js'
import { migration as v04 } from './v04-add-token-version.js'
import { migration as v05 } from './v05-workflow-stages-default-template.js'
import { migration as v06 } from './v06-greeting-templates.js'
import { migration as v07 } from './v07-add-deleted-at.js'
import { migration as v08 } from './v08-template-id-page-config.js'
import { migration as v09 } from './v09-price-calculator.js'
import { migration as v10 } from './v10-add-palette-id.js'
import { migration as v11 } from './v11-order-quote-focus-artist-prefs.js'
import { migration as v12 } from './v12-order-gallery-links-note-image.js'
import { migration as v13 } from './v13-login-codes-expires-at-integer.js'
import { migration as v14 } from './v14-orders-current-stage-id.js'
import { migration as v15 } from './v15-accent-color-deadline.js'
import { migration as v16 } from './v16-order-template-id.js'
import { migration as v17 } from './v17-platform-urls-inspiration-tags.js'
import { migration as v18 } from './v18-order-extra-items.js'
import { migration as v19 } from './v19-batch-buffer-system.js'
import { migration as v20 } from './v20-stage-speech-template.js'
import { migration as v21 } from './v21-announcement-like-count.js'
import { migration as v22 } from './v22-guestbook-messages.js'
import { migration as v23 } from './v23-artist-monthly-quota.js'
import { migration as v24 } from './v24-quota-pool-paid-total.js'
import { migration as v25 } from './v25-tier-visibility.js'
import { migration as v26 } from './v26-quick-actions.js'
import { migration as v27 } from './v27-artwork-is-cover.js'
import { migration as v28 } from './v28-stage-random-template.js'
import { migration as v29 } from './v29-order-start-date.js'
import { migration as v30 } from './v30-artwork-dimensions.js'
import { migration as v31 } from './v31-artwork-cover-order.js'
import { migration as v32 } from './v32-discount-codes.js'
import { migration as v33 } from './v33-installment-paid-cents.js'
import { migration as v34 } from './v34-guestbook-language.js'
import { migration as v35 } from './v35-order-activity-logs.js'
import { migration as v36 } from './v36-multi-style-model.js'
import { migration as v37 } from './v37-style-unify-sizes-artwork-tags-f5.js'
import { migration as v38 } from './v38-artists-status-check-add-hidden.js'
import { migration as v39 } from './v39-order-price-entries.js'
import { migration as v40 } from './v40-installments-locked-columns.js'
import { migration as v41 } from './v41-totp-login.js'
import { migration as v42 } from './v42-social-platforms.js'
import { migration as v43 } from './v43-drop-addon-tables.js'
import { migration as v44 } from './v44-tracking-events-anon-tokens.js'
import { migration as v45 } from './v45-tracking-events-artist-index.js'
import { migration as v46 } from './v46-client-profiles.js'
import { migration as v47 } from './v47-standalone-incomes.js'
import { migration as v48 } from './v48-totp-used-codes.js'
import { migration as v49 } from './v49-req036-backend-core.js'
import { migration as v50 } from './v50-price-model-unify-spec-price-2.js'
import { migration as v51 } from './v51-style-addons-snapshot-cleanup.js'
import { migration as v52 } from './v52-retire-installment-paid-columns.js'
import { migration as v53 } from './v53-orders-version-optimistic-lock.js'
import { migration as v54 } from './v54-idempotency-keys.js'
import { migration as v55 } from './v55-reference-uploads-ownership.js'
import { migration as v56 } from './v56-webauthn-credentials.js'
import { migration as v57 } from './v57-totp-rebound-at.js'
import { migration as v58 } from './v58-invite-codes.js'
import { migration as v59 } from './v59-compliance.js'
import { migration as v60 } from './v60-onboarding.js'
import { migration as v61 } from './v61-dashboard-visual-prep.js'
import { migration as v62 } from './v62-artworks-source-deliverable-id.js'
import { migration as v63 } from './v63-orders-customer-token.js'
import { migration as v64 } from './v64-greeting-special-days.js'
import { migration as v65 } from './v65-cancel-undo-windows.js'
import { migration as v66 } from './v66-deliverables-one-time-download.js'
import { migration as v67 } from './v67-greeting-slot-rework.js'
import { migration as v68 } from './v68-artists-guestbook-enabled.js'
import { migration as v69 } from './v69-artists-calendar-feed.js'
import { migration as v70 } from './v70-artists-dashboard-prefs.js'
import { migration as v71 } from './v71-invite-codes-multi-use.js'
import { migration as v72 } from './v72-artists-last-login-ip.js'

export const MIGRATIONS: Migration[] = [
  v01, v02, v03, v04, v05, v06, v07, v08, v09, v10,
  v11, v12, v13, v14, v15, v16, v17, v18, v19, v20,
  v21, v22, v23, v24, v25, v26, v27, v28, v29, v30,
  v31, v32, v33, v34, v35, v36, v37, v38, v39, v40,
  v41, v42, v43, v44, v45, v46, v47, v48, v49, v50,
  v51, v52, v53, v54, v55,
  v56,
  v57,
  v58,
  v59,
  v60,
  v61,
  v62,
  v63,
  v64,
  v65,
  v66,
  v67,
  v68,
  v69,
  v70,
  v71,
  v72,
]

// 升序唯一性断言（构建期简单校验）：version 必须严格递增，重复/乱序直接抛错
for (let i = 1; i < MIGRATIONS.length; i++) {
  if (MIGRATIONS[i].version <= MIGRATIONS[i - 1].version) {
    throw new Error(
      `MIGRATIONS 顺序错误：v${MIGRATIONS[i].version}（${MIGRATIONS[i].name}）出现在 v${MIGRATIONS[i - 1].version}（${MIGRATIONS[i - 1].name}）之后，要求严格升序且唯一`
    )
  }
}

