export default {
  errors: {
    // Auth
    NOT_LOGGED_IN: 'Not logged in',
    SESSION_EXPIRED: 'Session expired, please log in again',
    ACCOUNT_NOT_FOUND: 'Artist account not found',
    ACCOUNT_DISABLED: 'Account has been disabled',
    ARTIST_BANNED: 'This account has been banned. Please contact the administrator if you have questions.',
    TOKEN_REVOKED: 'Session invalidated, please log in again',
    ADMIN_REQUIRED: 'Admin privileges required',
    // REQ-041: Admin step-up verification
    STEP_UP_REQUIRED: 'Admin verification required',
    QQ_NOT_REGISTERED: 'This QQ number is not registered as an artist',
    TOTP_NOT_BOUND: 'This artist has not bound an authenticator yet. Please contact the admin',
    TOTP_INVALID: 'Incorrect QQ number or one-time password',
    TOTP_LOCKED: 'Too many attempts. Your account is temporarily locked. Please try again later.',
    TOTP_BIND_INVALID: 'Incorrect one-time password. Ask the artist to check the 6-digit code on their authenticator',
    // REQ-039: Invite registration
    INVITE_INVALID: 'Invite code is invalid, already used, or expired',
    INVITE_CANNOT_REVOKE: 'Only unused invite codes can be revoked',
    ONBOARDING_DISABLED: 'Invite onboarding is not enabled. Please contact the admin',

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
    TRACK_ALREADY_ON: 'Process tracking is already enabled. Please refresh the page to view it.',
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
    WORKFLOW_PAYMENT_IN_USE: 'There are {count} active order(s) referencing payment stages. Changing the payment structure affects their stage locks and payment plans — finish the orders first or try again later.',

    // Order
    ORDER_NOT_FOUND: 'Order not found',
    ORDER_NOT_OWNED: 'This order does not belong to you',
    ORDER_INVALID_STATUS: 'Invalid status',
    INVALID_TRANSITION: 'Invalid status transition',
    // D-1（R-5）: order version optimistic-lock conflict (stale snapshot writes)
    ORDER_CONFLICT: 'The order was updated by another action. Please refresh and retry',
    // R-2: cancelling a paid order needs explicit confirmation (Batch A contract 409 CANCEL_WITH_PAYMENT)
    CANCEL_WITH_PAYMENT: 'This order has received payment. Please refund offline before cancelling',
    DELIVER_WRONG_STATUS: 'Cannot upload deliverable in current status',
    TIER_NOT_FOUND: 'Price tier not found or does not belong to this artist',
    ILLEGAL_PATH: 'Invalid file path',
    MISSING_FILE: 'Missing file path',
    QUEUE_EMPTY: 'Reorder list cannot be empty',
    QUEUE_NOT_OWNED: 'Order does not belong to current queue',
    QUEUE_LENGTH: 'Reorder list length mismatch',
    QUEUE_DUPLICATE: 'Reorder list has duplicate orders',
    INVALID_PRIORITY: 'Invalid priority',

    // REQ-022 F1: Publish as artwork
    PUBLISH_WRONG_STATUS: 'Only delivered orders can be published as artworks',
    DELIVERABLE_NOT_FOUND: 'Deliverable not found or does not belong to this order',

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
    ILLEGAL_FILE_TYPE: 'Unsupported file type',
    UNSUPPORTED_FORMAT: 'Unsupported file format',

    // Admin
    ADMIN_VERIFY_FAILED: 'Admin verification failed',

    // General
    NOT_FOUND: 'Content not found',
    VALIDATION: 'Invalid request parameters',
    INTERNAL: 'Internal server error',
    UNKNOWN: 'The request could not be completed. Please try again.',

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
    MISSING_CREDENTIALS: 'Please enter your QQ number and authenticator code',

    // Order input (supplement)
    ARTIST_NOT_OPEN: 'This artist is not accepting new commissions',
    RULES_NOT_AGREED: 'Please read and agree to the commission rules first',
    STATUS_REQUIRED: 'Please specify a status',
    NOTE_EMPTY: 'Note content cannot be empty',
    ORDER_INVALID_ID: 'Invalid order ID',

    // Addons (supplement)
    // Add-on selection (supplement, SPEC-PRICE-2: only one usage / rush each)
    ADDON_SELECTION_MUTEX: 'Only one usage and one rush add-on can be active at a time',

    // Multipliers (supplement)

    // Pricing (supplement)
    PRICING_CALC_FAILED: 'Price calculation failed',
    INVALID_PRICE: 'Invalid price (must be a positive integer in cents, max 100,000,000 = ¥1,000,000)',
    // Pricing engine (supplement, v0.37 REQ-025)
    PRICING_CONSERVATION: 'Pricing data looks inconsistent. The change was not applied. Please refresh and retry.',
    PRICE_CHANGE_AFTER_DONE: 'Order is complete; adjust the price by adding or removing extra items',

    // Focus image (supplement)
    FOCUS_IMAGE_NOT_FOUND: 'Focus image not found',
    FOCUS_IMAGE_NOT_OWNED: 'This focus image does not belong to this order',
    INVALID_FOCUS_MODE: 'Invalid focus image mode (options: Off / Small / Large)',

    // Custom links (supplement)
    LINKS_TOO_MANY: 'Cannot have more than 8 custom links',
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

    // Social platforms (supplement, v0.38 REQ-022 F2)
    PLATFORM_NOT_FOUND: 'Social platform not found',
    PLATFORM_NAME_EMPTY: 'Platform name cannot be empty',
    PLATFORM_ICON_REQUIRED: 'Provide at least an icon key or a single-character fallback',
    PLATFORM_DOMAIN_INVALID: 'Invalid platform domain (no protocol/path/port)',
    PLATFORM_DOMAIN_TAKEN: 'This domain is already used by another enabled platform',

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
    STYLE_SIZE_NOT_AVAILABLE: 'This size is not available for ordering',
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
    theme: 'Theme', base: 'Base', accent: 'Accent', auto: 'Auto', light: 'Light', dark: 'Dark',
    // Accent swatch names (polish batch A: proper color names, not literal one-word translations)
    accentNames: { teal: 'Teal', turquoise: 'Turquoise', blue: 'Blue', indigo: 'Indigo', violet: 'Violet' },
    // v0.38: artist back-office paper/ink dual themes (REQ-026 §1.2)
    artistToInk: 'Switch to ink theme', artistToPaper: 'Switch to paper theme',
    artistToastInk: 'Switched · Ink', artistToastPaper: 'Switched · Paper'
  },
  common: {
    status: { open: 'Open for commissions', full: 'Fully booked', break: 'On break', hidden: 'Hidden' },
    statusShort: { open: 'Open', full: 'Full', break: 'Break', hidden: 'Hidden' },
    priority: { high: 'High', medium: 'Med', low: 'Low' },
    orderStatus: {
      pending: 'Pending', confirmed: 'Confirmed', wip: 'In progress', revision: 'Revising',
      done: 'Done', delivered: 'Delivered', cancelled: 'Cancelled'
    },
    source: { self: 'Self', manual: 'Manual', clientSelf: 'Client self-order', manualEntry: 'Manual entry' },
    custom: 'Custom', none: 'None',
    save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', download: 'Download',
    confirm: 'Confirm', close: 'Close', detail: 'Details', actions: 'Actions', remove: 'Remove', add: 'Add', or: 'or',
    like: 'Like', unlike: 'Unlike',
    saved: 'Saved', deleted: 'Deleted', removed: 'Removed',
    confirmDeleteTitle: 'Confirm deletion', uploadFailed: 'Upload failed', copyFailed: 'Copy failed, please copy manually',
loadRetry: 'Try again', networkError: 'Network error, please try again later', globalError: 'Something went wrong. Please refresh and try again.',
    // 812-B5: friendly Passkey interaction messages (unsupported / cancelled / failed)
    passkeyNotSupported: 'Passkey is not supported on this browser (HTTPS or localhost required).',
    passkeyCancelled: 'Passkey verification cancelled.',
    passkeyFailed: 'Passkey verification failed. Please try again or use another method.',
    footer: 'Inkglean · Artist Commission Platform'
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
    pasteTooBig: 'File "{name}" exceeds the {max}MB limit ({size}MB). Please compress and try again.',
    dragFromPage: 'Images on this page can\'t be dragged into the upload area (they\'re rendered copies, not the original files). Drag files from your file manager, or paste with Ctrl+V',
    // 05D-A2: upload (non-paste) path validation messages
    fileNotImage: 'Only image files are supported',
    fileTooBig: 'File "{name}" exceeds the {max}MB limit ({size}MB). Please compress and try again.'
  },
  pageTitle: {
    home: 'Artist Commission Platform',
    artistHome: 'Artist Home',
    order: 'Commission',
    track: 'Track Order',
    delivery: 'Download Artwork',
    login: 'Artist Login',
    healthCheck: 'System Health',
    notFound: 'Page Not Found'
  },
  menu: {
    // REQ-040: Account & Security menu item
    account: 'Account & Security',
    logo: 'Inkglean',
    // v0.38: sidebar brand seal character (REQ-026 §三.1 vermillion seal)
    logoSeal: '绘',
    dashboard: 'Dashboard', queue: 'Queue Board', orders: 'Orders',
    manualOrder: 'Manual Entry', tiers: 'Pricing', artworks: 'Portfolio',
    guestbook: 'Guestbook', slots: 'Slot Settings',
    preview: 'Preview Page',
    rules: 'Guidelines', stats: 'Statistics', settings: 'Page Settings', preferences: 'Preferences', admin: 'Admin', logout: 'Log out',
    collapse: 'Collapse sidebar', expand: 'Expand sidebar', openMenu: 'Open menu',
    langToEn: 'English', langToZh: 'Chinese', langAriaToEn: 'Switch to English', langAriaToZh: 'Switch to Chinese',
    // REQ-035 batch D: What-to-eat tool page menu item
    foodMenu: 'What to Eat',
    // REQ-031 A1: Income export (tools group menu item)
    toolsExport: 'Income Export',
    // REQ-035 batch C: Standalone income (tools group menu item)
    standaloneIncome: 'Standalone Income',
    // REQ-035 batch D: Watermark tool (tools group menu item)
    watermark: 'Watermark',
    // REQ-035 batch E: Progress puzzle / Schedule share (tools group menu items)
    puzzle: 'Progress Puzzle',
    scheduleShare: 'Schedule Share',
    // REQ-035 batch A: Client tags + Returning clients (tools group menu items)
    clientTags: 'Client Tags',
    returningClients: 'Returning Clients',
    // REQ-035 postponed tools: Price calculator / Social reply / Quick notes / Deadline advice (tools group menu items)
    priceCalc: 'Price Calculator',
    socialReply: 'Social Reply',
    quickNote: 'Quick Notes',
    deadlineAdvice: 'Deadline Advice',
    // 812-tools-a: new tools wave A (quote / revision counter / image resize)
    quote: 'Quote',
    revisionCount: 'Revision Counter',
    imageResize: 'Image Resize',
    // REQ-016 C: sidebar group titles
    groupWork: 'Work', groupBiz: 'Business', groupTools: 'Tools', groupFront: 'Storefront',
    // Toolbox reorganization (Paper-Ink proposal §5.5: one drawer handle + four category slots)
    toolbox: 'Toolbox', toolboxHint: 'All small tools live here, sorted into four drawers by purpose',
    toolboxCatMoney: 'Money', toolboxCatDelivery: 'Delivery', toolboxCatClients: 'Clients', toolboxCatEfficiency: 'Efficiency',
    // 812 tools wave B: Price card / Delivery checklist / Deposit ledger (tools group menu items)
    priceCard: 'Price Card',
    deliveryChecklist: 'Delivery Checklist',
    deposit: 'Deposit Ledger',
  },
  // REQ-035 postponed tools: Price calculator (tools page copy)
  priceCalc: {
    title: 'Price Calculator',
    subtitle: 'Quick estimate when a client asks about price; matches what the client sees',
    loading: 'Loading…',
    loadFailed: 'Failed to load styles and pricing. Please retry.',
    stepStyle: 'Pick a style',
    stepSize: 'Pick a size',
    stepAddons: 'Add-ons (optional)',
    stepMultipliers: 'Multipliers (optional)',
    noSizes: 'No sizes configured for this style yet. Add them in Pricing first',
    noStyles: 'No styles configured yet. Set up styles in Pricing first',
    workDays: '~{n} days',
    usage: 'Usage',
    rush: 'Rush',
    none: 'None',
    basePrice: 'Base price',
    multiplierNote: 'Multipliers',
    optionPrice: 'Priced per option',
    disclaimer: 'For reference only. Final price is based on the actual quote'
  },
  // REQ-035 postponed tools: Social reply (tools page copy)
  reply: {
    title: 'Social Reply',
    subtitle: 'Copy-paste replies for the moments you hate speaking up',
    copy: 'Copy',
    copied: 'Copied to clipboard',
    copyFailed: 'Copy failed, please copy manually',
    cats: {
      remind: 'Payment Reminders',
      decline: 'Declining',
      delay: 'Delays',
      negotiate: 'Negotiating',
      daily: 'Daily Chat'
    }
  },
  // REQ-035 postponed tools: Quick notes (tools page copy)
  note: {
    title: 'Quick Notes',
    subtitle: 'Jot down ideas, client notes and to-dos; saved locally in this browser',
    titlePlaceholder: 'Title (optional)',
    contentPlaceholder: 'Write something…',
    add: 'Add note',
    empty: 'No notes yet. Add your first one',
    untitled: 'Untitled',
    copy: 'Copy',
    delete: 'Delete',
    // A5: localStorage data cannot be recovered after deletion
    deleteConfirm: 'Delete this note? This cannot be undone.',
    copied: 'Copied',
    copyFailed: 'Copy failed, please copy manually',
  },
  // REQ-040: Account & Security page
  account: {
    title: 'Account & Security',
    accountInfo: 'Account Info',
    qqLabel: 'QQ Number',
    profileHint: 'Edit your name, avatar and other profile info at',
    profileLink: 'Page Settings',
    totpSection: 'Authenticator (TOTP)',
    totpBound: 'Bound',
    totpNotBound: 'Not bound',
    totpRebind: 'Rebind',
    totpRebindStep1: 'Verify Identity',
    totpRebindStep2: 'Scan New QR Code',
    totpRebindDone: 'Rebind Complete',
    totpRebindPasskeyHint: 'Verify with Passkey',
    totpRebindCodeHint: 'Enter the current 6-digit code from your authenticator',
    totpRebindNewCodeHint: 'Enter the 6-digit code from your new authenticator',
    totpRebindNewCodePlaceholder: '6-digit code from new authenticator',
    totpRebindConfirm: 'Confirm Rebind',
    totpRebindCooldown: 'Rebind too frequent. Please wait {hours} hours before retrying.',
    totpRebindSuccess: 'TOTP rebound successfully. All devices have been logged out. Please log in again.',
    passkeySection: 'Passkey Devices',
    passkeyRegister: 'Register This Device',
    passkeyRegistering: 'Registering…',
    passkeyDeviceName: 'Device Name',
    passkeyLastUsed: 'Last Used',
    passkeyNeverUsed: 'Never',
    passkeyDelete: 'Delete',
    passkeyDeleteConfirm: 'Delete this Passkey credential? This device will no longer be able to log in with Passkey.',
    passkeyEmpty: 'No devices registered yet. Click the button above to register.',
    passkeyNotSupported: 'Passkey is not supported on this browser (HTTPS or localhost required).',
    // Wave 3-2: credential/rebind failure feedback (was silent)
    passkeyLoadFailed: 'Failed to load passkey credentials. Please retry.',
    passkeyRenameFailed: 'Failed to save device name. Please retry.',
    passkeyDeleteFailed: 'Failed to delete passkey. Please retry.',
    totpRebindFailed: 'Failed to rebind TOTP. Please retry.',
  },
  // REQ-035 postponed tools: Deadline advice (tools page copy)
  deadlineAdvice: {
    title: 'Deadline Advice',
    subtitle: 'Quickly suggest a due date when a client asks "when will it be done?"',
    workDays: 'Work days',
    queueMode: 'Include queue',
    queueHint: 'Current formal queue has {n} orders, ~1 day buffer each',
    compute: 'Suggest a date',
    resultLabel: 'Suggested due date',
    today: 'Today',
    workDaysShort: 'Work days',
    queueBuffer: 'Queue buffer',
    totalDays: 'Total',
    daysUnit: 'days',
    ordersUnit: 'orders',
    disclaimer: 'Estimate only; actual date depends on your schedule',
    weekdays: {
      sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat'
    }
  },
  // REQ-035 batch D: What-to-eat tool page copy
  foodMenu: {
    title: 'What to Eat Today',
    subtitle: 'Pick a mode and get a random dish',
    modes: {
      healthy: 'Healthy',
      diabetes: 'Diabetic-friendly',
      gout: 'Gout-friendly',
      takeout: 'Takeout'
    },
    pick: 'Random pick',
    again: 'Another one',
    disclaimer: 'For reference only. Please consult your doctor for specific dietary advice.',
    emptyHint: 'Click "Random pick" to see what to eat today',
    // b4-6 fallback plan: en UI shows a notice that dish names remain in Chinese (translation scheduled separately)
    originalNamesNote: 'Dish names are shown in Chinese for now; the English menu is being prepared.'
  },
  // REQ-031 A1: Income export CSV (tools page copy)
  toolsExport: {
    title: 'Income Export',
    subtitle: 'Export payment records (including refunds) by date range for reconciliation and tax filing',
    rangeLabel: 'Date Range',
    startPlaceholder: 'Start date',
    endPlaceholder: 'End date',
    exportBtn: 'Export CSV',
    emptyHint: 'No payment records in this period',
    note: 'The exported CSV includes: date, client, amount (cents), type (order payment / standalone income), order id. Data matches the backend and never includes private artist notes.',
    incomeOverview: 'Income Overview',
    incomeLoading: 'Loading…',
    incomeOrder: 'Order Payments',
    incomeStandalone: 'Standalone Income',
    incomeTotal: 'Total',
    incomeNote: 'Matches the exported CSV (order payments + standalone income)',
    incomeLoadFailed: 'Failed to load income overview',
    downloaded: 'Download started',
    failed: 'Export failed, please try again later',
    // 05D-E1: CSV export timeout
    timeout: 'Export timed out, please try again'
  },
  // REQ-035 batch C: Standalone income ledger (tools page copy)
  standaloneIncome: {
    title: 'Standalone Income',
    subtitle: 'Record one-off payments (deposits, final payments, rush fees) for easy reconciliation',
    amountLabel: 'Amount (CNY)',
    amountPlaceholder: 'e.g. 128.50',
    dateLabel: 'Date',
    datePlaceholder: 'Pick a date',
    clientLabel: 'Client nickname (optional)',
    clientPlaceholder: 'Client nickname for easy lookup',
    noteLabel: 'Note (optional)',
    notePlaceholder: 'Extra details, e.g. payment method or source',
    addBtn: 'Add record',
    adding: 'Saving…',
    addSuccess: 'Record added',
    addFailed: 'Failed to save, please try again',
    listTitle: 'Records',
    empty: 'No records yet — add your first one',
    loadFailed: 'Failed to load records',
    anonymous: 'Anonymous',
    delete: 'Delete',
    deleteConfirm: 'Delete this record? This cannot be undone.',
    deleteSuccess: 'Deleted',
    deleteFailed: 'Failed to delete, please try again',
    notFound: 'Record not found or already deleted',
    amountRequired: 'Enter an amount',
    amountPositive: 'Amount must be greater than 0',
    clientTooLong: 'Client nickname must be 50 characters or fewer',
    noteTooLong: 'Note must be 200 characters or fewer',
    dateRequired: 'Pick a date'
  },

  // 812-tools-a: Quote generator (tools page copy)
  quote: {
    title: 'Quote',
    subtitle: 'Fill items and amounts into the template, then generate an image or text quote to send to clients',
    clientLabel: 'Client name (optional)',
    clientPlaceholder: 'e.g. Alice, XX Studio',
    itemsLabel: 'Items',
    itemNamePlaceholder: 'Item name, e.g. Avatar · Half-body',
    itemAmountPlaceholder: 'Amount (CNY)',
    addItem: 'Add item',
    removeItem: 'Remove',
    emptyItems: 'No items yet — add your first row',
    noteLabel: 'Note (optional)',
    notePlaceholder: 'e.g. Includes 3 revisions, commercial license',
    total: 'Total',
    exportPng: 'Generate image',
    copyText: 'Copy text',
    copied: 'Copied to clipboard',
    copyFailed: 'Copy failed, please copy manually',
    needItems: 'Add at least one valid item first',
    imageGenerated: 'Image generated',
    imageFailed: 'Failed to generate image, please try again',
    // Fixed canvas template copy (single fill-in template, follows locale)
    canvasTitle: 'QUOTE',
    canvasClient: 'Client: ',
    canvasTotal: 'Total: ',
    canvasNote: 'Note: ',
    canvasFooter: 'Generated by 拾绘 Inkglean',
    // Plain-text line templates
    clientLine: 'Client: {name}',
    totalLine: 'Total: {total}',
    noteLine: 'Note: {note}'
  },
  // 812-tools-a: Revision counter (tools page copy)
  revisionCount: {
    title: 'Revision Counter',
    subtitle: 'Track revision rounds per entry; entries at the limit turn vermilion as a reminder',
    namePlaceholder: 'e.g. Alice-Avatar',
    add: 'Add entry',
    addHint: 'Default limit is 3, adjustable per entry',
    empty: 'No entries yet — add one to start counting',
    plus: '+1',
    undo: 'Undo',
    reset: 'Reset',
    delete: 'Delete',
    // A4: localStorage data cannot be recovered after deletion
    deleteConfirm: 'Delete this entry? This cannot be undone.',
    overLimit: 'Revision limit reached — keep the client in the loop',
    limitLabel: 'Limit',
    countUnit: ''
  },
  // 812-tools-a: Image resize (tools page copy)
  imageResize: {
    title: 'Image Resize',
    subtitle: 'Resize and compress locally, export WebP with platform presets — images never leave the browser',
    chooseFile: 'Drop an image here, or click to choose',
    fileTypeError: 'Please choose an image file',
    presetsLabel: 'Size presets',
    presetXhs: 'Xiaohongshu 1242×1660',
    presetWeibo: 'Weibo 1080 wide',
    presetAvatar: 'Avatar 500×500',
    presetCustom: 'Custom width/height',
    widthLabel: 'Width',
    heightLabel: 'Height',
    widthPlaceholder: 'Width (px)',
    heightPlaceholder: 'Height (px, blank = auto)',
    qualityLabel: 'Quality',
    process: 'Compress',
    processing: 'Processing…',
    resultTitle: 'Result',
    resultDims: 'Output: {w} × {h}',
    resultSize: 'Est. size: {size}',
    originalSize: 'Original: {size}',
    download: 'Download WebP',
    noImage: 'Choose an image first',
    invalidDims: 'Width and height must be integers from 1 to 10000',
    processFailed: 'Compression failed, please try another image'
  },
  // REQ-035 batch D: Watermark tool page copy
  watermark: {
    title: 'Watermark Tool',
    sourceSection: 'Image source',
    watermarkSection: 'Watermark settings',
    sourceNew: 'New image',
    sourceArtwork: 'Artwork',
    sourceDeliverable: 'Deliverable',
    chooseFile: 'Choose image',
    selectOrder: 'Select order',
    emptyArtworks: 'No artworks',
    emptyDeliverables: 'No deliverables',
    watermarkType: 'Watermark type',
    textInputLabel: 'Watermark text',
    text: 'Text',
    logo: 'Logo',
    logoAlt: 'Logo',
    uploadLogo: 'Upload logo (PNG)',
    logoScale: 'Logo scale',
    modeLabel: 'Watermark mode',
    modeCorner: 'Corners',
    modeStretch: 'Stretch',
    modeTile: 'Tile',
    opacity: 'Opacity',
    fontSize: 'Font size',
    margin: 'Margin',
    spacing: 'Spacing',
    position: 'Position',
    positionAll: 'Corners',
    posTopLeft: 'Top-left',
    posTopRight: 'Top-right',
    posBottomLeft: 'Bottom-left',
    posBottomRight: 'Bottom-right',
    posCenter: 'Center',
    export: 'Export',
    exporting: 'Exporting…',
    noImage: 'Choose an image first',
    preview: 'Preview',
    renderError: 'Image compositing failed, please try another image',
    fileTypeError: 'Please choose an image file (LOGO must be PNG)',
    logoSaved: 'Logo saved',
    // A8: logo mode requires an uploaded logo before preview/export
    logoRequired: 'Please upload a LOGO first before previewing or exporting',
    // Wave 3-2: load-failure error states (distinguish failure from empty list)
    loadArtworksFailed: 'Failed to load artworks. Please retry.',
    loadOrdersFailed: 'Failed to load orders. Please retry.',
    loadDeliverablesFailed: 'Failed to load deliverables. Please retry.'
  },
  // REQ-035 batch E: Progress comparison puzzle (tool page copy)
  puzzle: {
    title: 'Progress Comparison',
    subtitle: 'Combine multiple images of one order into a comparison sheet to show progress to clients',
    selectOrder: 'Select order',
    selectImages: 'Select images (2-6)',
    arrange: 'Arrange order',
    up: 'Up',
    down: 'Down',
    export: 'Export',
    preview: 'Preview',
    noImages: 'No images in this order',
    needTwo: 'Select at least 2 images',
    kindDeliverable: 'Deliverable',
    kindReference: 'Reference',
    loadOrdersFailed: 'Failed to load orders',
    loadOrderFailed: 'Failed to load order',
    exportFailed: 'Export failed: some images are cross-origin restricted, please reselect',
    exported: 'Puzzle exported'
  },
  // REQ-035 batch E: Schedule share (tool page copy)
  schedule: {
    title: 'Schedule Share',
    subtitle: 'Generate a shareable schedule status: copy text or download an image to send clients',
    loading: 'Loading schedule…',
    copyText: 'Copy text',
    downloadImage: 'Download image',
    queueFormal: '{n} in formal queue',
    queueBuffer: '{n} in buffer',
    deadlineSoon: 'Upcoming deadlines',
    statusBusy: 'Busy',
    statusNormal: 'Normal',
    statusFree: 'Available',
    statusLabel: 'Schedule status: ',
    textHeader: '[Inkglean Schedule] {artist}',
    noDeadline: 'No upcoming deadlines',
    brandFooter: 'Inkglean · Schedule Share',
    copied: 'Copied',
    copyFailed: 'Copy failed, please copy manually',
    loadFailed: 'Failed to load schedule',
    exported: 'Card downloaded',
    exportFailed: 'Failed to generate image'
  },
  // F3 quick actions (2026-08-07 user decision)
  // REQ-035 batch A: Client tags (tools page copy)
  clients: {
    title: 'Client Tags',
    searchPlaceholder: 'Search by QQ',
    qq: 'QQ',
    tags: 'Tags',
    note: 'Note',
    actions: 'Actions',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this client profile?',
    empty: 'No client profiles yet',
    editTitle: 'Edit Client Tags',
    save: 'Save',
    cancel: 'Cancel',
    // validation/feedback copy (subset of backend rules: tags <=20, each 1-20 chars; note <=200)
    tagsMax: 'At most 20 tags',
    tagLength: 'Each tag 1-20 characters',
    noteMax: 'Note at most 200 characters',
    saveSuccess: 'Saved',
    saveFailed: 'Save failed, please retry',
    deleteSuccess: 'Deleted',
    deleteFailed: 'Delete failed, please retry',
    loadFailed: 'Failed to load, please retry'
  },
  // REQ-035 batch A: Returning clients (tools page copy)
  returning: {
    title: 'Returning Clients',
    days30: 'Over 30 days',
    days60: 'Over 60 days',
    days90: 'Over 90 days',
    ordersColumn: 'Orders',
    totalOrders: '{n} orders',
    totalPaid: 'Total paid',
    lastOrder: 'Last order',
    daysSince: '{n} days since',
    copyScript: 'Copy script',
    copySuccess: 'Script copied',
    copyFailed: 'Copy failed, please copy manually',
    empty: 'No matching clients',
    loadFailed: 'Failed to load, please retry',
    script: 'Long time no see! It\'s me, your artist — I just opened a new slot. Your last commission was {days} days ago. Care to take a look? (Client QQ: {qq})'
  },
  quickAction: {
    title: 'Settings',
    rules: 'Edit Guidelines',
    share: 'Share Page',
    quickconfig: 'Quick Action Settings',
    status: 'Status',
    publish: 'Quick Publish',
    uploading: 'Uploading…',
    published: 'Artwork published',
    publishFailed: 'Publish failed',
    notImage: 'Images only',
    copied: 'Page link copied',
    noSubdomain: 'No page domain set — go to settings'
  },
  landing: {
    title: 'Inkglean', subtitle: 'Find your favorite artist and start commissioning',
    noBio: 'This artist has not written a bio yet',
    noArtists: 'No artists have joined yet', loadFailed: 'Failed to load artist list',
  },
  // v0.34 task A: standalone 404 page
  notFound: {
    message: "The page you're looking for doesn't exist or has been moved.",
    backHome: 'Back to home',
    artistsTitle: 'Or visit one of our artists'
  },
  artistHome: {
    commission: 'Commission me', track: 'Track order',
    menuLabel: 'Menu',
    noWorks: 'No artworks yet — stay tuned',
    priceList: 'Price list', artworks: 'Portfolio', rules: 'Commission guidelines', workflow: 'Workflow & Payment',
    aboutDays: '~{n} days', loadFailed: 'Artist not found or failed to load',
    hidden: "This artist's page is currently unavailable. If you're the owner, enable \"Shop visibility\" under Settings → Public Page.",
    // Status text (dynamic keys from useArtistData.statusText; templates must not hardcode)
    statusOpen: 'Open', statusFull: 'Full', statusBreak: 'On break', statusHidden: 'Hidden',
    navPricing: 'Pricing', navWork: 'Work', navRules: 'How to order', navGuestbook: 'Guestbook',
    startCommission: 'Start a commission →', trackOrder: 'Track order',
    ctaSubtitle: 'Looking forward to creating something great with you.',
    // v0.42 Step 6: client gallery "load more"
    loadMore: 'Load more',
    otherLink: 'Link',
    revisionNote: 'Revision policy',
    // #9: tier showcase
    tierSelectBtn: 'Choose this tier', tierShowcase: 'Not accepting', tierShowcaseBtn: 'Not accepting orders',
    // R50: preview mode
    previewBanner: 'Preview mode — changes not yet saved',
    // v0.25 A: Cover showcase
    // v0.32 REQ-023 Phase3: multi-style price table
    styleOrderBtn: 'Commission in this style',
    // v0.34 task B: order hint after size selected
    styleSizeHint: '{size} selected · ¥{price} — click below to start with this choice',
    // Wave M: unified placeholder when a homepage section fails
    sectionLoadFailed: 'Some content failed to load'
  },
  orderForm: {
    backHome: 'Back to page', title: 'Commission me',
    workflowLabel: 'Workflow',
    descLabel: 'Description', descPlaceholder: 'Describe what you want: character features, pose, style, background, etc.',
    // D soft prompt (user decision: description can be skipped, only prompt once when empty, no hard block)
    descSoftTitle: 'Empty description', descSoftMsg: 'You have not described what you want. Continue anyway? (The artist may not fully understand your idea.)',
    descSoftContinue: 'Continue',
    refLabel: 'Reference images (optional, up to 5, ≤10MB each)', refExceed: 'Up to 5 reference images',
    refTip: 'The artist can add more references to the order gallery after you submit. Gallery total limit: 20 images.',
    refUpload: 'Upload reference image',
    qqLabel: 'Your QQ number', qqPlaceholder: 'The artist will contact you via QQ',
    nameLabel: 'Nickname (optional)', namePlaceholder: 'What should we call you',
    notifyLabel: 'Notify me on QQ when my turn comes', agreeLabel: 'I have read and agree to the guidelines above',
    submit: 'Submit commission', successTitle: 'Commission submitted!', orderNoIs: 'Your order number is: ',
    addQqHint: 'Add the artist on QQ to discuss details — just quote your order number', viewProgress: 'Track progress',
    fillQq: 'Please enter your QQ number', selectSizeFirst: 'Please select a style and size first',
    fileTooBig: 'File "{name}" exceeds the 10MB limit ({size}MB). Please compress and re-upload',
    typeWarning: 'Converting to JPG or WebP is recommended for better previews, but the current format can still be uploaded.',
    // G-7 (P2-13): reference upload credential unavailable (anon-token issuance network failure)
    anonTokenRequired: 'Failed to obtain the upload credential. Please check your network and retry.',
    loadFailed: 'Failed to load artist info',
    // R57: draft recovery
    draftTitle: 'Restore draft', draftFound: 'An unsent draft was found. Restore it?',
    draftRestore: 'Restore', draftDiscard: 'Discard', draftRestored: 'Draft restored',
    // R58-6: QQ jump + copy
    artistQqLabel: 'Artist QQ', jumpQq: 'Open QQ', copyQq: 'Copy QQ', qqCopied: 'QQ number copied', qqJumpHint: 'Opening QQ… If nothing happens, copy the QQ number and add the artist manually',
    // F1: success-page tracking link (full text + copy + QR)
    saveTrackHint: 'Save this link — progress checks require it',
    copyTrackLink: 'Copy link', trackLinkCopied: 'Tracking link copied', trackQrAlt: 'QR code of the tracking link',
    // R58-2: step-by-step guide
    step2: 'Details', step3: 'Contact',
    step2Title: 'Describe your request', step3Title: 'Contact details',
    nextStep: 'Next', prevStep: 'Back',
    stepProgress: 'Step {cur} / {total}',
    summaryTitle: 'Order Summary',
    // W3: empty-state hint when no size selected in style mode
    summaryNoSize: 'Pick a size to see the price here',
    // REQ-022 F3: client info echo in summary card
    summaryNickname: 'Nickname', summaryDescription: 'Request details',
    // E13: size description / work days / preview image in summary card
    summaryWorkDays: '~{n} days', summarySizeImgAlt: 'Size preview image',
    // R58-3: receipt confirmation
    receiptSub: '· COMMISSION SLIP ·', receiptTotal: 'Total', receiptConfirm: 'Confirm order', submitting: 'Submitting…',
    // R58-4: inspiration tags
    inspireHint: 'Not sure what to write? Tap a tag to fill it in:',
    // R58-5: copy order summary
    copySummary: 'Copy order info', summaryCopied: 'Order info copied', summaryOrderNo: 'Order No.: ',
    // v0.31 F3: discount code
    discountLabel: 'Discount code', discountPlaceholder: 'Have a code?', discountValidate: 'Apply',
    discountEstimate: 'Est. discount',
    // v0.32 REQ-023 Phase2: multi-style three-step flow
    styleStep: 'Style', sizeStep: 'Size', addonStep: 'Add-ons',
    styleStepTitle: 'Pick a style', sizeStepTitle: 'Pick a size', addonStepTitle: 'Add-ons & options',
    addonStepEmpty: 'No add-ons available for this size',
    noSizeHint: 'This style has no sizes set — you can skip and continue',
    noSizeContinue: 'Skip sizes, continue',
    // SPEC-PRICE-2: addon step groups + usage/rush single-select + showcase sizes + price breakdown
    noStylesHint: 'This artist has not opened commissions yet — please come back later',
    addonGroupRegular: 'Add-ons (multi-select)',
    addonGroupUsage: 'Usage (pick at most one)',
    addonGroupRush: 'Rush (pick at most one)',
    multOptionalHint: 'optional',
    sizeShowcaseTag: 'Showcase · not bookable',
    sizeShowcaseBlocked: 'This size is on display and not bookable right now',
    pctOfBase: 'of base price',
    priceSubtotal: 'Subtotal (base + add-ons)',
    previewBaseLine: 'Base price ({size})',
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
      agreeRequired: 'Please tick "I have read and agree to the guidelines above"',
      termsRequired: 'Please read and agree to the Terms of Service and Privacy Policy first'
    }
  },
  track: {
    backHome: 'Back to page', title: 'Track order', search: 'Search',
    // F1: paste the full tracking link (the token is the identity)
    linkLabel: 'Tracking link', linkPlaceholder: 'Paste the full tracking link saved after ordering',
    pasteHint: 'Paste the link you saved on the success page to check progress',
    enterLink: 'Please paste a tracking link first',
    linkInvalid: 'Invalid link — paste the full tracking link saved after ordering',
    linkExpired: 'This link is no longer valid — ask the artist to resend one',
    savedTitle: 'Saved tracking links', savedQuery: 'Check',
    orderNo: 'Order No.',
    artist: 'Artist', type: 'Type',
    positionText: '#{pos} of {total}', orderTime: 'Order time',
    stepSubmitted: 'Submitted', stepConfirmed: 'Confirmed', stepWip: 'In progress', stepDone: 'Done', stepDelivered: 'Delivered',
    deliverables: 'Delivered files', otherOrder: 'Track another order',
    // SPEC-003: price & payments
    priceTitle: 'Price breakdown', finalPrice: 'Final price',
    // B7: quota-pool payment progress
    payPaid: 'Paid', payNext: 'Next Due', payRemaining: 'Outstanding', payTotal: 'Total',
    // D-3（R-11）: explicit zero-price order
    zeroOrder: 'Free order',
    zeroOrderHint: 'This is a ¥0 order — no payment needed',
    searchFailed: 'Search failed, please try again later',
    // U1: brief recap
    briefTitle: 'Your brief', briefRefAlt: 'Reference image',
    timeline: {
      title: 'Production progress',
      current: 'In progress',
      progress: '{name} {current}/{total}',
      revisionAt: 'Rolled back to “{name}”',
      notStarted: 'Order submitted — production starts once the artist confirms',
      orderedAt: 'Ordered: '
    },
    // REQ-031 C4: timezone display
    tzBeijing: 'Beijing Time',
    tzLocal: 'Your Local Time',
    // REQ-031 A2: order receipt
    receiptBtn: 'Receipt',
    receiptTitle: 'Order Receipt',
    receiptSub: 'Delivered · Read-only receipt',
    receiptOrderNo: 'Order No.',
    receiptArtist: 'Artist',
    receiptItems: 'Payment Nodes',
    receiptTotal: 'Total',
    receiptPaid: 'Paid',
    receiptRemaining: 'Remaining',
    receiptNote: 'Per-payment details are coming soon.'
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
    orderInfo: 'Order: {no} | Artist: {artist}', download: 'Download',
    downloadFailed: 'Download failed, please retry or contact the artist', verifyFailed: 'Verification failed, please try again later',
    // 815 decision #4: one-time download
    downloadLocked: 'Downloaded',
    downloadLockedMsg: 'This file has already been downloaded and locked. Please contact the artist for re-permission'
  },
  login: {
    // REQ-040: Passkey login button
    passkeyLogin: 'Sign in with Windows Hello / Fingerprint',
    passkeyLogging: 'Verifying identity…',
    // v0.46 paper-ink login page: brand block (seal + Inkglean + subtitle)
    brandTitle: 'Inkglean', subtitle: 'Artist Studio',
    // Preferences: theme + language (same logic as the studio)
    prefThemeGroup: 'Theme', themePaper: 'Paper', themeInk: 'Ink',
    prefLangGroup: 'Language',
    // Form
    qqLabel: 'QQ Number', qqPlaceholder: 'Your QQ number',
    codeLabel: 'Auth Code', codePlaceholder: '6-digit code from your authenticator',
    login: 'Sign in', logging: 'Boarding…',
    enterQq: 'Enter your QQ number first.', qqInvalid: 'QQ numbers are digits only.',
    enterCode: 'Now the 6-digit code from your authenticator.', codeInvalid: 'The code is 6 digits — check your authenticator.',
    loginSuccess: 'Logged in!',
    // Lockout error (TOTP_LOCKED with remainingLockMs renders remaining time via this key)
    locked: 'Too many attempts — locked for now. Try again in about {minutes} min.',
    // Help: real TOTP authenticator recommendations (2026-08-10 rewrite:
    // old helpTencent/helpAegis/helpNotGoogle claims were unfounded and removed; TOTP is RFC 6238, any standard authenticator works)
    helpTitle: 'Need an authenticator app? See recommendations',
    helpDesc: 'Codes are generated by an authenticator app. Any app that supports standard TOTP works:',
    helpNote: 'After binding, the code refreshes every 30 seconds. Enter the 6 digits currently shown.'
  },
  // P0-9: MultiplierManager i18n
  multiplier: {
  },
  // v0.42 Step5: artist stats page (REQ-033 three-state: off / hidden / on)
  stats: {
    title: 'Statistics',
    totalEvents: 'Total events',
    byDay: 'By day',
    byName: 'Events',
    disabledHint: 'Statistics are off. Enable them in the admin console.',
    empty: 'No event data',
    loadFailed: 'Failed to load statistics. Please retry.',
    events: {
      dashboard_view: 'Dashboard views', queue_view: 'Queue views', orders_view: 'Order list views',
      manual_view: 'Manual entry', artworks_view: 'Artwork management', settings_view: 'Settings',
      tiers_view: 'Tiers', guestbook_view: 'Guestbook', preferences_view: 'Preferences',
      dashboard_quick_click: 'Quick actions', artist_page_enter: 'Homepage views', artist_action: 'Artist actions'
    }
  },
  // v0.42 Step5: tracking three-state (admin switch: off / hidden / on)
  tracking: {
    modeOff: 'Off',
    modeHidden: 'Hidden',
    modeOn: 'On',
    saved: 'Saved'
  },
  dashboard: {
    pendingNew: 'New pending', activeOrders: 'Active orders',
    totalCompleted: 'Total completed',
    statusUpdated: 'Status updated',
    statusOpen: 'Open', statusFull: 'Full', statusBreak: 'On break',
    anotherOne: 'Another',
    plaqueHintOpen: 'Tap · Take a break',
    plaqueHintBreak: 'Tap · Open for commissions',
    // E2: plaque full state — display variant of the open face
    plaqueFullChar: 'Full',
    ledgerEmpty: 'All settled for today',
    ledgerSunk: 'Settled · Archived',
    ledgerSettle: 'Settle · Tear away',
    ledgerSettled: 'Accounts settled — travel light.',
    ledgerMonth: 'Received this month',
    ledgerCooldown: 'Ink drying {n}s',
    ledgerVerbConfirm: 'Confirm',
    ledgerVerbStart: 'Start',
    ledgerVerbDone: '✔ Done',
    ledgerVerbAdvance: 'Advance · {stage}',
    ledgerVerbDeliver: 'Deliver',
    scheduleTitle: 'Upcoming',
    scheduleExpand: 'Open board →',
    scheduleEmpty: 'Nothing scheduled in the next 7 days',
    scheduleSummaryTitle: 'Order summary',
    scheduleSummaryClient: 'Client',
    scheduleSummaryStage: 'Current stage',
    scheduleSummaryStart: 'Start',
    scheduleSummaryDeadline: 'Deadline',
    scheduleSummaryStatus: 'Status',
    scheduleSummaryDetail: 'Open order detail',
    greetSign: '— Inkglean',
    annPrefix: 'Notice',
    slotMorning: 'Morning', slotAfternoon: 'Afternoon', slotEvening: 'Evening', slotNight: 'Late night',
    panelQueue: 'Queue Board', panelOrders: 'Order List', panelManual: 'Manual Entry', panelTiers: 'Pricing',
    // F4: guestbook moderation
    guestbookTitle: 'Guestbook moderation', guestbookEmpty: 'No messages',
    guestbookPending: 'Pending', guestbookApproved: 'Approved', guestbookRejected: 'Rejected',
    guestbookApprove: 'Approve', guestbookReject: 'Reject', guestbookReply: 'Reply',
    guestbookReplyPlaceholder: 'Reply to this visitor (≤500 chars)', guestbookReplySave: 'Save reply',
    guestbookApprovedMsg: 'Message approved', guestbookRejectedMsg: 'Message rejected', guestbookRepliedMsg: 'Reply saved',
    guestbookError: 'Failed to load guestbook messages',
    // R52: today stats
    todayNewOrders: 'New orders today', todayRevenue: 'Revenue today',
    // R51: deadlines + today's todos
    // v0.18 dashboard rebuild
    retry: 'Retry',
    todoTitle: "What's next",
    tag_overdue: 'Overdue', tag_dueToday: 'Due today', tag_pending: 'New', tag_revision: 'Revision', tag_inProgress: 'In progress',
    activityTitle: 'Recent activity', activityError: 'Failed to load activity', activityEmpty: 'No recent activity',
    timeJustNow: 'just now', timeMinutesAgo: '{n}m ago', timeHoursAgo: '{n}h ago', timeDaysAgo: '{n}d ago',
    // #4: slot overview revamp
    slotCombined: '{used}/{total} filled',
  },
  queue: {
    title: 'Queue Board',
    hint: 'Drag cards to reorder. Order is saved immediately. Priority is a label only and does not affect sorting.',
    confirm: 'Confirm', startWip: 'Start work', done: '✔ Complete', deliver: 'Deliver', cancel: 'Cancel',
    empty: 'Queue is empty — no orders yet',
    // REQ-037 C1: drag reorder success + undo
    reorderSuccess: 'Order reordered', reorderUndo: 'Undo',
    // SPEC-004: buffer zone
    bufferHint: 'When formal slots are full, new orders wait here. Promoted orders move to the formal queue',
    bufferTag: 'Waitlist', bufferEmpty: 'No waitlist orders in the buffer zone',
    promote: 'Promote', promoted: 'Promoted to formal queue',
    slideToCancel: 'Slide to confirm cancellation', slideCancelConfirm: 'Confirm cancellation', statusUpdated: 'Status updated',
    // 815 decision #1: paid-order cancel on queue side redirects to detail page for confirmation
    cancelPaidGoDetail: 'This order has payments. Please cancel from the order detail page after confirmation',
    advanceStage: 'Advance to next stage', stageAdvanced: 'Advanced to next stage',
    workflowLoadFailed: 'Failed to load workflow stages. The advance button is hidden. Please retry.',
    // P0-3b: tab labels
    tabFormal: 'Formal', tabBuffer: 'Buffer',
    // REQ-013 #7: workflow done order delivery entry + completed zone
    goDeliver: 'Deliver',
    completedTitle: 'Recently delivered', completedHint: 'Delivered orders stay here for 7 days then hide automatically',
    completedEmpty: 'No recently delivered orders',
    dragHint: 'Drag to reorder',
    reorderLabel: 'Reorder queue', moveUp: 'Move order up', moveDown: 'Move order down',
    focusDisplay: 'Focus image', focusOff: 'Off', focusLarge: 'Large',
    uploadFocus: 'Upload focus image',
    replaceFocus: 'Replace focus image',
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
    tlDragStartAfterDeadline: 'Start date cannot be later than deadline',
    // D-1（R-5）: timeline drag hit a concurrent update (409 ORDER_CONFLICT)
    tlOrderConflict: 'The order was updated elsewhere. Please refresh and retry',
    // Batch G (2026-08-08): calendar optimizations (MVP)
    calAvailable: 'Available',
    calDayViewTitle: '{d} · {n} order(s)',
    calMoreOrders: '{n} more order(s)',
    tlEditDates: 'Reschedule', tlEditStart: 'Start date', tlEditDeadline: 'Deadline', tlDateSaved: 'Dates updated',
    calSelectMonth: 'Select month'
  },
  orderList: {
    title: 'Order Management', all: 'All',
    colOrderNo: 'Order No.', colType: 'Type', colQq: 'Client QQ', colName: 'Nickname',
    colPriority: 'Priority', colStatus: 'Status', colSource: 'Source', colTime: 'Order time', colActions: 'Actions',
    colImage: 'Image',
    // REQ-020 F1: order search
    searchPlaceholder: 'Search name / order no. / tier', noSearchResult: 'No matching orders',
    fetchAllProgress: 'Loading all orders ({done}/{total})…'
  },
  orderDetail: {
    backToQueue: 'Back to queue', backToDashboard: 'Back to dashboard', backToList: 'Back to orders', orderNo: 'Order #',
    orderInfo: 'Order info', colOrderNo: 'Order No.', colType: 'Type', colQq: 'Client QQ', colName: 'Nickname',
    colPriority: 'Priority', colSource: 'Source', colTime: 'Order time', colDesc: 'Description',
    confirmOrder: 'Accept order', startWip: 'Start work',
    needRevision: 'Needs revision', markDone: '✔ Mark done', uploadDeliver: 'Upload delivery', cancelOrder: 'Cancel order',
    confirmCancel: 'Confirm order cancellation',
    // R-2: second confirmation for cancelling a paid order (amount from backend detail.paidCents)
    cancelPaidConfirm: 'This order has received ¥{amount}. Cancel anyway? Funds must be refunded offline',
    // 815 拍板 #1: cancel with 5-second undo window
    cancelUndoHint: 'Order {label} cancelled. Undo within {s}s',
    cancelUndoBtn: 'Undo',
    cancelUndone: 'Cancellation undone. Order restored',
    cancelUndoExpired: 'Undo window has passed. The order cannot be restored',
    // 815 decision #4: one-time download — artist re-permission
    deliverableLocked: 'Download locked',
    deliverableRepermit: 'Re-permit download',
    deliverableRepermitted: 'Re-permitted. The client can download again',
    noNotes: 'No notes yet', notePlaceholder: 'Add a note...', addNote: 'Add',
    deliverFiles: 'Delivered files', deliverTitle: 'Upload delivery file', dragUpload: 'Drag a file here, or click to upload',
    confirmDeliver: 'Confirm delivery', confirmTitle: 'Confirm',
    statusUpdated: 'Status updated', priorityUpdated: 'Priority updated', noteAdded: 'Note added', deliverSuccess: 'Delivered!',
    // REQ-037 F1: initial load failure error state (self-service retry)
    loadFailed: 'Failed to load order. Please retry.', loadFailedRetry: 'Retry',
    logLoadFailed: 'Failed to load activity log. Please retry.',
    payLoadFailed: 'Failed to load payment records. Please retry.',
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
    stageOff: 'Turn off stage tracking',
    stageProgress: 'Progress {current}/{total}', stageRevision: 'Sent back for revision',
    advanceTo: 'Advance to: ', stageBack: '↩ Send back', stageUpdated: 'Workflow updated',
    stageBackConfirm: 'Send back to "{name}"? The order will be marked as in revision.',
    stageOffConfirm: 'This order will stop following your workflow and fall back to fixed statuses. Continue?',
    stageOffDone: 'Stage tracking turned off',
    gallery: 'Order gallery', galleryUpload: 'Upload', galleryUploadSuccess: 'Image added',
    setFocus: 'Set as focus image',
    openViewer: 'View reference image {n}',
    galleryHint: 'Click an image to preview · Click ✓ to set focus · Drag / click / Ctrl+V to upload · Up to 20 images total (client + artist)',
    galleryNotImage: 'Only image files are supported', galleryTooBig: 'Image exceeds the 10MB limit',
    uploading: 'Uploading...', sourceClient: 'Client', sourceArtist: 'Artist',
    noteImage: 'Note attachment', noteImageSingle: 'Notes support only 1 attachment. The first image was used.',
    noteImageUpload: 'Upload note attachment', viewNoteImage: 'View enlarged note attachment',
    // R39: status area rework (plan B)
    lastActivity: 'Last activity: {time}',
    noteCount: '{n} notes', refCount: '{n} references',
    enableTrackingHint: 'Enable workflow tracking for fine-grained progress management',
    enableTracking: 'Enable', trackingEnabled: 'Workflow tracking enabled',
    slideToCancel: 'Slide to cancel order',
    completedAt: 'Completed at {time}',
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
    colDeadline: 'Deadline', deadlinePlaceholder: 'Pick a deadline',
    // v0.26 B: start date
    colStartDate: 'Start Date', startDatePlaceholder: 'Pick a start date',
    deadlineAutoSet: 'Deadline auto-set based on turnaround days',
    // v0.38: merged date card (REQ-026 §四) — two fields in one card + "schedule synced" + days-left chip
    dateCardTitle: 'Dates',
    deadlineSavedSync: 'Deadline saved, schedule synced',
    startDateSavedSync: 'Start date saved, schedule synced',
    daysLeft: '{n} days left', daysOverdue: '{n} days overdue', daysToday: 'Due today',
    dateSyncNote: 'Date changes sync to the calendar and timeline views',
    // R58-6: QQ jump + copy
    jumpQq: 'Open QQ', copyQq: 'Copy QQ', qqCopied: 'Client QQ copied',
    // F1: artist resends the client tracking link (new token invalidates the old one)
    copyTrackLink: 'Copy client tracking link',
    regenerateTokenConfirm: 'Regenerating will immediately invalidate the old link the client saved. Generate a new link?',
    regenerateTokenConfirmBtn: 'Generate new link',
    regenerateTokenSuccess: 'New tracking link copied (old link is now invalid)',
    regenerateTokenFailed: 'Failed to generate — please try again later',
    // plan-node-speech: client communication block
    commTitle: 'Client Communication',
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
    paymentRevertNote: 'Revoke #{id}',
    // Payment amount frontend validation (mirrors backend addPayment rules; negative = refund/revocation)
    payAmountInvalid: 'Payment amount must be greater than 0',
    payAmountZero: 'Amount cannot be zero', payRefundNoteRequired: 'Please enter a reason when refunding or revoking a payment.', payRefundExceed: 'Refund cannot exceed the amount already paid ¥{amount}',
    // v0.31 F4: node payments
    payNodePaid: 'Paid', payNodeDue: 'Due', payNodeRemain: 'Remaining',
    payNodeCollect: 'Collect', payNodeTitle: 'Collect for "{name}"',
    nodePayNoteFallback: '{name} payment',
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
    },
    // REQ-031 B1: finish share
    shareBtn: 'Share',
    shareDialogTitle: 'Share Artwork',
    sharePlatformLabel: 'Platform',
    shareTextLabel: 'Share Text',
    shareTextPlaceholder: 'Write something (placeholders allowed)',
    sharePlaceholders: 'Available placeholders',
    shareTemplate: 'New art just dropped! Order {orderNo} delivered~ Come check it out 🎉 Homepage: {homepage}',
    shareOpenBtn: 'Open Publish Page',
    shareOpened: 'Publish page opened in a new tab',
    shareCopied: 'Text copied — paste it on the publish page',
    shareNoHomepage: 'Text contains {homepage} but no homepage link for this platform was found — add one in Page Settings first',
    // Wave 3-2: share platform list load-failure error state + retry
    shareLoadFailed: 'Failed to load share platforms. Please retry.'
  },
  manualOrder: {
    title: 'Manual Entry', hint: 'After the client contacts you on QQ, record the order here manually.',
    leftTitle: 'What the client said', rightTitle: 'How to record',
    clientQq: 'Client QQ', clientQqPlaceholder: "Client's QQ number",
    clientName: 'Client nickname (optional)', clientNamePlaceholder: 'What to call the client',
    addons: 'Add-ons',
    usage: 'Usage', rush: 'Rush',
    totalPrice: 'Total', finalPrice: 'Final price (CNY)', finalPriceHint: 'Editable; leave blank to use calculated price',
    priceDetail: 'Details',
    desc: 'Description', descPlaceholder: "Paste the client's request from the QQ chat",
    references: 'Reference images (optional, up to 5, ≤10MB each)', refExceed: 'Max 5 reference images', fileTooBig: '{name} too large ({size}MB), max 10MB',
    refTip: 'You can add more references to the order gallery after creation. Gallery total limit: 20 images.',
    // G-7 (P2-13): reference upload credential unavailable (anon-token issuance network failure)
    anonTokenRequired: 'Failed to obtain the upload credential. Please check your network and retry.',
    priority: 'Priority', priorityHigh: 'High', priorityMedium: 'Medium (default)', priorityLow: 'Low',
    clientNotify: 'Allow client to receive QQ queue notifications',
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
    // REQ-035 batch A: client info card summary copy
    clientSummaryOrders: '{n} orders',
    clientSummaryPaid: 'Total ¥{amount}',
    clientSummaryLast: 'Last {date}',
    // v0.38 D路: 画风模式（画风→尺寸→增项 三级选择）
    styleTitle: 'Choose Style', sizeTitle: 'Choose Size', sizeDays: '{n} days',
    noSizes: 'No sizes available for this style',
    // v0.38 补漏批: R2 自定义单提示 / R5 自定义增项 / R6 图片开关
    customHint: 'You can skip all selections and enter a custom price manually',
    showImages: 'Show images',
    customAddons: 'Custom add-ons', addCustomAddon: 'Add',
    customAddonNamePlaceholder: 'Name (required, ≤50 chars)',
    customAddonPricePlaceholder: 'Amount (negative allowed)',
    customAddonNameRequired: 'Please enter a custom add-on name',
    customAddonPriceRequired: 'Please enter a custom add-on amount',
    removeCustomAddon: 'Remove custom add-on',
    customAddonMax: 'Up to 20 custom add-ons allowed',
    selectSizeOrPrice: 'Select a style and size first, or enter a custom final price',
    // F6: manual order draft (localStorage + restore prompt)
    draftFound: 'Found an unsaved manual order draft. Restore it?',
    draftRestored: 'Draft restored',
    // REQ-037 E3: explicit restore/discard draft button copy
    draftRestore: 'Restore', draftDiscard: 'Discard draft',
    // inspection fix batch A1: post-create write-back failure messages
    postCreateFailed: {
      price: 'Failed to write price: {message}',
      extraItem: 'Failed to write custom add-on "{name}": {message}',
      deadline: 'Failed to write deadline: {message}',
      startDate: 'Failed to write start date: {message}',
      initialStatus: 'Failed to set initial stage: {message}',
      summary: 'Order {orderNo} was created, but {reason}. Please complete it in the order details.'
    },
    // REQ-035 §五 MVP-1: paste message parser
    parseMessageTitle: 'Paste Message to Parse',
    parseDialogTitle: 'Paste Message to Parse',
    parsePlaceholder: 'Paste the client message — QQ number and hints are detected automatically…',
    parseBtn: 'Parse',
    parseQqLabel: 'Client QQ',
    parseQqEmpty: 'Not detected (leave blank and fill in manually)',
    parseAmountLabel: 'Amount hint',
    parseAmountValue: '{amount} CNY',
    parseDeadlineLabel: 'Deadline hint',
    parseNone: 'None',
    parseConfirmTip: 'Amount and deadline are hints only — never auto-filled. Please review before filling in.',
    parseApply: 'Fill into form',
    parseApplied: 'Filled into the form — please review before submitting',
    // Wave 3-2: init failure error state (pricing unavailable when subdomain is missing)
    initLoadFailed: 'Failed to load order-entry data. Pricing and style features may be unavailable. Please retry.'
  },
  tiers: {
    title: 'Pricing',
    dragHint: 'Drag to reorder', reorderSaved: 'Order saved',
    daysUnit: '{n} days',
    // #10: tier visibility
    // R55: example image drag-and-drop
    // R54: card layout empty state
    // v0.28 T3: tab labels + action text i18n
    tabWorkflow: 'Workflow & Payment',
    tabDiscount: 'Discount Codes',
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
    empty: 'No discount codes yet. Click "New Code" to create one.',
    // 05D-T2: inline copy
    copyCode: 'Copy', copied: 'Copied to clipboard', copyFailed: 'Copy failed, please copy manually'
  },
  // v0.32 REQ-023 Phase1: art styles + addon templates
  styleManage: {
    tabTemplates: 'Addon Library', confirmTitle: 'Confirm',
    // Addon templates (SPEC-PRICE-2: full category/control/pricing/max-qty management)
    tplIntro: 'The addon library is the single place to manage all price items (regular addons, usage, rush); then attach them to styles on the Styles & Pricing page.',
    tplName: 'Name', tplControl: 'Control', tplDefaultPrice: 'Default price', tplActions: 'Actions',
    tplCategory: 'Category', tplCategoryLabel: 'Category', tplMaxQty: 'Max qty', tplMaxQtyLabel: 'Max quantity (anti-abuse for quantity type)',
    tplEmpty: 'No addon templates yet. Click "New Addon" to create one.', tplAdd: '+ New Addon',
    tplAddTitle: 'New Addon', tplEditTitle: 'Edit Addon',
    tplNameLabel: 'Name', tplNamePlaceholder: 'e.g. Extra person, Background, Commercial use, Rush', tplNameRequired: 'Please enter a name',
    tplControlLabel: 'Control type', tplControlSwitch: 'Switch', tplControlQuantity: 'Quantity',
    tplPricingLabel: 'Pricing mode', tplPricingFixed: 'Fixed amount ¥', tplPricingPercent: 'Percentage +%',
    tplPriceLabel: 'Default price',
    tplUnitLabel: 'Unit label', tplUnitPlaceholder: 'e.g. person, sheet, item',
    tplSaved: 'Addon saved', tplDeleted: 'Addon deleted', tplDeleteConfirm: 'Delete addon "{name}"? Styles using it keep it as a standalone addon (no longer follows library updates).',
    // Wave 3-2: template list load-failure error state (don't mislead as "no templates")
    tplLoadFailed: 'Failed to load add-on templates. Please retry.',
    unitDefault: 'item',
    // 813-fq-tail-shared wave S: fallback unit label for quantity add-ons without a unit (replaces the hardcoded Chinese in money.js)
    unitFallback: 'unit',
    // Art styles
    styleAddTitle: 'New Style', styleEditTitle: 'Edit Style',
    styleNameLabel: 'Style name', styleNamePlaceholder: 'e.g. Anime, Painterly, Pixel art', styleNameRequired: 'Please enter a style name',
    styleDescLabel: 'Description (optional)', styleDescPlaceholder: 'What style or scenarios it suits',
    styleCoverLabel: 'Cover image (optional)', styleCoverUpload: 'Upload cover', styleCoverChange: 'Change cover',
    styleImportAddons: 'Import all addons from library', styleImportHint: 'When checked, every addon in the library is imported into this style (enabled by default, adjustable per item).',
    styleSaved: 'Style saved', styleDeleted: 'Style deleted', styleDeleteConfirm: 'Delete style "{name}"? All its sizes, addon configs and overrides will be removed too.',
    styleActive: 'Active', styleEmpty: 'No styles yet. Click "New Style" to start configuring.',
    // 812-B B7: empty-state guidance for no styles
    styleEmptyGuide: 'Create your first art style with sizes so clients can start commissioning.',
    styleEmptyCta: 'Create my first style',
    // Sizes
    sizeTitle: 'Sizes & base prices', sizeName: 'Size', sizePrice: 'Base price',
    sizeNamePlaceholder: 'e.g. Avatar, Half-body, Full-body', sizeNameRequired: 'Please enter a size name',
    sizeSaved: 'Size saved', sizeAdded: 'Size added', sizeDeleted: 'Size deleted',
    sizeDeleteConfirm: 'Delete size "{name}"? Its override configs will be removed too.',
    // Addons
    addonTitle: 'Addons (imported from library)',
    addonSaved: 'Addon config saved',
    // Size overrides
    // v0.35 wave 1 (REQ-024 F2/F1): merged entry + multi-style switch + size edit extension
    tabStylesAndPricing: 'Styles & Pricing',
    multiStyle: 'Multi-style',
    multiStyleHintOff: 'Off: clients only see the default style (the top active one); others stay greyed out — click "Set as default" to switch',
    multiStyleHintOn: 'On: all active styles are visible to clients; drag cards to reorder',
    toolbarStatusOn: 'All active styles visible',
    toolbarStatusOff: 'Clients see default style only',
    multiStyleLastGuard: 'Only one active style remains — multi-style cannot be turned off',
    createStyleBtn: 'New Style',
    setAsDefault: 'Set as default',
    defaultChanged: 'Set as default and moved to the top',
    poolRowEmpty: 'None',
    styleLocked: 'Multi-style switch is off — only the default style is editable',
    styleDefaultTag: 'Default',
    sizeAddTitle: 'Add size', sizeEditTitle: 'Edit size',
    sizeImageLabel: 'Size image (optional)', sizeImageUpload: 'Upload new image', sizeImagePick: 'Pick from portfolio',
    sizeImageRemove: 'Remove image', sizeImageHint: 'If not set, clients see the style cover as fallback',
    sizeImageSavedMsg: 'Size image updated', sizeImageUploadHint: 'Size image uploaded — click Save to apply',
    sizeDescLabel: 'Description (optional)', sizeDescPlaceholder: 'What this size includes / suits',
    sizeDaysLabel: 'Turnaround (days, optional)',
    sizeFromArtworkTag: 'Portfolio', sizeAddBtn: '+ Add size', sizeEmpty: 'No sizes yet',
    sizePickTitle: 'Pick from portfolio', sizePickHint: 'Click an artwork to use it as the size image', sizePickEmpty: 'No artworks yet — upload some in Portfolio first',
    // v0.35 fix A4: import addons into an existing style
    addonImportTitle: 'Import from addon library',
    addonImportEmpty: 'No new addons to import (all library addons are already in this style)',
    addonImportConfirm: 'Import selected', addonImported: 'Addons imported',
    // REQ-036 Batch A: intuitive addon interactions (dual entry / pool+drag / tri-state / 3-layer dialog / preview / summary)
    // Dual entry
    addonCreateBtn: '+ New Addon', addonPickBtn: '+ Pick Existing',
    // Pool
    addonCapHint: 'Click to configure / drag to a size row to enable',
    addonAlreadyEnabled: '"{name}" is already enabled on "{size}" - no need to drag again',
    addonEnabled: 'Enabled: {size} + {name}',
    addonDisabled: 'Disabled: {size} - {name}',
    addonDragBackHint: 'Drag back to pool to disable',
    // Create addon dialog
    createTitle: 'New Addon', createNameLabel: 'Addon name', createNamePlaceholder: 'e.g. Background, Extra person, Commercial use, Rush...',
    // SPEC-PRICE-2 (2026-08-09): category = real backend dimension (regular addon / usage / rush)
    catAdd: 'Add-on', catUsage: 'Usage', catRush: 'Rush',
    createKindLabel: 'Category',
    createCatHintAdd: 'Regular addons add to the base price and can be combined; percent-priced ones are computed on the base price only',
    createCatHintMultiplier: 'Usage/Rush are multiplier slots in the formula: pick at most one of each when ordering, applied after the add-ons subtotal (switch control + percentage)',
    createControlLabel: 'Control type (how clients choose)',
    createPricingLabel: 'Pricing mode', pricingPercent: 'Percentage +%', pricingFixed: 'Fixed amount ¥',
    pricingHintFixed: 'Fixed amount: adds ¥N directly; quantity type = unit price x quantity',
    pricingHintPercent: 'Percentage: computed on the base price only, e.g. 50 = base price x 50%',
    createPercentLabel: 'Percent (%)', createPercentRangeHint: 'Percent must be an integer between 0 and 1000',
    createUnitLabel: 'Unit', createUnitPlaceholder: 'e.g. person, sheet, item',
    createMaxQtyLabel: 'Max quantity (anti-abuse)', createMaxQtyHint: 'Max units a client can add, e.g. 10',
    createPriceLabel: 'Default price (¥)',
    createSaveHint: 'On save it attaches to this style and is stored in the library for reuse; duplicate names are confirmed first',
    createSaveBtn: 'Save + Attach', createNameRequired: 'Please enter an addon name',
    createDuplicateTitle: 'Name exists in library', createDuplicateMsg: '"{name}" already exists in the library. Attach it directly, or create a separate one?',
    createAttach: 'Attach', createNew: 'Create separate', createAttached: 'Attached library template',
    addonCreatedAttached: 'Created and attached to this style', addonAttached: 'Attached to this style',
    // 3-layer settings dialog
    addonDialogTitle: '"{name}" Settings', addonTplLevel: 'Template level (base price - affects every style using it)',
    addonScopeStyle: 'This style only', addonScopeAll: 'Apply to all styles',
    addonScopeHintStyle: 'Base edits (name/control/base price) only affect this style on save',
    addonScopeHintAll: 'Base edits affect every style using this addon on save',
    addonStyleLevel: 'Style level (this style)', addonStyleEnable: 'Active in this style',
    addonStylePriceOverride: 'Style price (overrides template): {price}', addonStylePriceTemplate: 'Follows template price: {price}',
    addonSizeLevel: 'Size level (precise version of drag)', addonBatchAll: 'Enable all', addonBatchOff: 'Disable all',
    addonBatchHint: 'Empty diff price = use style price', addonSizeCol: 'Size', addonEnableCol: 'Enable', addonDiffPriceCol: 'Diff price for this size',
    addonPricePriority: 'Price priority: this size > style > template',
    addonRemove: 'Remove (unbind from this style)',
    addonRemoveConfirm: 'Remove "{name}" from this style? It stays in the library and can be picked again later.', addonRemoved: 'Removed (unbound)',
    // Preview dialog (SPEC-PRICE-2 formula: (base + fixed addons + percent addons[base only]) x usage x rush - discount)
    previewBtn: 'Preview', previewTitle: 'Customer Preview', previewReadonly: 'Read-only preview - what customers see',
    previewComposition: 'Price breakdown', previewBase: 'Base ({name})', previewEmpty: 'No addons enabled for this size',
    previewQtyEstimate: 'Estimated at x1 - quantity chosen when ordering', previewPctOfBase: 'Computed on base price',
    previewSubtotal: 'Subtotal (base + addons)',
    previewUsageLabel: 'Usage (pick one)', previewRushLabel: 'Rush (pick one)',
    previewMultHint: 'Usage/Rush are chosen by the client when ordering (one of each) and multiply the subtotal; not included above.',
    previewFormula: 'Formula: (base + fixed addons + percent addons) x usage x rush - discount; percent addons are computed on the base price only',
    previewClose: 'Close', previewStatusOpen: 'Open', previewStatusShow: 'Displaying - visible but not bookable', previewStatusClose: 'Closed - hidden from customers',
    // Size tri-state
    sizeStatusOpen: 'Open', sizeStatusShow: 'Display', sizeStatusClose: 'Closed',
    styleInactiveTag: 'Inactive',
    // Size summary line
    sizeSummaryLabel: 'Addons', sizeSummaryEmpty: 'No addons enabled (drag from pool above)'
  },
  artworks: {
    title: 'Portfolio', dragUpload: 'Drag images here, or click to upload',
    tip: 'JPG / PNG / WebP supported; ≥ 800px recommended', empty: 'No artworks yet — upload some!',
    uploaded: 'Uploaded', confirmDelete: 'Delete this artwork?', image: 'Artwork image',
    // R45: multi-select delete
    manage: 'Manage', manageDone: 'Done',
    selected: '{n} selected',
    batchDeleteTitle: 'Batch delete', batchDeleteConfirm: 'Delete {n} selected artworks? This cannot be undone.',
    batchDeleted: '{n} artworks deleted', batchPartial: 'Deletion complete: {ok} deleted, {failed} failed',
    slideToDelete: 'Slide to confirm deletion', batchDeleteBtn: 'Confirm deletion of selected artworks',
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
    hint: 'Edit the commission guidelines clients must read before ordering. HTML tags supported.',
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
    tabRules: 'Rules', tabWorkflow: 'Workflow & Payment',
    // BUG-7: load-failure protection (prevent default/empty values overwriting real settings)
    loadFailedTitle: 'Failed to load settings', loadFailedDesc: 'The form currently holds default values. Saving now would overwrite your real settings. Retry loading first, then edit and save.',
    loadFailedHint: 'Settings have not loaded yet. Please retry before saving.',
    rulesLoadFailed: 'Failed to load rules. Saving is disabled to avoid overwriting existing rules.', retry: 'Retry',
    // #3: quick actions config
    quickTitle: 'Quick Actions', quickLabel: 'Dashboard quick buttons (3-9)',
    quickHint: 'Check the buttons you want, then save. The dashboard quick area will follow.',
    quickSave: 'Save quick actions', quickSaved: 'Quick actions saved', quickLimitError: 'Please select 3-9 quick actions',
    quickActionBadge: '⚡Action',
    quickLocalFallback: 'Saved locally (server unavailable, will sync on next visit)',
    nameLabel: 'Artist name', bioLabel: 'Bio', bioPlaceholder: 'Introduce yourself',
    codeLabel: 'Artist code (order prefix)', codePlaceholder: 'e.g. ALICE, QY (2-10 uppercase letters/digits)',
    codeHint: 'Used as the order number prefix (e.g. ALICE-001). Changes apply to new orders only.',
    statusLabel: 'Page status', statusOpen: 'Open', statusFull: 'Full', statusBreak: 'On break', statusHidden: 'Hidden',
    // 812-B B2+B3: standalone shop-visibility switch (semantics = whether status is hidden)
    shopVisibleLabel: 'Shop visibility', shopVisibleOn: 'Visible', shopVisibleOff: 'Hidden',
    shopVisibleHint: 'When on, clients can find your shop in the directory and visit your page. When off, your shop is hidden from the public.',
    shopHiddenNotice: 'Your shop is currently hidden — clients cannot find it in the directory or visit your page.',
    linksLabel: 'Links (shown on public page)', addLink: 'Add link',
    moveLinkUp: 'Move link up', moveLinkDown: 'Move link down', removeLink: 'Remove link',
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
    autoPromote: 'Auto-promote (when a formal slot opens, automatically move the earliest buffer order in)',
    hideQueuePosition: 'Hide queue position from clients (only show "In queue")',
    hidePromoteNotify: 'Do not notify clients on promotion',
    bufferShortForm: 'Short-form mode for buffer orders (board shows key info only)',
    bufferSwitchHint: 'These switches only take effect when buffer slots exist.',
    contactQqLabel: 'Contact QQ (visible to clients)', contactQqPlaceholder: 'Leave blank to hide contact QQ',
    contactQqHint: 'Clients who forgot their order number will see this QQ to contact you; leave blank to hide it',
    notifyLabel: 'Client QQ notifications', notifyText: 'Allow clients to receive queue/completion notifications',
    notifyPanelTitle: 'Notifications & Panel',
    defaultPanelLabel: 'Dashboard default panel', defaultPanelHint: 'Shortcut shown when entering the dashboard',
 dashModulesLabel: 'Dashboard modules',
 dashModulesHint: 'Hidden modules disappear from the dashboard; re-enable anytime.',
 dashModuleSchedule: 'Schedule scroll',
 dashModuleGuestbook: 'Guestbook review',
 dashModuleActivity: 'Order activity',
 dashModuleOnboarding: 'Getting started',
    announcementLabel: 'Homepage announcement', announcementPlaceholder: 'e.g.: On break this week, back on Monday',
    announcementHint: 'Shown above the fold on your public page (max 500 chars). Leave empty to hide.',
    announcementExpiresLabel: 'Auto-hide date (optional)', announcementExpiresHint: 'The announcement disappears automatically after this date. Leave unset to keep it indefinitely.',
    // REQ-018: announcement expiry shortcuts
    save: 'Save settings', saved: 'Settings saved',
    noChanges: 'No changes',
    // R48: avatar upload
    avatarLabel: 'Avatar', avatarHint: 'Click to upload or change (JPG/PNG/WebP, ≤10MB)',
    avatarUpdated: 'Avatar updated', avatarNotImage: 'Only image files are supported', avatarTooBig: 'Image exceeds the 10MB limit',
    // R49: accent color
    accentLabel: 'Accent color', accentHint: 'Button/link/highlight color on your public page, independent of visitor accent choice',
    accentClear: 'Default', accentDarkHint: 'Dark mode auto-brightens, no manual adjustment needed',
    // v0.25 A: Cover management
    coverTitle: 'Cover images (homepage carousel)',
    coverHint: 'Click the star to feature an artwork as a homepage cover. Multiple covers rotate automatically. Click again to remove.',
    coverEmpty: 'No artworks yet — upload artworks first to set covers',
    coverManageLink: 'Manage covers',
    // R50: preview
    previewBtn: 'Preview page',
    // 05D-SE1: unsaved-changes guard on tab switch
    unsavedLeaveTitle: 'Unsaved changes',
    unsavedLeaveTip: 'This tab has unsaved changes that will be lost if you switch. Leave anyway?'
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
  },
  embed: {
  },
  workflow: {
    stageList: 'Workflow Stages', paymentBar: 'Payment Split', overview: 'Full Workflow',
    addPlaceholder: 'New stage name, e.g. "Detailing"', final: 'Final', auto: 'Auto',
    deleteHint: 'Delete this stage?', deletePayHint: 'This stage\'s {pct}% payment will merge into the final payment. Delete?',
    savePayment: 'Save Split', unsaved: 'Unsaved payment changes',
    saved: 'Payment split saved', detached: 'Payment node removed, % merged into final',
    // Batch 4 B10 (option b): backend appends appliesToNewOrdersOnly when active orders exist
    paymentNewOrdersOnly: 'Payment split saved — applies to new orders only (existing orders keep their snapshot)',
    dragHandle: 'Drag to adjust ratio', editPercent: 'Edit payment % for "{name}"', minPercent: 'Ratio cannot be below 5%', finalTooLow: 'Final payment too low to allocate',
    reorderLabel: 'Reorder stages', moveUp: 'Move stage up', moveDown: 'Move stage down', deleteStage: 'Delete stage', dragSort: 'Drag to reorder',
    reset: 'Reset to Default', resetConfirm: 'Reset to default template? All custom stages and payment splits will be overwritten. This cannot be undone.', resetDone: 'Reset to default template',
    descPlaceholder: 'Click to add a note',
    // plan-node-speech: node speech ({客户名} etc. are backend variable tokens — kept in Chinese in both locales)
    // Bug 1: braces are parsed as ICU placeholders by vue-i18n (Chinese is not a valid identifier → crash); escape with {'{'} literals
    speechLabel: 'Speech', speechPlaceholder: "{'{'}客户名{'}'}, your order has reached {'{'}节点名{'}'}.",
    speechSave: 'Save speech', speechSaved: 'Speech saved', speechVarHint: 'Click to insert variable',
    // #8: speech UI improvements (shared variable bar + collapsible preview)
    speechVarCommon: 'Speech variables (click a speech box below, then click a variable to insert)',
    speechVarNoFocus: 'Click a speech editor first',
    speechEmpty: 'No speech yet',
    // b4-11: variable button labels are localized; inserting still writes the backend Chinese token (see StageListView SPEECH_VARS)
    speechVar: {
      clientName: "{'{'}clientName{'}'}",
      clientQq: "{'{'}clientQQ{'}'}",
      orderNo: "{'{'}orderNo{'}'}",
      tierName: "{'{'}tierName{'}'}",
      stageName: "{'{'}stageName{'}'}",
      deadline: "{'{'}deadline{'}'}",
      totalPrice: "{'{'}totalPrice{'}'}",
      paid: "{'{'}paid{'}'}",
      unpaid: "{'{'}unpaid{'}'}"
    },
    // v0.27: random template toggle
    randomTemplate: 'Random', randomTemplateHint: 'Available with multiple speech lines — picks one at random when sending',
    // 05I: admin default workflow (default template has no speech field — block speech save with clear hint)
    templateNoSpeech: 'The default workflow template has no speech texts (each artist edits their own). Speech cannot be saved here.',
    maxInstallments: 'Payment stage limit reached',
    finalCannotDisable: 'The final payment stage cannot disable payment',
    finalCannotDelete: 'The final payment stage cannot be deleted',
    // Wave 3-2: workflow load-failure error state + retry
    loadFailed: 'Failed to load workflow stages. Please retry.',
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
    navGroupOverview: 'Overview', navGroupOps: 'Operations', navGroupConfig: 'Config & Monitor',
    backToAdmin: 'Back to dashboard', panelTitle: 'Admin panel',
    artistCount: 'Artists', totalOrders: 'Total orders', activeOrders: 'Active orders',
    artistList: 'Artist list', manageArtists: 'Manage artists',
    colName: 'Name', colSubdomain: 'Subdomain', colQq: 'QQ No.', colStatus: 'Status', colBio: 'Bio',
    artistManage: 'Artist management', addArtist: '+ Add artist',
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
    greetingPreview: 'Preview',
    greetingColText: 'Greeting', greetingColSlot: 'Time slot', greetingColEnabled: 'Enabled',
    greetingEmpty: 'No greetings yet',
    greetingDeleteConfirm: 'Delete this greeting?',
    slotAny: 'All day', slotMorning: 'Morning', slotAfternoon: 'Afternoon', slotEvening: 'Evening', slotNight: 'Late night',
    // E5 wave 4: latenight pool + configurable special-day pool
    slotLatenight: 'Midnight',
    specialDayTitle: 'Special days',
    specialDayHint: 'On a matching date, greetings bound to that day are drawn first (platform-wide or artist-specific); falls back to the late-night/slot pools when empty or disabled.',
    specialDayColName: 'Name', specialDayColDate: 'Date', specialDayColScope: 'Scope', specialDayColCount: 'Texts',
    specialDayScopeGlobal: 'All artists', specialDayScopeArtist: 'Specific artist',
    specialDayAdd: 'New special day',
    specialDayNameLabel: 'Name', specialDayNamePh: 'e.g. Birthday / Anniversary',
    specialDayDateLabel: 'Date', specialDayDatePh: 'Pick month & day (repeats yearly)',
    specialDayArtistLabel: 'Artist', specialDayArtistPh: 'Select artist',
    specialDayDeleteConfirm: 'Delete special day "{name}"? Its greetings will be removed as well.',
    specialDayEmpty: 'No special days yet',
    specialDayEditGreetings: 'Greetings',
    specialDayGreetingsTitle: 'Greetings for "{name}"',
    specialDayCollapse: 'Collapse',
    specialDayGreetingPh: "Enter the day greeting, use {'{'}name{'}'} for artist name",
    defaultWorkflow: 'Default Workflow Template', defaultWorkflowHint: 'Changes only affect newly registered artists. Existing artists are not affected.',
    resetTemplate: 'Reset to factory default', resetConfirm: 'Restore factory default template? Your custom template will be overwritten.', resetDone: 'Factory default restored',
    manage: 'Manage', artistDetail: 'Artist Detail', pricingHint: 'Pricing is managed by the artist on the Styles & Pricing page; this is a read-only overview',
    artworkHint: 'Artwork images must be uploaded via the artist dashboard. Here you can only view and delete.',
    // P1-B: artwork delete confirmation (includes artwork name)
    artworkDeleteConfirm: 'Delete artwork "{name}"? This cannot be undone.',
    artworkUntitled: 'Untitled artwork',
    greetingTab: 'Greetings',
    greetingGlobalHint: 'Global entries apply to all artists, mixed with per-artist entries when drawing.',
    greetingArtistHint: 'Artist-specific entries only apply to this artist, mixed with global entries when drawing.',
    // v0.45 admin redesign: page subtitles / quick actions (previously misplaced under admin.tracking)
    dashboardSubtitle: 'Platform overview — artists and orders at a glance',
    quickActions: 'Quick actions',
    artistManageSubtitle: 'Manage artist accounts, status and bindings',
    artistSearchPlaceholder: 'Search name / subdomain / QQ / bio',
    artistStatusAll: 'All statuses',
    artistFilterCount: '{n} artist(s) matched',
    artistActions: 'Artist actions',
    platformManageSubtitle: 'Configure social platforms recognized on artist pages',
    trackingSubtitle: 'Tracking events and artist-facing stats visibility',
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
      diskNote: 'for reference only',
      statusOk: 'OK', statusWarn: 'Warning', statusFail: 'Failed',
      emptyHint: 'Click “Run checks” to execute the 8 system checks'
    },
    // REQ-022 F2: social platform management
    platformManage: 'Platform management',
    // 815 batch 3 Route I: system addon templates (artist_id IS NULL)
    addonTemplates: 'System addon templates',
    addonTemplatesSubtitle: 'Manage shared system templates (commercial use / rush, etc.); choose sync or freeze when changing prices',
    addonTemplatesAdd: 'New system template',
    addonTemplatesEdit: 'Edit system template',
    addonTemplatesEmpty: 'No system templates yet',
    addonTemplatesSaved: 'System template saved',
    addonTemplatesDeleted: 'System template deleted',
    addonTemplatesColName: 'Name',
    addonTemplatesColCategory: 'Category',
    addonTemplatesColControl: 'Control',
    addonTemplatesColPricing: 'Pricing',
    addonTemplatesColPrice: 'Price',
    addonTemplatesColSort: 'Order',
    addonTemplatesColReferenced: 'Styles using it',
    addonTemplatesSortLabel: 'Sort order (lower first)',
    addonTemplatesDeleteConfirm: 'Delete system template “{name}”?',
    addonTemplatesDeleteRefConfirm: '{count} style(s) are using this template. After deletion they remain as independent addons (name/price preserved) but no longer follow the template. Delete “{name}”?',
    addonTemplatesSyncLabel: 'Sync to imported artists',
    addonTemplatesSyncHint: 'Unchecked = freeze: imported styles that have not overridden the price get the current template price written to themselves and stop following the template; checked = follow platform-wide: styles without an override automatically use the new price. Rows the artist changed are never touched.',
    addonTemplatesFreezeNote: 'Note: once frozen, that artist’s price no longer follows the template; v1 cannot distinguish a freeze write from an artist’s own change. To restore, ask the artist to edit the price manually in “Styles & Pricing”.',
    platform: {
      colName: 'Platform', colIcon: 'Icon', colDomains: 'Match domains', colOrder: 'Order', colEnabled: 'Enabled',
      add: 'Add platform', edit: 'Edit platform', delete: 'Delete',
      empty: 'No platforms yet',
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
      empty: 'No event data',

    }
  },
  setup: {
    pageTitle: 'Setup Wizard',
    step1Title: 'Welcome to Inkglean',
    step1Desc: 'First-time setup is required. Create your admin account to get started.',
    step1Lang: 'Language',
    // Language switch buttons always show each language's own name (cross-locale constants)
    langZh: '中文', langEn: 'English',
    step1TokenLabel: 'Setup Token',
    step1TokenPlaceholder: 'Enter the setup token',
    step1TokenError: 'Invalid setup token',
    step1Start: 'Get Started',
    step2Title: 'Create Admin Account',
    step2Desc: 'Set up your admin account. The admin has full platform access.',
    step2QqLabel: 'Admin QQ Number',
    step2QqPlaceholder: 'Enter your QQ number',
    step2NameLabel: 'Display Name',
    step2NamePlaceholder: 'Enter your display name',
    step2StudioLabel: 'Also create my artist studio',
    step2StudioNameLabel: 'Studio Name',
    step2StudioNamePlaceholder: 'Enter studio name',
    step2StudioNameDefault: "{name}'s Studio",
    step2StudioSubdomainLabel: 'Studio Subdomain',
    step2StudioSubdomainPlaceholder: 'e.g. myart (lowercase letters/digits/hyphens)',
    step2Submit: 'Create Admin',
    step2QqRequired: 'Please enter your QQ number',
    step2NameRequired: 'Please enter your display name',
    step2SubdomainRequired: 'Please enter a studio subdomain',
    step2SubdomainFormat: 'Subdomain must be 2-20 lowercase letters, digits, or hyphens',
    step3Title: 'Bind Authenticator',
    step3Desc: 'Scan the QR code with your authenticator app, then enter the 6-digit code to verify.',
    step3QrAlt: 'TOTP QR Code',
    step3QrRegenerate: 'Regenerate',
    step3CodeLabel: '6-digit Code',
    // 812 OOBE 实测：原文案太长在输入框内被截断，缩短（标签与上方说明已交代来源）
    step3CodePlaceholder: 'Enter the 6-digit code',
    step3CodeRequired: 'Please enter the 6-digit code',
    step3CodeFormat: 'The code must be 6 digits',
    step3CodeError: 'Invalid code, please try again',
    step3Confirm: 'Verify & Complete Setup',
    step4Title: 'Setup Complete',
    step4Desc: 'Setup is complete! You can now log in and start using the platform.',
    step4Login: 'Go to Login',
    error: 'Something went wrong. Please try again.',
    // 813-fq-tail-shared wave S: store fallback error copy i18n (replaces hardcoded Chinese)
    submitAdminFailed: 'Failed to create admin account',
    confirmTotpFailed: 'Verification failed',
    prevStep: 'Previous',
  },
  // ═══ REQ-042 Compliance & Content Safety (2026-08-11 decision: privacy rights path A — contact the admin) ═══
  compliance: {
    common: {
      backHome: 'Back to home',
      updated: 'Last updated',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      report: 'Report',
      and: 'and',
      agreePrefix: 'I have read and agree to the'
    },
    privacy: {
      pageTitle: 'Privacy Policy',
      updated: '2026-08-15',
      note: 'This policy is a standard template (human-reviewed), not legal advice. The platform will update it when business changes materially.',
      sections: [
        {
          title: '1. Data We Collect',
          paragraphs: ['Inkglean (拾绘) only collects data necessary to provide the commission service:'],
          items: [
            'QQ number (artist/client identification and contact)',
            'Contact information (contact_qq, the artist’s public contact channel)',
            'Order requirements, notes and reference images (required to complete commissions)',
            'Artwork images and final deliverables (artist showcase and delivery)',
            'Browsing behavior (tracking, can be disabled in preferences; logs retained for 180 days)',
            'Passkey public key (for passwordless login; only the public credential is stored)',
            'Deliverable download records (IP and timestamp at download, for dispute evidence of one-time downloads)'
          ]
        },
        {
          title: '2. Purpose of Use',
          paragraphs: [
            'Data is used only for: account login and security, commission communication and delivery, artist homepage display, and platform statistics. The platform does not sell personal data to third parties.'
          ]
        },
        {
          title: '3. Storage Location and Retention',
          paragraphs: [
            'The service currently runs on overseas servers, so data from users in mainland China may involve cross-border data transfer; the platform has made this disclosure in accordance with the PIPL. If the platform moves to domestic hosting, data will remain in-country.',
            'Tracking logs are automatically deleted after 180 days; business data (orders/artworks/messages) is retained while the account exists.'
          ]
        },
        {
          title: '4. Your Rights',
          paragraphs: [
            'You may request to access, correct, copy, delete or receive an explanation of how your personal data is processed. Implementation path: contact the administrator (this platform is currently an individual site; requests are handled manually by the admin).'
          ]
        },
        {
          title: '5. Contact',
          paragraphs: ['For any privacy questions, use the artist’s contact channels on their homepage or the "Report" entry in the footer.']
        },
        {
          title: '6. Legal Basis',
          paragraphs: ['This policy references China’s Personal Information Protection Law (PIPL), Cybersecurity Law, and Data Security Law.']
        }
      ]
    },
    terms: {
      pageTitle: 'Terms of Service & Artist Agreement',
      updated: '2026-08-11',
      note: 'These terms are a standard template (human-reviewed), not legal advice. Transactions are negotiated between artists and clients; the platform does not intervene.',
      sections: [
        {
          title: '1. Platform Role',
          paragraphs: ['Inkglean (拾绘) is a tool platform where artists showcase works and receive commissions. The platform does not participate in negotiation, payment, delivery, or dispute resolution between artists and clients.']
        },
        {
          title: '2. Content Red Lines',
          paragraphs: ['Published content (artworks/messages/homepages/announcements) must not contain:'],
          items: [
            'Illegal information (gambling, drugs, firearms, fraud, fake invoicing, etc.)',
            'Pornography or content involving minors in violation of regulations',
            'Content infringing copyright, portrait rights, reputation or other lawful rights',
            'Any other content that violates Chinese laws and regulations'
          ]
        },
        {
          title: '3. Artist Content Responsibility',
          paragraphs: ['Artists are responsible for all content they upload, including legality, originality and license completeness. The platform manages content on a "publish-first, review-later + report-driven" basis.']
        },
        {
          title: '4. Enforcement Ladder',
          paragraphs: ['The platform handles violations and accounts in escalating steps: warning → content removal → ban. All actions are logged.'],
          items: [
            'Content removal: artwork deletion or message hiding, immediately invisible to clients',
            'Ban: homepage taken down, login rejected, existing sessions invalidated; can be lifted'
          ]
        },
        {
          title: '5. Real-Name Reservation',
          paragraphs: ['When required by law, the platform may implement real-name verification; the specific plan will be announced separately.']
        },
        {
          title: '6. Minor Statement',
          paragraphs: ['This platform serves adults. Minors should use it with guardian consent and guidance; content involving minors must remain lawful and compliant.']
        },
        {
          title: '7. Disclaimer',
          paragraphs: ['The platform is a tool. Transactions are negotiated between artists and clients; the platform does not guarantee delivery quality, does not mediate disputes, and is not liable for losses arising from transactions.']
        }
      ]
    },
    report: {
      title: 'Report',
      hint: 'Reports are submitted anonymously. Please describe the issue truthfully; the platform will process and log it.',
      targetType: 'Report type',
      targetTypeRequired: 'Please choose a report type',
      targetId: 'Target ID (optional)',
      targetIdPlaceholder: 'e.g. artwork/message/artist ID; leave blank if unknown',
      description: 'Description',
      descriptionPlaceholder: 'Describe the issue (up to 1000 characters)',
      descriptionRequired: 'Please describe the issue',
      descriptionLength: 'Description must be 1-1000 characters',
      contact: 'Contact (optional)',
      contactPlaceholder: 'Leave a QQ number or other contact if you want a follow-up',
      submit: 'Submit report',
      submitted: 'Report submitted. Thank you for your feedback',
      submitFailed: 'Submission failed, please try again later',
      rateLimited: 'Too many submissions, please try again later',
      types: {
        artist_home: 'Artist homepage',
        artwork: 'Artwork',
        message: 'Message',
        other: 'Other'
      }
    },
    warning: {
      hit: 'The content may contain sensitive words ({words}). It was published before review, and moderators may remove it.'
    },
    admin: {
      reportManage: 'Reports',
      tabPending: 'Pending',
      tabResolved: 'Resolved',
      colId: 'ID',
      colType: 'Type',
      colTargetId: 'Target ID',
      colDescription: 'Description',
      colContact: 'Contact',
      colCreatedAt: 'Submitted at',
      colActions: 'Actions',
      resolve: 'Resolve',
      resolveConfirm: 'Add a resolution note (optional)',
      resolvedToast: 'Report resolved',
      resolved: 'Resolved',
      removeArtwork: 'Remove artwork',
      removeMessage: 'Remove message',
      removeConfirm: 'Add a removal reason (optional)',
      removedToast: 'Content removed',
      ban: 'Ban artist',
      banConfirm: 'Add a ban reason (optional)',
      bannedToast: 'Artist banned',
      unban: 'Unban artist',
      unbanConfirm: 'Add an unban reason (optional)',
      unbannedToast: 'Artist unbanned',
      bannedTag: 'Banned',
      reasonPlaceholder: 'Reason (optional)',
      empty: 'No reports',
      loadFailed: 'Failed to load reports'
    }
  },

  // REQ-041: Admin step-up verification (session upgrade)
  stepup: {
    title: 'Admin Verification',
    desc: 'For platform security, please verify your admin identity (valid for 30 minutes).',
    codeLabel: 'Auth Code',
    codePlaceholder: '6-digit code from your authenticator',
    codeFormat: 'The code must be 6 digits',
    confirm: 'Verify',
    passkeyVerify: 'Verify with Passkey',
    passkeyVerifying: 'Verifying…',
    error: 'Verification failed, please try again'
  },

  // REQ-039: Invite registration (login onboarding + admin invite management)
  invite: {
    entry: 'No account? Onboard with an invite code',
    title: 'Invite Onboarding',
    subtitle: 'Enter the invite code issued by the admin to create your artist account',
    back: 'Back to Login',
    codeLabel: 'Invite Code',
    codePlaceholder: '8-character invite code',
    qqLabel: 'QQ Number',
    qqPlaceholder: 'Enter your QQ number',
    nameLabel: 'Display Name',
    namePlaceholder: 'Enter your display name',
    subdomainLabel: 'Subdomain',
    subdomainPlaceholder: 'e.g. myart',
    subdomainHint: 'Lowercase letters/digits/hyphens, 2-20 characters',
    submit: 'Start Onboarding',
    submitting: 'Onboarding…',
    step2Title: 'Bind Authenticator',
    step2Desc: 'Scan the QR code with your authenticator app, then enter the 6-digit code to verify.',
    qrAlt: 'TOTP QR Code',
    totpCodeLabel: '6-digit Code',
    totpCodePlaceholder: 'Enter the 6-digit code from your authenticator',
    totpConfirm: 'Verify & Enter Studio',
    confirming: 'Verifying…',
    success: 'Bound successfully, entering studio…',
    codeRequired: 'Please enter the invite code',
    codeFormat: 'Invite code must be 8 letters or digits',
    qqRequired: 'Please enter your QQ number',
    qqInvalid: 'QQ number must be 5-15 digits',
    nameRequired: 'Please enter a display name',
    subdomainRequired: 'Please enter a subdomain',
    subdomainFormat: 'Subdomain must be 2-20 lowercase letters/digits/hyphens',
    totpRequired: 'Please enter the 6-digit code',
    totpFormat: 'The code must be 6 digits',
    totpError: 'Incorrect one-time password, please try again',
    // Admin
    manageTitle: 'Invite Codes',
    manageHint: 'Invite codes are valid for 3 days by default (1-30 days configurable) and can be used once. Share them with artists to onboard.',
    generateTitle: 'Generate Invite Codes',
    countLabel: 'Quantity',
    countHint: '1-50 codes',
    validDaysLabel: 'Valid Days',
    validDaysHint: '1-30 days',
    generateBtn: 'Generate',
    generated: '{count} invite codes generated',
    colCode: 'Invite Code',
    colStatus: 'Status',
    colExpires: 'Expires At',
    colUsedBy: 'Used By',
    colActions: 'Actions',
    statusUnused: 'Unused',
    statusUsed: 'Used',
    statusRevoked: 'Revoked',
    copy: 'Copy',
    copied: 'Copied',
    revoke: 'Revoke',
    revokeConfirm: 'Revoke invite code {code}? This cannot be undone.',
    revoked: 'Invite code revoked',
    empty: 'No invite codes yet. Generate a batch above.'
  },

  // ═══ REQ-043 I2: Onboarding card (hidden by backend markers, no localStorage) ═══
  onboarding: {
    title: 'Getting Started',
    subtitle: 'Three steps to help clients get to know you',
    progress: '{done} / {total} done',
    artwork: 'Upload your first artwork',
    tier: 'Set up styles & pricing',
    share: 'Share your page',
    gotoArtworks: 'Upload',
    gotoTiers: 'Set up',
    shareBtn: 'Copy page link',
    copied: 'Copied',
    dismiss: 'Dismiss'
  },

  // ═══ REQ-043 I4: Platform announcement (zero disturbance: no popup/banner, just a dot) ═══
  announcement: {
    entry: 'Announcement',
    dialogTitle: 'Platform Announcement',
    empty: 'No announcement yet',
    updatedAt: 'Updated {time}',
    admin: {
      manage: 'Announcement Editor',
      hint: 'Publish a single latest announcement; publishing with both fields empty clears it. Artists only see a small entry dot — no intrusive popups.',
      titleLabel: 'Title',
      titlePlaceholder: 'Announcement title (≤100 chars)',
      contentLabel: 'Content',
      contentPlaceholder: 'Announcement content (≤10000 chars)',
      publish: 'Publish',
      published: 'Announcement published'
    }
  },
  // 812 tools wave B: Price card (Web simplified version of REQ-014 F3 commission slip: fill in the template, no free dragging)
  priceCard: {
    title: 'Price Card',
    subtitle: 'Fill in the title, tiers and contact info, then generate a vertical price card PNG or plain text to send to clients',
    titleLabel: 'Card title',
    titlePlaceholder: 'e.g. Avatar · Illustration price list',
    tiersLabel: 'Tiers (3-6 rows)',
    tierNamePlaceholder: 'Tier name, e.g. Half body',
    tierPricePlaceholder: 'Price (CNY)',
    tierNotePlaceholder: 'One-line note (optional)',
    addTier: 'Add row',
    removeTier: 'Remove',
    tierMax: 'Up to 6 rows',
    contactLabel: 'Contact info',
    contactPlaceholder: 'e.g. QQ 123456 · DM for commissions',
    exampleLabel: 'Sample image (optional)',
    exampleHint: 'Pick a local image; a small thumbnail will be placed on the card',
    chooseExample: 'Choose image',
    removeExample: 'Remove',
    previewLabel: 'Preview',
    exportPng: 'Export PNG',
    exporting: 'Generating…',
    copyText: 'Copy text version',
    copied: 'Text version copied',
    copyFailed: 'Copy failed, please copy manually',
    titleRequired: 'Enter a card title first',
    tiersMinRequired: 'Fill in at least 3 complete tiers (name + price)',
    exportFailed: 'Generation failed, please try again later',
    fileTypeError: 'Please choose an image file',
    contactLine: 'Contact: {contact}',
    signText: 'Inkglean',
    sealText: '拾绘'
  },
  // 812 tools wave B: Delivery checklist (self-check before handover)
  deliveryChecklist: {
    title: 'Delivery Checklist',
    subtitle: 'Self-check each item before delivery; all checked means you are good to go',
    progress: '{done}/{total} checked',
    allDone: 'All done — ready to deliver',
    defaults: {
      finishWatermark: 'Final art confirmed via watermark-free preview',
      sourceExport: 'Source file exported in the agreed format',
      signatureConfirmed: 'Signature/credit terms confirmed',
      finalPayment: 'Final payment received',
      deliveryScript: 'Delivery message ready'
    },
    addPlaceholder: 'Add a custom item…',
    add: 'Add',
    remove: 'Delete'
  },
  // 812 tools wave B: Deposit ledger (lightweight ledger, zero linkage with the order system)
  deposit: {
    title: 'Deposit Ledger',
    subtitle: 'Lightweight deposit tracking: pending vs received at a glance, saved only in this browser',
    pendingTotal: 'Pending deposits',
    receivedTotal: 'Received deposits',
    nameLabel: 'Order name',
    namePlaceholder: 'e.g. Xiao Lin · illustration deposit',
    amountLabel: 'Deposit amount (CNY)',
    amountPlaceholder: 'e.g. 128.50',
    statusLabel: 'Status',
    statusPending: 'Pending',
    statusReceived: 'Received',
    dateLabel: 'Date',
    addBtn: 'Add record',
    addSuccess: 'Deposit recorded',
    listTitle: 'Ledger',
    empty: 'No deposit records yet — add your first one',
    delete: 'Delete',
    deleteConfirm: 'Delete this deposit record? This cannot be undone.',
    deleteSuccess: 'Deleted',
    nameRequired: 'Enter an order name',
    amountRequired: 'Enter the deposit amount',
    amountPositive: 'Amount must be greater than 0',
    dateRequired: 'Pick a date'
  },
  // b4-10: message parsing hint display (locale-specific date formats)
  messageParser: {
    deadlineDay: 'before {day}',
    deadlineDate: '{month}/{day}'
  }
}
