export default {
  errors: {
    // Auth
    NOT_LOGGED_IN: 'Not logged in',
    SESSION_EXPIRED: 'Session expired, please log in again',
    ACCOUNT_NOT_FOUND: 'Artist account not found',
    ACCOUNT_DISABLED: 'Account has been disabled',
    TOKEN_REVOKED: 'Session invalidated, please log in again',
    ADMIN_REQUIRED: 'Admin privileges required',
    CODE_INVALID: 'Invalid login code',
    CODE_EXPIRED: 'Login code expired',
    CODE_TOO_MANY_ATTEMPTS: 'Too many attempts, please request a new code',
    QQ_NOT_REGISTERED: 'This QQ number is not registered as an artist',

    // Artist
    ARTIST_NOT_FOUND: 'Artist not found',
    NAME_EMPTY: 'Name cannot be empty',
    CODE_FORMAT: 'Artist code must be 2-10 uppercase letters/digits',
    CODE_TAKEN: 'Artist code already taken',
    INVALID_STATUS: 'Invalid homepage status',
    INVALID_URL: 'URL must start with http:// or https://',
    SUBDOMAIN_FORMAT: 'Subdomain must be 2-20 lowercase letters/digits/hyphens',

    // Workflow
    STAGE_NOT_FOUND: 'Stage not found',
    STAGE_NAME_EMPTY: 'Stage name cannot be empty',
    FINAL_CANNOT_DISABLE: 'Cannot disable payment on final stage',
    FINAL_CANNOT_DELETE: 'Cannot delete final payment stage',
    TRACK_ALREADY_ON: 'Please refresh the page — tracking is already enabled for this order',
    NO_WORKFLOW_TEMPLATE: 'Please create a workflow template first (at least 1 stage)',
    FINAL_READONLY: 'Cannot modify final payment ratio directly',
    MAX_INSTALLMENTS: 'Maximum 20 installments',
    FINAL_TOO_LOW: 'Final payment ratio too low to add new payment stage',
    MIN_STAGES: 'At least 1 stage required',
    REORDER_LENGTH: 'Reorder array length mismatch',
    REORDER_INVALID: 'Reorder array contains invalid stage',
    REORDER_DUPLICATE: 'Reorder array has duplicates',
    NO_FINAL: 'No final payment stage',
    NOT_PAYMENT_STAGE: 'Not a payment stage',
    BP_TOO_LOW: 'Ratio cannot be below 5%',
    BP_TOO_HIGH: 'Ratio too high, final payment must be at least 5%',
    NO_PAYMENT_NODE: 'At least 1 payment stage required',
    SUM_NOT_100: 'Ratios must sum to 100%',
    STAGES_RESET_BLOCKED: '{count} order(s) are in progress. Complete them or turn off workflow tracking before resetting.',

    // Order
    ORDER_NOT_FOUND: 'Order not found',
    ORDER_INVALID_STATUS: 'Invalid status',
    INVALID_TRANSITION: 'Invalid status transition',
    DELIVER_WRONG_STATUS: 'Cannot upload deliverable in current status',
    TIER_NOT_FOUND: 'Price tier not found or does not belong to this artist',
    ILLEGAL_PATH: 'Illegal path',
    MISSING_FILE: 'Missing file path',
    QUEUE_EMPTY: 'Reorder list cannot be empty',
    QUEUE_NOT_OWNED: 'Order does not belong to current queue',
    QUEUE_LENGTH: 'Reorder list length mismatch',
    QUEUE_DUPLICATE: 'Reorder list has duplicate orders',
    INVALID_PRIORITY: 'Invalid priority',

    // Note deletion (v0.15 R46)
    NOTE_NOT_FOUND: 'Note not found',
    SYSTEM_NOTE_PROTECTED: 'System notes cannot be deleted',

    // Accent color (v0.15 R49)
    INVALID_ACCENT_COLOR: 'Invalid accent color',

    // Deadline (v0.15 R51)
    INVALID_DEADLINE: 'Invalid deadline format (must be ISO 8601)',
    INVALID_START_DATE: 'Start date cannot be later than deadline',
    INVALID_ANNOUNCEMENT_DATE: 'Announcement expiry cannot be earlier than today',

    // Upload
    ILLEGAL_FILE_TYPE: 'Illegal file type',
    UNSUPPORTED_FORMAT: 'Unsupported file format',

    // Admin
    ADMIN_VERIFY_FAILED: 'Admin verification failed',

    // General
    NOT_FOUND: 'Resource not found',
    VALIDATION: 'Invalid request parameters',
    INTERNAL: 'Internal server error',
    UNKNOWN: 'Request error',

    // Discount codes (v0.31 F3)
    DISCOUNT_DISABLED: 'This artist has not enabled discount codes',
    DISCOUNT_CODE_INVALID: 'Invalid discount code',
    DISCOUNT_CODE_EXPIRED: 'This discount code has expired',
    DISCOUNT_CODE_EXHAUSTED: 'This discount code has reached its usage limit',
    DISCOUNT_CODE_NOT_FOUND: 'Discount code not found',
    DISCOUNT_CODE_TAKEN: 'Discount code already taken',

    // Artist (supplement)
    QQ_TAKEN: 'This QQ number is already registered',
    SUBDOMAIN_TAKEN: 'This subdomain is already taken',

    // General (supplement)
    RATE_LIMITED: 'Too many requests, please try again later',
    MISSING_PARAMS: 'Missing required parameters',

    // Input validation (supplement)
    QQ_REQUIRED: 'Please enter your QQ number',
    QQ_FORMAT: 'Invalid QQ format (5-15 digits)',
    MISSING_CREDENTIALS: 'Please enter QQ number and login code',

    // Order input (supplement)
    ARTIST_NOT_OPEN: 'This artist is not accepting new commissions',
    RULES_NOT_AGREED: 'Please read and agree to the commission rules first',
    STATUS_REQUIRED: 'Please specify a status',
    NOTE_EMPTY: 'Note content cannot be empty',
    ORDER_INVALID_ID: 'Invalid order ID',

    // Addons (supplement)
    ADDON_NOT_FOUND: 'Addon not found',
    ADDON_NAME_EMPTY: 'Addon name cannot be empty',
    ADDON_INVALID_PRICE: 'Invalid addon price',
    ADDON_INVALID_MODE: 'Invalid selection mode',
    ADDON_MAX_QTY: 'Maximum quantity exceeded',
    ADDON_NOT_FOR_TIER: 'This addon does not apply to the selected tier',

    // Multipliers (supplement)
    MULTIPLIER_NOT_FOUND: 'Multiplier not found',
    MULTIPLIER_INVALID: 'Invalid multiplier value (must be >= 1.0)',

    // Pricing (supplement)
    PRICING_TIER_REQUIRED: 'Please select a base tier first',
    PRICING_CALC_FAILED: 'Price calculation failed',
    INVALID_PRICE: 'Invalid price (must be a positive integer in cents, max 99999999)',

    // Focus image (supplement)
    FOCUS_IMAGE_NOT_FOUND: 'Reference image not found',
    FOCUS_IMAGE_NOT_OWNED: 'This reference image does not belong to this order',
    INVALID_FOCUS_MODE: 'Invalid focus image mode (options: off/small/large)',

    // Custom links (supplement)
    LINKS_TOO_MANY: 'Cannot have more than 6 custom links',
    LINK_URL_INVALID: 'Invalid link format (must start with http:// or https://)',

    // Gallery (supplement)
    REFERENCES_LIMIT: 'Cannot have more than 20 reference images',
    REFERENCE_DUPLICATE: 'This image is already in the gallery',
    NOTE_IMAGE_PATH_INVALID: 'Invalid note image path',

    // Order page template (supplement)
    INVALID_ORDER_TEMPLATE: 'Invalid order page template',

    // Platform links (supplement)
    PLATFORM_URLS_TOO_MANY: 'Cannot have more than 10 platform links',
    PLATFORM_URL_INVALID: 'Invalid platform link format (must start with http:// or https://)',

    // Inspiration tags (supplement)
    TAGS_TOO_MANY: 'Cannot have more than 20 inspiration tags',

    // Extra items (supplement)
    EXTRA_ITEM_LIMIT: 'Cannot have more than 20 extra items',
    ORDER_FINAL_STATE: 'Delivered or cancelled orders cannot have extra items added',

    // Slots & buffer (supplement)
    BATCH_FULL: 'This artist is fully booked and cannot accept new orders',
    INVALID_BATCH_LIMIT: 'Invalid slot settings (formal + buffer must be at least 1)',
    NOT_BUFFER_ORDER: 'This order is not in the buffer zone',

    // Workflow (supplement)
    STAGE_IN_USE: 'This stage has orders in progress. Complete or move them before deleting.',

    // Artworks (supplement)
    ARTWORK_NOT_FOUND: 'Artwork not found',
    COVER_LIMIT_REACHED: 'Maximum 6 covers, please unset some first',

    // Tier visibility (supplement)
    TIER_NOT_AVAILABLE: 'This tier is not available for ordering',

    // Multi-style (supplement, v0.32 REQ-023)
    STYLE_NOT_FOUND: 'Art style not found',
    STYLE_NAME_EMPTY: 'Art style name cannot be empty',
    STYLE_SIZE_NOT_FOUND: 'Size not found',
    STYLE_SIZE_NAME_EMPTY: 'Size name cannot be empty',
    STYLE_SIZE_INVALID_PRICE: 'Invalid size price',
    ADDON_TEMPLATE_NOT_FOUND: 'Addon template not found',
    ADDON_TEMPLATE_NAME_EMPTY: 'Addon template name cannot be empty',
    ADDON_TEMPLATE_INVALID_PRICE: 'Invalid addon template price',
    ADDON_TEMPLATE_INVALID_CONTROL: 'Invalid control type',
    ADDON_TEMPLATE_INVALID_PRICING: 'Invalid pricing mode',
    STYLE_ADDON_NOT_FOUND: 'Style addon not found',
    STYLE_ADDON_DUPLICATE: 'This addon is already imported into this style',
    SIZE_OVERRIDE_NOT_FOUND: 'Size override not found'
  },
  pref: {
    toLight: 'Switch to light mode', toDark: 'Switch to dark mode', theme: 'Theme', base: 'Base', accent: 'Accent', auto: 'Auto', light: 'Light', dark: 'Dark',
    // Accent swatch names (polish batch A: proper color names, not literal one-word translations)
    accentNames: { teal: 'Teal', turquoise: 'Turquoise', blue: 'Blue', indigo: 'Indigo', violet: 'Violet' },
    // v0.38: artist back-office paper/ink dual themes (REQ-026 §1.2)
    artistToInk: 'Switch to ink theme', artistToPaper: 'Switch to paper theme',
    artistToastInk: 'Switched · Ink', artistToastPaper: 'Switched · Paper'
  },
  common: {
    status: { open: 'Open for commissions', full: 'Fully booked', break: 'On break', hidden: 'Hidden', unknown: 'Unknown' },
    statusShort: { open: 'Open', full: 'Full', break: 'Break', hidden: 'Hidden' },
    priority: { high: 'High', medium: 'Med', low: 'Low' },
    orderStatus: {
      pending: 'Pending', confirmed: 'Confirmed', wip: 'In progress', revision: 'Revising',
      done: 'Done', delivered: 'Delivered', cancelled: 'Cancelled', unknown: 'Unknown'
    },
    source: { self: 'Self', manual: 'Manual', clientSelf: 'Client self-order', manualEntry: 'Manual entry' },
    custom: 'Custom', none: 'None',
    save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', download: 'Download',
    confirm: 'Confirm', detail: 'Details', actions: 'Actions', remove: 'Remove', add: 'Add',
    saved: 'Saved', deleted: 'Deleted', removed: 'Removed',
    confirmDeleteTitle: 'Confirm deletion', uploadFailed: 'Upload failed', networkError: 'Network error, please try again later', globalError: 'Something went wrong. Please refresh and try again.',
    footer: 'HuiYue · Artist Commission Platform'
  },
  disclaimer: {
    title: 'Platform notice',
    text: 'This platform only verifies identities and connects both parties. All subsequent communication, payment and delivery happen externally. The platform provides no escrow or arbitration — please assume your own risk.'
  },
  // Plan B: deliver dialog modes (upload file / no-file delivery)
  deliverMode: {
    file: 'Upload deliverable',
    noFile: 'No-file delivery',
    noFileHint: 'This order needs no deliverable file (e.g. pure consultation, already delivered offline). Once confirmed, the order is marked "Delivered". This cannot be undone.',
    noFileConfirm: 'Confirm delivery with no file? The order will be set to "Delivered".'
  },
  upload: {
    pasteHint: 'Paste images with Ctrl+V',
    pasteNotImage: 'Only image files can be pasted',
    pasteTooMany: 'You can paste up to {max} images at a time',
    pasteTooBig: 'File "{name}" exceeds the {max}MB limit ({size}MB), please compress and try again',
    dragFromPage: 'Images on this page can\'t be dragged into the upload area (they\'re rendered copies, not the original files). Drag files from your file manager, or paste with Ctrl+V'
  },
  pageTitle: {
    home: 'Artist Commission Platform',
    artistHome: 'Artist Home',
    order: 'Commission',
    track: 'Track Order',
    delivery: 'Download',
    login: 'Artist Login',
    healthCheck: 'System Health',
    notFound: 'Page Not Found'
  },
  menu: {
    logo: 'HuiYue',
    // v0.38: sidebar brand seal character (REQ-026 §三.1 vermillion seal)
    logoSeal: '绘',
    dashboard: 'Dashboard', queue: 'Queue Board', orders: 'Orders',
    manualOrder: 'Manual Entry', tiers: 'Pricing', artworks: 'Portfolio',
    guestbook: 'Guestbook', slots: 'Slot Settings',
    preview: 'Preview Page',
    rules: 'Guidelines', settings: 'Page Settings', preferences: 'Preferences', admin: 'Admin', logout: 'Log out',
    collapse: 'Collapse sidebar', expand: 'Expand sidebar', openMenu: 'Open menu',
    langToEn: 'English', langToZh: 'Chinese', langAriaToEn: 'Switch to English', langAriaToZh: 'Switch to Chinese',
    // REQ-016 C: sidebar group titles
    groupWork: 'Work', groupBiz: 'Business', groupFront: 'Storefront'
  },
  // F3 quick actions (2026-08-07 user decision)
  quickAction: {
    rules: 'Edit Guidelines',
    share: 'Share Page',
    quickconfig: 'Quick Action Settings',
    status: 'Status',
    publish: 'Quick Publish',
    publishHint: 'Drag or paste to publish',
    uploading: 'Uploading…',
    published: 'Artwork published',
    publishFailed: 'Publish failed',
    notImage: 'Images only',
    copied: 'Page link copied',
    noSubdomain: 'No page domain set — go to settings'
  },
  landing: {
    title: 'Artist Commission Platform', subtitle: 'Find your favorite artist and start commissioning',
    noBio: 'This artist has not written a bio yet', weibo: 'Weibo', bilibili: 'Bilibili',
    noArtists: 'No artists have joined yet', loadFailed: 'Failed to load artist list',
  },
  // v0.34 task A: standalone 404 page
  notFound: {
    message: "The page you're looking for doesn't exist or has been moved.",
    backHome: 'Back to home',
    artistsTitle: 'Or visit one of our artists'
  },
  artistHome: {
    weibo: 'My Weibo', bilibili: 'My Bilibili', commission: 'Commission me', track: 'Track order',
    priceList: 'Price list', artworks: 'Portfolio', rules: 'Commission guidelines', workflow: 'Workflow & Payment',
    aboutDays: '~{n} days', loadFailed: 'Artist not found or failed to load', hidden: "This artist's page is currently unavailable",
    statusOpen: 'Open for commissions', statusFull: 'Fully booked', statusBreak: 'On break',
    about: 'About', navPricing: 'Pricing', navProcess: 'Process', navWork: 'Work', navRules: 'How to order', navGuestbook: 'Guestbook',
    heroOpen: 'Open for commissions', heroFull: 'Currently full', heroBreak: 'On break',
    startCommission: 'Start a commission →', trackOrder: 'Track order', howItWorks: 'How it works',
    ctaSubtitle: "Ready to work together? Let's create something amazing.",
    weiboPlain: 'Weibo', bilibiliPlain: 'Bilibili',
    otherLink: 'Link',
    revisionNote: 'Revision policy',
    // #9: tier showcase
    tierSelectBtn: 'Choose this tier', tierShowcase: 'Not accepting', tierShowcaseBtn: 'Not accepting orders',
    // R50: preview mode
    previewBanner: 'Preview mode — changes not yet saved',
    // v0.25 A: Cover showcase
    covers: 'Featured Covers',
    // v0.32 REQ-023 Phase3: multi-style price table
    styleOrderBtn: 'Commission in this style',
    // v0.34 task B: order hint after size selected
    styleSizeHint: '{size} selected · ¥{price} — click below to start with this choice'
  },
  orderForm: {
    backHome: 'Back to page', title: 'Commission me', tierLabel: 'Select tier', tierPlaceholder: 'Choose a commission type',
    workflowLabel: 'Workflow',
    descLabel: 'Description', descPlaceholder: 'Describe what you want: character features, pose, style, background, etc.',
    // D soft prompt (user decision: description can be skipped, only prompt once when empty, no hard block)
    descSoftTitle: 'Empty description', descSoftMsg: 'You have not described what you want. Continue anyway? (The artist may not fully understand your idea.)',
    descSoftContinue: 'Continue',
    refLabel: 'Reference images (optional, up to 5, ≤10MB each)', refExceed: 'Up to 5 reference images',
    refTip: 'The artist can add more references to the order gallery after you submit. Gallery total limit: 20 images.',
    pricingDetail: 'Price details',
    qqLabel: 'Your QQ number', qqPlaceholder: 'The artist will contact you via QQ',
    nameLabel: 'Nickname (optional)', namePlaceholder: 'What should we call you',
    notifyLabel: 'Notify me on QQ when my turn comes', agreeLabel: 'I have read and agree to the guidelines above',
    submit: 'Submit commission', successTitle: 'Commission submitted!', orderNoIs: 'Your order number is: ',
    addQqHint: 'Add the artist on QQ to discuss details — just quote your order number', viewProgress: 'Track progress',
    selectTier: 'Please select a tier', fillQq: 'Please enter your QQ number',
    fileTooBig: 'File "{name}" exceeds the 10MB limit ({size}MB). Please compress and re-upload',
    typeWarning: 'Converting to JPG or WebP is recommended for better previews, but the current format can still be uploaded.',
    loadFailed: 'Failed to load artist info',
    // R57: draft recovery
    draftTitle: 'Restore draft', draftFound: 'An unsent draft was found. Restore it?',
    draftRestore: 'Restore', draftDiscard: 'Discard', draftRestored: 'Draft restored',
    // R58-6: QQ jump + copy
    artistQqLabel: 'Artist QQ', jumpQq: 'Open QQ', copyQq: 'Copy QQ', qqCopied: 'QQ number copied',
    // R58-2: step-by-step guide
    step1: 'Tier', step2: 'Details', step3: 'Contact',
    step1Title: 'Pick a tier', step2Title: 'Describe your request', step3Title: 'Contact details',
    nextStep: 'Next', prevStep: 'Back',
    stepProgress: 'Step {cur} / {total}',
    summaryTitle: 'SUMMARY', summaryNoTier: 'Pick a tier to see the price here',
    // W3: empty-state hint when no size selected in style mode
    summaryNoSize: 'Pick a size to see the price here',
    // REQ-022 F3: client info echo in summary card
    summaryNickname: 'Nickname', summaryDescription: 'Request details',
    // R58-3: receipt confirmation
    receiptSub: '· COMMISSION SLIP ·', receiptTotal: 'Total', receiptConfirm: 'Confirm order', submitting: 'Submitting…',
    // R58-4: inspiration tags
    inspireHint: 'Not sure what to write? Tap a tag to fill it in:',
    // R58-5: copy order summary
    copySummary: 'Copy order info', summaryCopied: 'Order info copied', summaryOrderNo: 'Order No.: ',
    // v0.31 F3: discount code
    discountLabel: 'Discount code', discountPlaceholder: 'Have a code?', discountValidate: 'Apply',
    discountEstimate: 'Est. discount', discountedTotal: 'Est. total after discount',
    // v0.32 REQ-023 Phase2: multi-style three-step flow
    styleStep: 'Style', sizeStep: 'Size', addonStep: 'Add-ons',
    styleStepTitle: 'Pick a style', sizeStepTitle: 'Pick a size', addonStepTitle: 'Add-ons & options',
    addonStepEmpty: 'No add-ons available for this size',
    noSizeHint: 'This style has no sizes set — you can skip and continue',
    noSizeContinue: 'Skip sizes, continue',
    addonOptionPrice: 'Option price',
    multiplierLabel: 'Usage & rush', usageLabel: 'Usage:', rushLabel: 'Rush:',
    personal: 'Personal', noRush: 'No rush',
    // v0.35 F4: Entry A preselection banner (coming from the showcase with a choice)
    preselectedBoth: 'Pre-selected from your homepage choice: {style} · {size}',
    preselectedStyle: 'Style pre-selected: "{style}" — pick a size',
    preselectChange: 'Change'
  },
  // R24: validation popup
  order: {
    validation: {
      title: 'Please complete the following first',
      confirm: 'Got it',
      agreeRequired: 'Please tick "I have read and agree to the guidelines above"'
    }
  },
  track: {
    backHome: 'Back to page', title: 'Track order', inputPlaceholder: 'Leave blank if you forgot it', search: 'Search',
    orderNo: 'Order No.', orderNoLabel: 'Order number', qqLabel: 'Your QQ number', qqPlaceholder: 'The QQ you used when ordering',
    artist: 'Artist', type: 'Type', status: 'Status', position: 'Queue position',
    positionText: '#{pos} of {total}', orderTime: 'Order time',
    stepSubmitted: 'Submitted', stepConfirmed: 'Confirmed', stepWip: 'In progress', stepDone: 'Done', stepDelivered: 'Delivered',
    deliverables: 'Delivered files', otherOrder: 'Track another order', enterQq: 'Please enter your QQ number',
    // SPEC-003: price & payments
    priceTitle: 'Price breakdown', finalPrice: 'Final price', installmentsTitle: 'Payment schedule', paid: 'Paid', unpaid: 'Unpaid',
    // B7: quota-pool payment progress
    payPaid: 'Paid', payNext: 'Next Due', payRemaining: 'Outstanding', payTotal: 'Total',
    contactTitle: 'Forgot your order number?', contactDesc: 'Contact the admin or the artist with your QQ number to recover it.',
    contactArtist: 'Artist QQ', contactAdmin: 'Admin QQ', copyQq: 'Copy', copied: 'Copied',
    noOrdersTitle: 'No orders found', noOrdersDesc: 'This QQ number has no orders with this artist. Please double-check the number.',
    noOrdersCountdown: 'Closes in {n}s',
    // A1: my orders list
    myOrdersBtn: 'My orders', myOrdersTitle: 'My orders',
    myOrdersEmpty: 'No orders found for this QQ', myOrdersFailed: 'Failed to load orders, please retry',
    // U1: brief recap
    briefTitle: 'Your brief', briefRefAlt: 'Reference image',
    timeline: {
      title: 'Production progress',
      current: 'In progress',
      progress: '{name} {current}/{total}',
      revision: 'Sent back by the artist for revision — progress rolled back',
      revisionAt: 'Rolled back to “{name}”',
      notStarted: 'Order submitted — production starts once the artist confirms',
      orderedAt: 'Ordered: '
    }
  },
  // F4: guestbook (client-facing message wall, shared component TplGuestbook)
  guestbook: {
    title: 'Guestbook',
    empty: 'No messages yet — say something',
    nickname: 'Nickname', nicknamePlaceholder: 'What should we call you',
    content: 'Message', contentPlaceholder: 'Say something to the artist…',
    nicknameRequired: 'Please enter a nickname', contentRequired: 'Please enter your message',
    submit: 'Post',
    pendingHint: 'Submitted — visible once the artist approves',
    rateLimited: 'Posting too fast — please wait a moment',
    artistTag: 'Artist',
    loadMore: 'Load more',
    noMore: 'No more messages'
  },
  // #1: artist-side guestbook management page
  guestbookManage: {
    title: 'Guestbook Management',
    all: 'All',
    replyLabel: 'Artist reply',
    editReply: 'Edit reply',
    rejectConfirm: 'Reject this message? It will no longer appear on your public page.',
    // F8: language filter
    languageAll: 'All languages'
  },
  // v0.35 F6: client gallery filter + lightbox tags (shared component TplGallery)
  gallery: {
    filterAll: 'All',
    filterEmpty: 'No artworks tagged with this tier yet',
    filterEmptyAll: 'No artworks yet',
    tierTag: 'Tier',
    prev: 'Previous',
    next: 'Next'
  },
  delivery: {
    delivered: 'Artwork delivered', notDelivered: 'Artwork not yet delivered',
    orderInfo: 'Order: {no} | Artist: {artist}', download: 'Download', noFiles: 'No delivered files yet',
    downloadFailed: 'Download failed, please retry or contact the artist'
  },
  login: {
    title: 'Artist login', subtitle: 'Enter your QQ number and the 6-digit code from your authenticator app',
    qqPlaceholder: 'Enter your QQ number', codePlaceholder: 'Enter the 6-digit dynamic code', login: 'Log in',
    helpTitle: 'Need an authenticator app? See recommendations',
    helpDesc: 'The dynamic code is generated by an authenticator app on your phone, refreshed every 30 seconds:',
    helpTencent: 'No app? Search "Tencent Authenticator" mini-program in WeChat',
    helpAegis: 'Android: Aegis (open source, free, via CoolAPK)',
    help2fas: 'iOS: 2FAS (open source, free) or Microsoft Authenticator (App Store)',
    helpNotGoogle: 'Google Authenticator is not recommended (Google services unavailable in China)',
    enterQq: 'Please enter your QQ number', enterCode: 'Please enter the dynamic code', loginSuccess: 'Logged in!',
    logoAlt: 'HuiYue'
  },
  // P0-9: MultiplierManager i18n
  multiplier: {
    usageTitle: 'Usage Multiplier', usageHint: 'Highest applies when multiple are selected',
    rushTitle: 'Rush Multiplier', rushHint: 'Multiplies with the usage multiplier',
    edit: 'Edit', deleteConfirm: 'Delete this multiplier?',
    emptyUsage: 'No usage multipliers', emptyRush: 'No rush multipliers',
    addUsage: '+ Add Usage Multiplier', addRush: '+ Add Rush Multiplier',
    editTitle: 'Edit Multiplier', createTitle: 'New Multiplier',
    name: 'Name', namePlaceholder: 'e.g. Commercial use / Rush (within 3 days)',
    value: 'Multiplier Value', valueHint: '1.5 = price ×1.5 (+50%)',
    descLabel: 'Description (visible to clients)',
    cancel: 'Cancel', save: 'Save', create: 'Create',
    msgNameRequired: 'Please enter a name', msgUpdated: 'Updated', msgCreated: 'Created', msgDeleted: 'Deleted'
  },
  dashboard: {
    title: 'Dashboard', pendingNew: 'New pending', activeOrders: 'Active orders',
    monthRevenue: 'Revenue this month', totalCompleted: 'Total completed', quickActions: 'Quick actions',
    queueBoard: 'Queue Board', manualOrder: 'Manual Entry', allOrders: 'All Orders', settings: 'Settings',
    currentStatus: 'Current page status', statusUpdated: 'Status updated',
    statusOpen: 'Open', statusFull: 'Full', statusBreak: 'On break',
    anotherOne: 'Another',
    slotMorning: 'Morning', slotAfternoon: 'Afternoon', slotEvening: 'Evening', slotNight: 'Late night',
    defaultPanel: 'Default panel', panelQueue: 'Queue Board', panelOrders: 'Order List', panelManual: 'Manual Entry', panelTiers: 'Pricing',
    // F4: guestbook moderation
    guestbookTitle: 'Guestbook moderation', guestbookEmpty: 'No messages',
    guestbookPending: 'Pending', guestbookApproved: 'Approved', guestbookRejected: 'Rejected',
    guestbookApprove: 'Approve', guestbookReject: 'Reject', guestbookReply: 'Reply',
    guestbookReplyPlaceholder: 'Reply to this visitor (≤500 chars)', guestbookReplySave: 'Save reply',
    guestbookApprovedMsg: 'Message approved', guestbookRejectedMsg: 'Message rejected', guestbookRepliedMsg: 'Reply saved',
    // R52: today stats
    todayNewOrders: 'New orders today', todayRevenue: 'Revenue today',
    // R51: deadlines + today's todos
    deadlineCard: 'Due soon', noDeadlines: 'No deadlines coming up',
    todoCard: "Today's todos", noTodos: 'Nothing pending — enjoy your tea',
    daysLeft: '{n}d left', dueToday: 'Due today',
    // v0.18 dashboard rebuild
    revenueTitle: 'Revenue', periodMonth: 'Month', periodQuarter: 'Quarter', periodYear: 'Year',
    revenueOrderCount: '{n} completed', revenueVs: 'vs {label}', revenueError: 'Failed to load revenue data',
    retry: 'Retry',
    todoTitle: "What's next", todoError: 'Failed to load todo list', todoEmpty: 'Nothing pending — take a break',
    tag_overdue: 'Overdue', tag_dueToday: 'Due today', tag_pending: 'New', tag_revision: 'Revision', tag_inProgress: 'In progress',
    activityTitle: 'Recent activity', activityError: 'Failed to load activity', activityEmpty: 'No recent activity',
    timeJustNow: 'just now', timeMinutesAgo: '{n}m ago', timeHoursAgo: '{n}h ago', timeDaysAgo: '{n}d ago',
    slotTitle: 'Slot overview', slotFormal: 'Formal {used}/{total}', slotBuffer: 'Buffer {used}/{total}',
    slotNext: 'Next in buffer: {name} (QQ: {qq})',
    // #4: slot overview revamp
    slotCombined: '{used}/{total} filled', slotNotEnabled: 'Slot limit is off — set it up →', slotDisplayFallback: '—',
    artworks: 'Gallery', tiers: 'Tiers',
    // REQ-033: artist stats
    trackingTitle: 'My stats', trackingTotal: 'Total events',
    trackingNames: {
      dashboard_view: 'Dashboard views', queue_view: 'Queue views', orders_view: 'Order list views',
      manual_view: 'Manual entry', artworks_view: 'Artwork management', settings_view: 'Settings',
      tiers_view: 'Tiers', guestbook_view: 'Guestbook', preferences_view: 'Preferences',
      dashboard_quick_click: 'Quick actions', artist_action: 'Artist actions'
    }
  },
  queue: {
    title: 'Queue Board',
    hint: 'Drag cards to reorder. Order is saved immediately. Priority is a label only and does not affect sorting.',
    confirm: 'Confirm', startWip: 'Start work', done: '✔ Complete', deliver: 'Deliver', cancel: 'Cancel',
    empty: 'Queue is empty — no orders yet', orderUpdated: 'Order updated',
    // SPEC-004: buffer zone
    bufferTitle: 'Buffer zone (waitlist)', bufferHint: 'When formal slots are full, new orders wait here. Promoted orders move to the formal queue',
    bufferTag: 'Waitlist', bufferEmpty: 'No waitlist orders in the buffer zone',
    promote: 'Promote', promoted: 'Promoted to formal queue',
    slideToCancel: 'Slide to confirm cancellation', statusUpdated: 'Status updated',
    advanceStage: 'Advance to next stage', stageAdvanced: 'Advanced to next stage',
    // P0-3b: tab labels
    tabFormal: 'Formal', tabBuffer: 'Buffer',
    // REQ-013 #7: workflow done order delivery entry + completed zone
    goDeliver: 'Deliver',
    completedTitle: 'Recently delivered', completedHint: 'Delivered orders stay here for 7 days then hide automatically',
    completedEmpty: 'No recently delivered orders',
    dragHint: 'Drag to reorder',
    focusDisplay: 'Focus image', focusOff: 'Off', focusLarge: 'Large',
    uploadFocus: 'Upload focus image',
    // R53: focus image replacement
    dropToReplace: 'Drop to replace focus image',
    // SPEC-005: calendar view
    viewBoard: 'Board', viewCalendar: 'Calendar', viewTimeline: 'Timeline',
    calPrev: 'Previous month', calNext: 'Next month', calToday: 'Today',
    calTitle: '{y}-{m}',
    calMon: 'Mon', calTue: 'Tue', calWed: 'Wed', calThu: 'Thu', calFri: 'Fri', calSat: 'Sat', calSun: 'Sun',
    calNoDeadline: 'No deadline',
    calLegendFormal: 'Formal order', calLegendBuffer: 'Buffer', calLegendNoDeadline: 'No deadline', calLegendOverdue: 'Overdue', calLegendDone: 'Done',
    // v0.25 D: timeline view (v0.36 wave 1: four zoom levels 2w/1m/3m/6m, removed 2m)
    tlZoom2w: '2 weeks', tlZoom1m: '1 month', tlZoom3m: '3 months', tlZoom6m: '6 months',
    tlEmpty: 'No orders in the visible time range',
    // v0.28: timeline drag
    tlDragDeadline: 'Deadline {d}', tlDragStart: 'Start {d}',
    tlDragMove: '{s} → {e}',
    // v0.36 wave 1: drag undo toast copy (replaces old tlDragSaved)
    tlUndoDeadline: 'Deadline set to {d}', tlUndoStart: 'Start date set to {d}',
    tlUndoMove: 'Rescheduled {s} → {e}', tlUndo: 'Undo', tlUndone: 'Restored',
    tlDragDeadlineBeforeStart: 'Deadline cannot be earlier than start date',
    tlDragStartAfterDeadline: 'Start date cannot be later than deadline'
  },
  orderList: {
    title: 'Order Management', all: 'All',
    colOrderNo: 'Order No.', colType: 'Type', colQq: 'Client QQ', colName: 'Nickname',
    colPriority: 'Priority', colStatus: 'Status', colSource: 'Source', colTime: 'Order time', colActions: 'Actions',
    colImage: 'Image',
    // REQ-020 F1: order search
    searchPlaceholder: 'Search name / order no. / tier', noSearchResult: 'No matching orders'
  },
  orderDetail: {
    backToQueue: 'Back to queue', backToDashboard: 'Back to dashboard', backToList: 'Back to orders', orderNo: 'Order #',
    orderInfo: 'Order info', colOrderNo: 'Order No.', colType: 'Type', colQq: 'Client QQ', colName: 'Nickname',
    colPriority: 'Priority', colSource: 'Source', colTime: 'Order time', colDesc: 'Description',
    statusFlow: 'Status flow', confirmOrder: 'Accept order', startWip: 'Start work',
    needRevision: 'Needs revision', markDone: '✔ Mark done', uploadDeliver: 'Upload delivery', cancelOrder: 'Cancel order',
    references: 'Reference images', noNotes: 'No notes yet', notePlaceholder: 'Add a note...', addNote: 'Add',
    deliverFiles: 'Delivered files', deliverTitle: 'Upload delivery file', dragUpload: 'Drag a file here, or click to upload',
    confirmDeliver: 'Confirm delivery', cancelConfirm: 'Cancel this order?', confirmTitle: 'Confirm',
    statusUpdated: 'Status updated', priorityUpdated: 'Priority updated', noteAdded: 'Note added', deliverSuccess: 'Delivered!',
    // REQ-022 F1: Publish as artwork
    publishArtwork: 'Publish as artwork', publishDialogTitle: 'Publish as artwork',
    publishHint: 'Select deliverables to publish as artworks (copied to public portfolio; originals are kept).',
    publishNotImage: 'Not an image, cannot publish', publishTitleLabel: 'Title', publishTitlePlaceholder: 'Give this batch a title',
    publishDescLabel: 'Description (optional)', publishDescPlaceholder: 'Extra notes (optional, ≤500 chars)',
    publishSubmit: 'Publish', publishSuccess: 'Published {n} artwork(s)',
    publishDoneTitle: 'Published', publishGoManage: 'Published {n} artwork(s). Go to artwork management?',
    uploadTip: 'Images and archives supported, max 50MB per file',
    invalidFileType: 'Unsupported file type. Please upload an image or archive',
    fileTooLarge: 'File too large (max 50MB)', referenceImage: 'Reference image',
    noReferences: 'No reference images',
    focusUpdated: 'Focus image updated',
    deleteRef: 'Delete reference', deleteRefConfirm: 'Delete this reference image? This cannot be undone.', deleteRefSuccess: 'Reference image deleted',
    focusHint: 'Display size is set globally in the queue board toolbar',
    workflowTitle: 'Workflow progress', stageOff: 'Turn off stage tracking',
    stageProgress: 'Progress {current}/{total}', stageRevision: 'Sent back for revision',
    advanceTo: 'Advance to: ', stageBack: '↩ Send back', stageUpdated: 'Workflow updated',
    stageBackConfirm: 'Send back to "{name}"? The order will be marked as in revision.',
    stageOffConfirm: 'This order will stop following your workflow and fall back to fixed statuses. Continue?',
    stageOffDone: 'Stage tracking turned off',
    gallery: 'Order gallery', galleryUpload: 'Upload', galleryUploadSuccess: 'Image added',
    setFocus: 'Set as focus image',
    galleryHint: 'Click an image to preview · Click ✓ to set focus · Drag / click / Ctrl+V to upload · Up to 20 images total (client + artist)',
    galleryNotImage: 'Only image files are supported', galleryTooBig: 'Image exceeds the 10MB limit',
    uploading: 'Uploading...', sourceClient: 'Client', sourceArtist: 'Artist',
    noteImage: 'Note attachment', noteImageSingle: 'Notes support only 1 attachment. The first image was used.',
    // R39: status area rework (plan B)
    lastActivity: 'Last activity: {time}',
    noteCount: '{n} notes', refCount: '{n} references',
    enableTrackingHint: 'Enable workflow tracking for fine-grained progress management',
    enableTracking: 'Enable', trackingEnabled: 'Workflow tracking enabled',
    slideToCancel: 'Slide to cancel order',
    completedAt: 'Completed {time}',
    // R40: activity timeline
    activityTitle: 'Order status', timelineTitle: 'Activity timeline',
    tlTypeSystem: 'Status change', tlTypeNote: 'Note', tlTypeImage: 'Note with image',
    // R46: note deletion
    deleteNote: 'Delete note', deleteNoteConfirm: 'Delete this note? This cannot be undone.', deleteNoteSuccess: 'Note deleted',
    // SPEC-003: extra work items
    extraItemsTitle: 'Extra work items', extraEmpty: 'No extra items yet', extraAdd: 'Add extra item',
    extraDialogTitle: 'Add extra work item', extraNameLabel: 'Name', extraNamePlaceholder: 'e.g. background detail, rush fee',
    extraDescLabel: 'Description (optional)', extraDescPlaceholder: 'Additional notes', extraPriceLabel: 'Amount (yuan)',
    extraAdded: 'Extra item added', extraDeleted: 'Extra item deleted', extraDelete: 'Delete extra item',
    extraDeleteConfirm: 'Delete extra item "{name}"? The final price will be recalculated.',
    extraTotal: 'Final price', extraAutoHint: 'Final price = base price + extras, calculated automatically',
    // R51: deadline
    colDeadline: 'Deadline', deadlinePlaceholder: 'Pick a deadline', deadlineUpdated: 'Deadline updated',
    // v0.26 B: start date
    colStartDate: 'Start Date', startDatePlaceholder: 'Pick a start date', startDateUpdated: 'Start date updated',
    deadlineAutoSet: 'Deadline auto-set based on turnaround days',
    // v0.38: merged date card (REQ-026 §四) — two fields in one card + "schedule synced" + days-left chip
    dateCardTitle: 'Dates',
    deadlineSavedSync: 'Deadline saved, schedule synced',
    startDateSavedSync: 'Start date saved, schedule synced',
    daysLeft: '{n} days left', daysOverdue: '{n} days overdue', daysToday: 'Due today',
    dateSyncNote: 'Date changes sync to the calendar and timeline views',
    // R58-6: QQ jump + copy
    jumpQq: 'Open QQ', copyQq: 'Copy QQ', qqCopied: 'Client QQ copied',
    // plan-node-speech: client communication block
    commTitle: 'Client Communication', commQq: 'QQ:', commCopyContact: 'Copy contact',
    commPriceSummary: 'Price: total {total} / paid {paid} / due {unpaid}',
    commCopyBtn: 'Copy text & open QQ', commCopied: 'Speech copied — opening QQ',
    commNoQq: 'No client QQ set', commNoStage: 'Order not on a workflow stage — no speech yet', commNoSpeech: 'No speech for the current stage',
    // B7: 额度池收款区
    payTitle: 'Payment Records', payAddBtn: '+ Record Payment',
    payPaid: 'Received', payFinal: 'Total Due', payRemaining: 'Outstanding', payOverpaid: 'Overpaid',
    payFlowTitle: 'Payment History', payRevoke: 'Revoke', payEmpty: 'No payment records yet',
    payRefTitle: 'Due Reference (Workflow Stages)',
    payRefPaid: 'Paid', payRefPartial: 'Partial {amount}', payRefPending: 'Pending',
    payDialogTitle: 'Record Payment', payAmountLabel: 'Amount (¥)', payAmountPlaceholder: 'Enter amount',
    payNoteLabel: 'Note (optional)', payNotePlaceholder: 'e.g. WeChat transfer, deposit',
    // REQ-025 phase 2: negative (refund) switches the note label (matches the mandatory submit validation)
    payRefundNoteLabel: 'Refund reason (required)',
    paySuccess: 'Payment recorded', payRevokeConfirm: 'Revoke the {amount} payment record?', payRevokeSuccess: 'Revoked',
    // Payment amount frontend validation (mirrors backend addPayment rules; negative = refund/revocation)
    payAmountInvalid: 'Payment amount must be greater than 0', payAmountExceed: 'Amount cannot exceed the outstanding balance ¥{amount}',
    payAmountZero: 'Amount cannot be zero', payRefundNoteRequired: 'A reason is required when entering a negative amount (refund)', payRefundExceed: 'Refund cannot exceed the amount already paid ¥{amount}',
    // v0.31 F4: node payments
    payNodePaid: 'Paid', payNodeDue: 'Due', payNodeRemain: 'Remaining',
    payNodeCollect: 'Collect', payNodeTitle: 'Collect for "{name}"',
    // v0.31 F5 → REQ-025 phase 2: due banner (primary = order-level total due, secondary = current node)
    totalDueLabel: 'Total due {amount}', currentDueSuffix: 'Now due: {name} {amount}',
    // v0.31: price edit button
    priceEditBtn: 'Edit Price', priceDialogTitle: 'Edit Final Price',
    priceNewLabel: 'New Price (¥)', pricePlaceholder: 'Enter new final price',
    priceNoteLabel: 'Reason', priceNotePlaceholder: 'e.g. client added requirements, negotiated discount',
    priceUpdated: 'Price updated',
    // v0.31 REQ-021 F1: activity log
    logTitle: 'Activity Log', logTypeAll: 'All', logEmpty: 'No activity yet',
    logActorSystem: 'System', logActorArtist: 'Artist', logActorClient: 'Client',
    logType: {
      status_change: 'Status', price_change: 'Price', extra_item: 'Extra item',
      payment: 'Payment', stage_advance: 'Stage', note_update: 'Note'
    },
    logDetail: {
      statusChange: '{from} → {to}',
      priceChange: '¥{from} → ¥{to}',
      extraAdd: 'Added extra item "{name}"', extraDelete: 'Removed extra item "{name}"',
      paymentAdd: 'Received ¥{amount}', paymentRevoke: 'Revoked ¥{amount}',
      stageAdvance: 'Advanced to "{name}"', stageRollback: 'Rolled back from "{from}" to "{to}"',
      noteAdd: 'Added a note', noteDelete: 'Deleted a note'
    }
  },
  manualOrder: {
    title: 'Manual Entry', hint: 'After the client contacts you on QQ, record the order here manually.',
    leftTitle: 'What the client said', rightTitle: 'How to record',
    clientQq: 'Client QQ', clientQqPlaceholder: "Client's QQ number",
    clientName: 'Client nickname (optional)', clientNamePlaceholder: 'What to call the client',
    tier: 'Tier', tierPlaceholder: 'Select a tier (optional)',
    noTiers: 'No tiers yet — add some in Pricing first', tierDays: '{n} days',
    addons: 'Add-ons', multipliers: 'Usage & Rush',
    usage: 'Usage', rush: 'Rush', personal: 'Personal', noRush: 'No rush', inquiry: 'Inquiry',
    totalPrice: 'Total', finalPrice: 'Final price (CNY)', finalPriceHint: 'Editable; leave blank to use calculated price',
    priceDetail: 'Details',
    desc: 'Description', descPlaceholder: "Paste the client's request from the QQ chat",
    references: 'Reference images (optional, up to 5, ≤10MB each)', refExceed: 'Max 5 reference images', fileTooBig: '{name} too large ({size}MB), max 10MB',
    refTip: 'You can add more references to the order gallery after creation. Gallery total limit: 20 images.',
    priority: 'Priority', priorityHigh: 'High', priorityMedium: 'Medium (default)', priorityLow: 'Low',
    clientNotify: 'Allow client to receive QQ queue notifications',
    catExpression: 'Expressions', catOutfit: 'Outfits', catBackground: 'Backgrounds', catWeapon: 'Weapons', catOther: 'Other',
    submit: 'Record order', resultTitle: 'Recorded', orderNo: 'Order No: {no}', addedToQueue: 'Added to the queue',
    viewQueue: 'View queue', continueEntry: 'Enter another', fillClientQq: "Please enter the client's QQ number",
    // R51: deadline
    deadline: 'Deadline (optional)', deadlinePlaceholder: 'Pick a deadline',
    // F2: drag upload hint
    dragHint: 'Drag images here, or click to upload', uploadRefLabel: 'Upload reference image',
    // F3: start date
    startDate: 'Start date (optional)', startDatePlaceholder: 'Pick a start date',
    // B2: submit guard when start date is later than deadline
    dateConflict: 'Start date cannot be later than deadline',
    // F4: initial stage status
    initialStatus: 'Initial stage status', initialStatusHint: 'Skip the confirmation step for orders already agreed offline',
    // REQ-015: QQ history panel
    historyTitle: "This client's order history", newClient: 'New client — no previous orders',
    // v0.38 D路: 画风模式（画风→尺寸→增项 三级选择）
    styleTitle: 'Choose Style', sizeTitle: 'Choose Size', sizeDays: '{n} days',
    noSizes: 'No sizes available for this style', styleAddonsEmpty: 'No add-ons available for this size',
    addonOptionPrice: 'Option price', selectSizeFirst: 'Please select a style and size first',
    afterMultiplier: 'After multipliers',
    // v0.38 补漏批: R2 自定义单提示 / R5 自定义增项 / R6 图片开关
    customHint: 'You can skip all selections and enter a custom price manually',
    showImages: 'Show images',
    customAddons: 'Custom add-ons', addCustomAddon: 'Add',
    customAddonNamePlaceholder: 'Name (required, ≤50 chars)',
    customAddonPricePlaceholder: 'Amount (negative allowed)',
    customAddonNameRequired: 'Please enter a custom add-on name',
    customAddonPriceRequired: 'Please enter a custom add-on amount',
    customAddonMax: 'Up to 20 custom add-ons allowed',
    selectSizeOrPrice: 'Select a style and size first, or enter a custom final price',
    // F6: manual order draft (localStorage + restore prompt)
    draftFound: 'Found an unsaved manual order draft. Restore it?',
    draftRestored: 'Draft restored',
    // inspection fix batch A1: post-create write-back failure messages
    postCreateFailed: {
      price: 'Failed to write price: {message}',
      extraItem: 'Failed to write custom add-on "{name}": {message}',
      deadline: 'Failed to write deadline: {message}',
      startDate: 'Failed to write start date: {message}',
      initialStatus: 'Failed to set initial stage: {message}',
      summary: 'Order {orderNo} was created, but {reason}. Please complete it in the order details.'
    }
  },
  tiers: {
    title: 'Pricing', addTier: '+ Add tier',
    dragHint: 'Drag to reorder', reorderSaved: 'Order saved',
    colExample: 'Example', colName: 'Name', colPrice: 'Price', colDays: 'Turnaround', colDesc: 'Description',
    editTitle: 'Edit tier', addTitle: 'Add tier', nameLabel: 'Name',
    namePlaceholder: 'e.g. Headshot, Half-body, Full-body', priceLabel: 'Price (CNY)', daysLabel: 'Turnaround (days)',
    descLabel: 'Description', descPlaceholder: 'Briefly describe what this tier includes', exampleLabel: 'Example image (optional)',
    changeExample: 'Change image', uploadExample: 'Upload image', removeExample: 'Remove',
    exampleUploaded: 'Image uploaded — click Save to apply', fillName: 'Please enter a name',
    confirmDelete: 'Delete tier "{name}"?', daysUnit: '{n} days',
    // #10: tier visibility
    visVisible: 'Open', visShowcase: 'Showcase', visHidden: 'Hidden',
    // R55: example image drag-and-drop
    dropToUpload: 'Drop to upload', notImage: 'Only image files are supported', tooBig: 'Image exceeds the 10MB limit',
    overwriteTitle: 'Replace example image', overwriteConfirm: 'This tier already has an example image. The old image cannot be recovered after replacement. Continue?',
    exampleUpdated: 'Example image updated',
    // R54: card layout empty state
    empty: 'No tiers yet',
    // v0.28 T3: tab labels + action text i18n
    tabTiers: 'Tiers', tabAddons: 'Add-ons', tabMultipliers: 'Multipliers', tabWorkflow: 'Workflow & Payment',
    tabDiscount: 'Discount Codes',
    newTier: '+ New tier', cancel: 'Cancel', save: 'Save',
    uploaded: 'Uploaded', saved: 'Saved', deleted: 'Deleted'
  },
  // v0.31 F3: discount code management
  discount: {
    enableLabel: 'Discount Codes', enabledHint: 'Clients can enter a code when ordering', disabledHint: 'Code input hidden on client form',
    enabledMsg: 'Discount codes enabled', disabledMsg: 'Discount codes disabled',
    addBtn: 'New Code', addTitle: 'New Discount Code', editTitle: 'Edit Discount Code',
    colCode: 'Code', colType: 'Discount', colUsage: 'Used / Limit', colExpiry: 'Expiry', colStatus: 'Status',
    noExpiry: 'Never', statusOn: 'Active', statusOff: 'Off',
    codeLabel: 'Code', codePlaceholder: 'e.g. SUMMER20 (uppercase + digits)',
    typeLabel: 'Type', typePercent: 'Percentage', typeFixed: 'Fixed amount',
    valuePercent: 'Discount (%)', valueFixed: 'Amount (¥)',
    maxUsesLabel: 'Usage limit', maxUsesPlaceholder: 'Unlimited', maxUsesHint: 'Leave empty = unlimited',
    expiryLabel: 'Expiry date', expiryPlaceholder: 'Leave empty = never expires',
    createdMsg: 'Code created', updatedMsg: 'Code updated', deletedMsg: 'Code deleted',
    deleteConfirm: 'Delete code "{code}"?', disable: 'Disable', enable: 'Enable',
    empty: 'No discount codes yet. Click "New Code" to create one.'
  },
  // v0.32 REQ-023 Phase1: art styles + addon templates
  styleManage: {
    tabStyles: 'Art Styles', tabTemplates: 'Addon Library', confirmTitle: 'Confirm',
    // Addon templates
    tplName: 'Name', tplControl: 'Control', tplPricing: 'Pricing', tplDefaultPrice: 'Default price', tplActions: 'Actions',
    tplEmpty: 'No addon templates yet. Click "New Addon" to create one.', tplAdd: '+ New Addon',
    tplAddTitle: 'New Addon', tplEditTitle: 'Edit Addon',
    tplNameLabel: 'Name', tplNamePlaceholder: 'e.g. Extra character, Expression set, Background', tplNameRequired: 'Please enter a name',
    tplControlLabel: 'Control type', tplControlSwitch: 'Switch', tplControlQuantity: 'Quantity', tplControlRadio: 'Radio',
    tplPricingLabel: 'Pricing mode', tplPricingFixed: 'Fixed', tplPricingPerUnit: 'Price × Qty', tplPricingPerOption: 'Option price',
    tplPriceLabel: 'Default price (¥)',
    tplUnitLabel: 'Unit label', tplUnitPlaceholder: 'e.g. person, sheet, item',
    tplOptionsLabel: 'Options', tplOptionLabel: 'Option name', tplAddOption: '+ Add option',
    tplOptionsHint: 'Clients pick one option when ordering; each option can have its own price.', tplOptionsRequired: 'Radio type needs at least one valid option',
    tplSaved: 'Addon saved', tplDeleted: 'Addon deleted', tplDeleteConfirm: 'Delete addon "{name}"? All style references to it will be removed too.',
    pricePerUnit: '¥{price}/{unit}', unitDefault: 'item',
    // Art styles
    styleAdd: '+ New Style (import from addon library)', styleAddTitle: 'New Style', styleEditTitle: 'Edit Style',
    styleNameLabel: 'Style name', styleNamePlaceholder: 'e.g. Anime, Painterly, Pixel art', styleNameRequired: 'Please enter a style name',
    styleDescLabel: 'Description (optional)', styleDescPlaceholder: 'What style or scenarios it suits',
    styleCoverLabel: 'Cover image (optional)', styleCoverUpload: 'Upload cover', styleCoverChange: 'Change cover',
    styleImportAddons: 'Import all addons from library', styleImportHint: 'When checked, every addon in the library is imported into this style (enabled by default, adjustable per item).',
    styleSaved: 'Style saved', styleDeleted: 'Style deleted', styleDeleteConfirm: 'Delete style "{name}"? All its sizes, addon configs and overrides will be removed too.',
    styleActive: 'Active', styleEmpty: 'No styles yet. Click "New Style" to start configuring.',
    // Sizes
    sizeTitle: 'Sizes & base prices', sizeName: 'Size', sizePrice: 'Base price', sizeActions: 'Actions',
    sizeNamePlaceholder: 'e.g. Avatar, Half-body, Full-body', sizeNameRequired: 'Please enter a size name',
    sizeAdd: 'Add', sizeSaved: 'Size saved', sizeAdded: 'Size added', sizeDeleted: 'Size deleted',
    sizeDeleteConfirm: 'Delete size "{name}"? Its override configs will be removed too.',
    // Addons
    addonTitle: 'Addons (imported from library)', addonEmpty: 'No addons imported yet. Create some in the addon library, then re-import.',
    addonSave: 'Save addon config', addonSaved: 'Addon config saved',
    // Size overrides
    overrideExpand: 'Size overrides ▾', overrideCollapse: 'Collapse ▴',
    overrideTitle: 'Size overrides for "{name}"', overrideHidden: 'Hide', overrideSaved: 'Override saved',
    // v0.35 wave 1 (REQ-024 F2/F1): merged entry + multi-style switch + size edit extension
    tabStylesAndPricing: 'Styles & Pricing',
    multiStyle: 'Multi-style',
    multiStyleHintOff: 'Off: clients only see the default style (first active one); other styles are kept but greyed out',
    multiStyleHintOn: 'On: all active styles are visible to clients',
    styleLocked: 'Multi-style switch is off — only the default style is editable',
    styleDefaultTag: 'Default',
    sizeAddTitle: 'Add size', sizeEditTitle: 'Edit size',
    sizeImageLabel: 'Size image (optional)', sizeImageUpload: 'Upload new image', sizeImagePick: 'Pick from portfolio',
    sizeImageRemove: 'Remove image', sizeImageHint: 'If not set, clients see the style cover as fallback',
    sizeImageSavedMsg: 'Size image updated', sizeImageUploadHint: 'Size image uploaded — click Save to apply',
    sizeDescLabel: 'Description (optional)', sizeDescPlaceholder: 'What this size includes / suits',
    sizeDaysLabel: 'Turnaround (days, optional)',
    sizeImageCol: 'Image', sizeDescCol: 'Description', sizeDaysCol: 'Turnaround',
    sizeFromArtworkTag: 'Portfolio', sizeAddBtn: '+ Add size', sizeEmpty: 'No sizes yet',
    sizePickTitle: 'Pick from portfolio', sizePickHint: 'Click an artwork to use it as the size image', sizePickEmpty: 'No artworks yet — upload some in Portfolio first',
    // v0.35 fix A4: import addons into an existing style
    addonImportBtn: '+ Import addons', addonImportTitle: 'Import from addon library',
    addonImportEmpty: 'No new addons to import (all library addons are already in this style)',
    addonImportConfirm: 'Import selected', addonImported: 'Addons imported'
  },
  artworks: {
    title: 'Portfolio', dragUpload: 'Drag images here, or click to upload',
    tip: 'JPG / PNG / WebP supported; ≥ 800px recommended', empty: 'No artworks yet — upload some!',
    uploaded: 'Uploaded', confirmDelete: 'Delete this artwork?', image: 'Artwork image',
    // R45: multi-select delete
    manage: 'Manage', manageDone: 'Done',
    selected: '{n} selected',
    batchDeleteTitle: 'Batch delete', batchDeleteConfirm: 'Delete {n} selected artworks? This cannot be undone.',
    batchDeleted: '{n} artworks deleted', batchPartial: 'Delete finished: {ok} succeeded, {failed} failed',
    slideToDelete: 'Slide to confirm deletion',
    // REQ-017: cover operations
    coverSet: 'Set as cover', coverUnset: 'Remove cover',
    coverSetSuccess: 'Set as cover', coverUnsetSuccess: 'Cover removed',
    coverTag: 'Cover',
    // F7: 主图去重
    mainImages: 'Main images', mainTag: 'Main',
    // v0.31: multi-cover reorder
    coverMoveUp: 'Move up', coverMoveDown: 'Move down', coverReordered: 'Cover order updated',
    // v0.35 wave 3 (REQ-024 F6): artwork edit (size tags + free description)
    editTitle: 'Edit artwork', editTitleLabel: 'Title', editDescLabel: 'Free description',
    editDescPlaceholder: "Whose design, hours spent, techniques used… write freely",
    editTagsLabel: 'Size tags', editTagsEmptyHint: 'Pick the sizes this artwork belongs to',
    editTagsHint: 'Multi-select; clients can filter the gallery by size, and tags on the enlarged view preselect the order form',
    editSaved: 'Artwork saved'
  },
  rules: {
    title: 'Guidelines Editor', hint: 'Edit the commission guidelines clients must read before ordering. HTML tags supported.',
    placeholder: 'Enter your commission guidelines. HTML tags like <h3>, <ul>, <li>, <strong> are supported',
    preview: 'Preview:', save: 'Save guidelines', saved: 'Guidelines saved'
  },
  // #44: Preferences standalone page (split from Page Settings)
  preferences: {
    title: 'Preferences',
    // F1 batch4: back-office font size tiers (accessibility)
    fontSize: 'Back-office font size', fontSizeNormal: 'Standard', fontSizeLarge: 'Large', fontSizeXLarge: 'Extra large',
    fontSizeHint: 'Applies immediately and persists across refreshes. Large = 15px, Extra large = 17px (default 14px)'
  },
  settings: {
    title: 'Page Settings', tabProfile: 'Profile', tabShowcase: 'Public Page', tabTemplate: 'Template & Style',
    tabPrefs: 'Preferences', tabRules: 'Rules', tabWorkflow: 'Workflow & Payment',
    // BUG-7: load-failure protection (prevent default/empty values overwriting real settings)
    loadFailedTitle: 'Failed to load settings', loadFailedDesc: 'The form currently holds default values. Saving now would overwrite your real settings. Retry loading first, then edit and save.',
    loadFailedHint: 'Settings have not loaded yet. Please retry before saving.',
    rulesLoadFailed: 'Failed to load rules. Saving is disabled to avoid overwriting existing rules.', retry: 'Retry',
    // #3: quick actions config
    quickTitle: 'Quick Actions', quickLabel: 'Dashboard quick buttons (3-9)',
    quickHint: 'Check the buttons you want, then save. The dashboard quick area will follow.',
    quickSave: 'Save quick actions', quickSaved: 'Quick actions saved', quickLimitError: 'Please select 3-9 quick actions',
    quickLocalFallback: 'Saved locally (server unavailable, will sync on next visit)',
    nameLabel: 'Artist name', bioLabel: 'Bio', bioPlaceholder: 'Introduce yourself',
    codeLabel: 'Artist code (order prefix)', codePlaceholder: 'e.g. ALICE, QY (2-10 uppercase letters/digits)',
    codeHint: 'Used as the order number prefix (e.g. ALICE-001). Changes apply to new orders only.',
    statusLabel: 'Page status', statusOpen: 'Open', statusFull: 'Full', statusBreak: 'On break', statusHidden: 'Hidden',
    linksLabel: 'Links (shown on public page)', addLink: 'Add link',
    linksHint: 'Up to 8 links. Platforms are auto-detected as you paste. Changes appear on your public page immediately after saving. Empty rows are not saved.',
    linksEmpty: 'No links added yet', linkOther: 'Other', linkUrlPlaceholder: 'https://',
    linkInvalid: 'Invalid link format (http/https only, or paste a bare URL)', linkTooLong: 'Link is too long (domain ≤253 / path ≤1500 / total ≤1800)',
    inspireLabel: 'Inspiration tags (shown on order page)', inspireInputPlaceholder: 'Type a tag and press Enter',
    inspireHint: 'Up to 20 tags, each ≤30 characters. Clients can click a tag to quickly fill in their request description. Hidden on the order page when not set.',
    inspireTagTooLong: 'Tag cannot exceed 30 characters', inspireTagLimit: 'Up to 20 tags', inspireTagDuplicate: 'Tag already exists',
    // SPEC-004: slots & buffer
    slotLabel: 'Formal slots (N)', slotEnable: 'Enable slot limit', slotUnit: 'slots',
    slotHint: 'Off = unlimited orders; 0 = application-based (clients can apply but do not occupy a slot); N>0 = limited orders. When enabled, formal + buffer total must be ≥ 1.',
    slotMinError: 'When slot limit is enabled, formal + buffer total must be ≥ 1',
    bufferLabel: 'Buffer slots (M)', bufferHint: 'When formal slots are full, new orders enter the buffer as waitlist. Promoted orders move to the formal queue.',
    // S5: monthly quota
    quotaLabel: 'Monthly quota', quotaEnable: 'Enable monthly quota', quotaUnit: 'orders/mo',
    quotaHint: 'Limit new orders per month (by creation date; cancelled orders excluded). Off = unlimited. Independent of slot system — when both are enabled, hitting either limit shows as full.',
    bufferSwitchLabel: 'Buffer settings',
    autoPromote: 'Auto-promote (when a formal slot opens, automatically move the earliest buffer order in)',
    hideQueuePosition: 'Hide queue position from clients (only show "In queue")',
    hidePromoteNotify: 'Do not notify clients on promotion',
    bufferShortForm: 'Short-form mode for buffer orders (board shows key info only)',
    bufferSwitchHint: 'These switches only take effect when buffer slots exist.',
    contactQqLabel: 'Contact QQ (visible to clients)', contactQqPlaceholder: 'Leave blank to use your login QQ',
    contactQqHint: 'Clients who forgot their order number will see this QQ to contact you',
    notifyLabel: 'Client QQ notifications', notifyText: 'Allow clients to receive queue/completion notifications',
    notifyPanelTitle: 'Notifications & Panel',
    defaultPanelLabel: 'Dashboard default panel', defaultPanelHint: 'Shortcut shown when entering the dashboard',
    announcementLabel: 'Homepage announcement', announcementPlaceholder: 'e.g.: On break this week, back on Monday',
    announcementHint: 'Shown above the fold on your public page (max 500 chars). Leave empty to hide.',
    announcementExpiresLabel: 'Auto-hide date (optional)', announcementExpiresHint: 'The announcement disappears automatically after this date. Leave unset to keep it indefinitely.',
    // REQ-018: announcement expiry shortcuts
    shortcut7d: 'Next 7 days', shortcut30d: 'Next 30 days', shortcutMonthEnd: 'End of month',
    save: 'Save settings', saved: 'Settings saved',
    // R48: avatar upload
    avatarLabel: 'Avatar', avatarHint: 'Click to upload or change (JPG/PNG/WebP, ≤10MB)',
    avatarUpdated: 'Avatar updated', avatarNotImage: 'Only image files are supported', avatarTooBig: 'Image exceeds the 10MB limit',
    // R49: accent color
    accentLabel: 'Accent color', accentHint: 'Button/link/highlight color on your public page, independent of visitor accent choice',
    accentClear: 'Default', accentDarkHint: 'Dark mode auto-brightens, no manual adjustment needed',
    // v0.25 A: Cover management
    coverTitle: 'Cover images (homepage carousel)',
    coverHint: 'Click the star to feature an artwork as a homepage cover. Multiple covers rotate automatically. Click again to remove.',
    coverSet: 'Set as cover', coverUnset: 'Remove cover',
    coverSetSuccess: 'Set as cover', coverUnsetSuccess: 'Cover removed',
    coverEmpty: 'No artworks yet — upload artworks first to set covers',
    coverManageLink: 'Manage covers',
    // R50: preview
    previewBtn: 'Preview page'
  },
  // v0.26 C: Slot management page
  slots: {
    title: 'Slot Settings',
    statusSection: 'Commission Status',
    slotSection: 'Slot Limits',
    quotaSection: 'Monthly Quota',
    queueSection: 'Queue Behavior',
    totalHint: 'Formal {n} + Buffer {m} = {sum} total slots',
    statusOpen: 'Currently accepting commissions',
    statusFull: 'Full — not accepting new orders',
    statusBreak: 'On break — not accepting orders',
    statusHidden: 'Page is hidden'
  },
  templates: {
    tab: 'Page Template',
    hint: 'Choose how your public page looks. Layout sets the structure, palette sets the mood — all share the same artwork and pricing data.',
    label: 'Page layout',
    atelier: 'Atelier',
    atelierDesc: 'Warm paper tones, serif headings, brush-stroke underlines — a quiet, handcrafted feel',
    classic: 'Classic Studio',
    classicDesc: 'Signature-work banner opening, two-column desktop layout, sticky commission button',
    gallery: 'Gallery',
    galleryDesc: 'Full-screen artwork opening, plaque-style name, album-style flipping gallery (large current page, shrunken side peeks)',
    folio: 'Single Page',
    folioDesc: 'Split-screen opening, scroll-tracking nav — ideal for a brand-driven look',
    palette: 'Page palette',
    paletteHint: 'The palette sets the mood of your page colors (light/dark adapts to each visitor). Accent color still follows the visitor\'s five-color choice.',
    palettePaper: 'Paper', palettePaperDesc: 'Warm white, ink text, calm',
    paletteInk: 'Ink', paletteInkDesc: 'Gallery charcoal, layered grey, restrained',
    paletteDusk: 'Dusk', paletteDuskDesc: 'Blue-grey twilight, cool',
    paletteMoss: 'Moss', paletteMossDesc: 'Deep green, natural, warm',
    saved: 'Template updated'
  },
  embed: {
    tab: 'Embed Script',
    hint: 'If you already have your own website (Carrd / Framer / custom HTML), you can embed a snippet to let clients commission you directly from your site.',
    step1: '1. Copy this code:',
    step2: '2. Paste it where you want the "Commission me" button to appear on your site. Clicking it opens an order form.',
    copyBtn: 'Copy code',
    copied: 'Copied',
    copyFailed: 'Copy failed — please select and copy manually'
  },
  workflow: {
    stageList: 'Workflow Stages', paymentBar: 'Payment Split', overview: 'Full Workflow',
    addPlaceholder: 'New stage name, e.g. "Detailing"', final: 'Final', auto: 'Auto',
    deleteHint: 'Delete this stage?', deletePayHint: 'This stage\'s payment % will merge into the final payment. Delete?',
    savePayment: 'Save Split', unsaved: 'Unsaved payment changes',
    saved: 'Payment split saved', detached: 'Payment node removed, % merged into final',
    dragHandle: 'Drag to adjust ratio', minPercent: 'Ratio cannot be below 5%', finalTooLow: 'Final payment too low to allocate',
    reset: 'Reset to Default', resetConfirm: 'Reset to default template? All custom stages and payment splits will be overwritten. This cannot be undone.', resetDone: 'Reset to default template',
    descPlaceholder: 'Click to add a note',
    // plan-node-speech: node speech ({客户名} etc. are backend variable tokens — kept in Chinese in both locales)
    // Bug 1: braces are parsed as ICU placeholders by vue-i18n (Chinese is not a valid identifier → crash); escape with {'{'} literals
    speechLabel: 'Speech', speechPlaceholder: "{'{'}客户名{'}'}，你的订单已{'{'}节点名{'}'}。",
    speechSave: 'Save speech', speechSaved: 'Speech saved', speechVarHint: 'Click to insert variable',
    // #8: speech UI improvements (shared variable bar + collapsible preview)
    speechVarCommon: 'Speech variables (click a speech box below, then click a variable to insert)',
    speechVarNoFocus: 'Click a speech editor first',
    speechEmpty: 'No speech yet',
    // v0.27: random template toggle
    randomTemplate: 'Random', randomTemplateHint: 'Available with multiple speech lines — picks one at random when sending',
    helpBtn: 'How it works', helpTitle: 'Workflow & Payment Guide',
    helpLines: [
      'Each stage is a step in your commission process; clients see progress in order.',
      'Toggle the switch on a stage to collect payment there; the ratio bar splits it live.',
      'The last payment stage is the "final payment" — its ratio is auto-calculated and locked.',
      'Drag the handle between two segments to rebalance them; drag a segment all the way left to remove its payment.',
      'Drag the ⠿ handle to reorder stages; the final-payment tag follows the last paying stage automatically.',
      'Click a stage name to rename it; click the grey note text to add a description.',
      'All ratios always sum to 100%, and no stage can go below 5%.'
    ]
  },
  admin: {
    backToAdmin: 'Back to dashboard', panelTitle: 'Admin panel',
    artistCount: 'Artists', totalOrders: 'Total orders', activeOrders: 'Active orders',
    artistList: 'Artist list', manageArtists: 'Manage artists',
    colName: 'Name', colSubdomain: 'Subdomain', colQq: 'QQ No.', colStatus: 'Status', colBio: 'Bio',
    backToPanel: 'Back to admin panel', artistManage: 'Artist management', addArtist: '+ Add artist',
    addTitle: 'Add artist', qqLabel: 'QQ No.', qqPlaceholder: "Artist's QQ number (used for login)",
    nameLabel: 'Name', namePlaceholder: 'Name shown to clients',
    subdomainLabel: 'Subdomain', subdomainPlaceholder: 'e.g. alice (lowercase letters/digits/hyphens)',
    codeLabel: 'Artist code (optional)', codePlaceholder: 'e.g. ALICE (defaults to subdomain uppercase)',
    bioLabel: 'Bio (optional)', domainSuffix: '.domain',
    requiredFields: 'QQ number, name and subdomain are required', added: 'Artist added',
    confirmRemove: 'Remove artist "{name}"? All of their orders and artwork data will be permanently deleted!',
    confirmRemoveTitle: 'Dangerous action', confirmRemoveBtn: 'Confirm removal',
    artistOrders: 'Order history', noOrders: 'No orders yet', statusUpdated: 'Status updated',
    // B7: order expand row — payment summary
    payPaid: 'Received', payFinal: 'Total Due', payRemaining: 'Outstanding',
    payRefPaid: 'Paid', payRefPartial: 'Partial', payRefPending: 'Pending', payNoData: 'No payment info',
    transferAdmin: 'Transfer admin', transferTitle: 'Transfer admin account',
    transferStep1Title: 'Verify current admin', transferStep2Title: 'Verify new admin',
    currentAdminQq: 'Current admin QQ', newAdminQq: 'New admin QQ',
    newAdminQqPlaceholder: 'Enter new admin QQ (must be a registered artist)',
    enterCode: 'Enter 6-digit code',
    nextStep: 'Next', confirmTransfer: 'Confirm transfer',
    transferSuccess: 'Admin transferred to {name}', adminTag: 'Admin',
    transferTotpHint: 'Enter the 6-digit code shown in each authenticator app (both must be bound first)',
    // REQ-027: TOTP bind/reset
    totpBind: 'Bind', totpRebind: 'Rebind',
    totpBindTitle: 'Bind dynamic code - {name}',
    totpStep1: '1. Have the artist scan this QR with their authenticator app (Tencent Authenticator mini-program / Aegis / 2FAS / Microsoft Authenticator)',
    totpStep2: '2. Ask the artist for the 6-digit code currently shown, enter it below and confirm',
    totpCodeLabel: '6-digit dynamic code', totpCodePlaceholder: 'Enter the 6-digit dynamic code',
    totpBindConfirm: 'Confirm binding', totpBindSuccess: 'Dynamic code bound',
    totpReset: 'Reset binding', totpResetConfirm: 'Reset the dynamic code binding for "{name}"? The old secret becomes invalid immediately; the artist must re-bind before logging in.',
    totpResetSuccess: 'Binding reset',
    totpRegenerate: 'Regenerate QR', totpRegenerateHint: 'Regenerating invalidates the old QR immediately; the artist must scan again',
    orderColNo: 'Order No.', orderColQq: 'Client QQ', orderColStatus: 'Status',
    orderColType: 'Type', orderColTime: 'Order time',
    greetingManage: 'Greeting Manager', greetingPlaceholder: "Enter greeting, use {'{'}name{'}'} for artist name",
    greetingPreview: 'Preview', greetingEmpty: 'Please enter greeting text',
    greetingColText: 'Greeting', greetingColSlot: 'Time slot', greetingColEnabled: 'Enabled',
    slotAny: 'All day', slotMorning: 'Morning', slotAfternoon: 'Afternoon', slotEvening: 'Evening', slotNight: 'Late night',
    defaultWorkflow: 'Default Workflow Template', defaultWorkflowHint: 'Changes only affect newly registered artists. Existing artists are not affected.',
    resetTemplate: 'Reset to factory default', resetConfirm: 'Restore factory default template? Your custom template will be overwritten.', resetDone: 'Factory default restored',
    manage: 'Manage', artistDetail: 'Artist Detail', tierName: 'Tier name',
    artworkHint: 'Artwork images must be uploaded via the artist dashboard. Here you can only view and delete.',
    greetingTab: 'Greetings',
    greetingGlobalHint: 'Global entries apply to all artists, mixed with per-artist entries when drawing.',
    greetingArtistHint: 'Artist-specific entries only apply to this artist, mixed with global entries when drawing.',
    // Recycle bin (incident fix: orphaned files are recoverable)
    recycleBin: {
      title: 'Recycle Bin', empty: 'Empty bin',
      colFile: 'File', colPath: 'Original path', colSize: 'Size', colMovedAt: 'Moved at',
      emptyTitle: 'Empty recycle bin', emptyConfirm: 'Files in the recycle bin will be permanently deleted and cannot be recovered. Empty it?',
      emptied: '{n} files permanently deleted', emptyHint: 'Recycle bin is empty'
    },
    // F4: guestbook management (cross-artist); REQ-022 F5: three-way filters
    guestbook: {
      title: 'Guestbook management', empty: 'No messages',
      colArtist: 'Artist', colNickname: 'Nickname', colContent: 'Content', colStatus: 'Status', colTime: 'Time',
      statusPending: 'Pending', statusApproved: 'Approved', statusRejected: 'Rejected',
      filterByReplied: 'By reply', repliedYes: 'Replied', repliedNo: 'Not replied',
      delete: 'Force delete', deleteConfirm: 'Delete this message? It will no longer appear on the client page.', deleted: 'Message deleted'
    },
    // HC: system health check
    health: {
      title: 'System Health', start: 'Run checks', checking: 'Checking…',
      download: 'Download diagnostic report', refresh: 'Results are not persisted after refresh',
      diskNote: 'for reference only', expandDetail: 'Details',
      statusOk: 'OK', statusWarn: 'Warning', statusFail: 'Failed',
      emptyHint: 'Click “Run checks” to execute the 8 system checks'
    },
    // REQ-022 F2: social platform management
    platformManage: 'Platform management',
    platform: {
      colName: 'Platform', colIcon: 'Icon', colDomains: 'Match domains', colOrder: 'Order', colEnabled: 'Enabled',
      add: 'Add platform', edit: 'Edit platform', delete: 'Delete',
      nameLabel: 'Platform name', namePlaceholder: 'e.g. Weibo',
      iconLabel: 'Icon (simple-icons whitelist)', iconNone: 'None (use fallback char)',
      fallbackLabel: 'Fallback char', fallbackPlaceholder: 'e.g. 米 (used when simple-icons has no icon)',
      domainsLabel: 'Match domains', domainsPlaceholder: 'One domain per line, e.g. weibo.com',
      domainsHint: 'After saving, pasted links from these domains are auto-detected as this platform.',
      orderLabel: 'Sort order (lower first)',
      enabledLabel: 'Enabled', enabledHint: 'Disabled platforms disappear from the artist settings dropdown, but existing links stay visible.',
      save: 'Save', cancel: 'Cancel', saved: 'Platform saved',
      deleteConfirm: 'Delete "{name}"? Links referencing this platform will become "Other". The links themselves are kept.',
      deleted: 'Platform deleted, {n} link(s) became "Other"',
      iconFallbackHint: 'At least one of icon or fallback char is required.',
      domainFormatError: 'Invalid domain format (no protocol/path/port)'
    },
    // REQ-033: analytics dashboard
    tracking: {
      title: 'Analytics', total: 'Total events', visibleLabel: 'Artist stats visible',
      daysLabel: 'Range', funnelTitle: 'Order funnel',
      byNameTitle: 'By event', byDayTitle: 'By day',
      colName: 'Event', colCount: 'Count', colRatio: 'Ratio', colDay: 'Date',
      days7: 'Last 7 days', days14: 'Last 14 days', days30: 'Last 30 days', days90: 'Last 90 days',
      visibleSaved: 'Artist stats visibility updated', empty: 'No event data'
    }
  }
}
