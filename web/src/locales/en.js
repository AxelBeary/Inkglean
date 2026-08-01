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
    TRACK_ALREADY_ON: 'Workflow tracking is already enabled for this order',
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

    // Upload
    ILLEGAL_FILE_TYPE: 'Illegal file type',
    UNSUPPORTED_FORMAT: 'Unsupported file format',

    // Admin
    ADMIN_VERIFY_FAILED: 'Admin verification failed',

    // General
    NOT_FOUND: 'Resource not found',
    VALIDATION: 'Invalid request parameters',
    INTERNAL: 'Internal server error',
    UNKNOWN: 'Request error'
  },
  pref: { toLight: 'Switch to light mode', toDark: 'Switch to dark mode', theme: 'Theme', base: 'Base', accent: 'Accent', auto: 'Auto', light: 'Light', dark: 'Dark' },
  common: {
    status: { open: 'Open for commissions', full: 'Fully booked', break: 'On break', unknown: 'Unknown' },
    statusShort: { open: 'Open', full: 'Full', break: 'Break' },
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
    confirmDeleteTitle: 'Confirm deletion', uploadFailed: 'Upload failed',
    footer: 'Powered by Artist Commission Platform'
  },
  disclaimer: {
    title: 'Platform notice',
    text: 'This platform only verifies identities and connects both parties. All subsequent communication, payment and delivery happen externally. The platform provides no escrow or arbitration — please assume your own risk.'
  },
  upload: {
    pasteHint: 'Paste images with Ctrl+V',
    pasteNotImage: 'Only image files can be pasted',
    pasteTooMany: 'You can paste up to {max} images at a time',
    pasteTooBig: 'File "{name}" exceeds the {max}MB limit ({size}MB), please compress and try again'
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
    logo: 'HuiYue', dashboard: 'Dashboard', queue: 'Queue Board', orders: 'Orders',
    manualOrder: 'Manual Entry', tiers: 'Pricing', artworks: 'Portfolio',
    rules: 'Guidelines', settings: 'Page Settings', admin: 'Admin', logout: 'Log out',
    collapse: 'Collapse sidebar', expand: 'Expand sidebar', openMenu: 'Open menu'
  },
  landing: {
    title: '🎨 Artist Commission Platform', subtitle: 'Find your favorite artist and start commissioning',
    noBio: 'This artist has not written a bio yet', weibo: 'Weibo', bilibili: 'Bilibili',
    enterHome: 'Visit page →', noArtists: 'No artists have joined yet', loadFailed: 'Failed to load artist list',
    notFoundHint: 'The page you visited does not exist — we took you back to the home page'
  },
  artistHome: {
    weibo: '🔗 My Weibo', bilibili: '📺 My Bilibili', commission: '🎨 Commission me', track: '📋 Track order',
    priceList: '💰 Price list', artworks: '🖼 Portfolio', rules: '📜 Commission guidelines', workflow: '📐 Workflow & Payment',
    aboutDays: '⏱ ~{n} days', loadFailed: 'Artist not found or failed to load', hidden: "This artist's page is currently unavailable",
    statusOpen: '✅ Open for commissions', statusFull: '⏳ Fully booked', statusBreak: '💤 On break',
    about: 'About', navPricing: 'Pricing', navProcess: 'Process', navWork: 'Work',
    heroOpen: 'Open for commissions', heroFull: 'Currently full', heroBreak: 'On break',
    startCommission: 'Start a commission →', trackOrder: 'Track order', howItWorks: 'How it works',
    ctaSubtitle: "Ready to work together? Let's create something amazing.",
    weiboPlain: 'Weibo', bilibiliPlain: 'Bilibili',
    revisionNote: 'Revision policy',
    // R50: preview mode
    previewBanner: 'Preview mode — changes not yet saved'
  },
  orderForm: {
    backHome: 'Back to page', title: 'Commission me', tierLabel: 'Select tier', tierPlaceholder: 'Choose a commission type',
    workflowLabel: 'Workflow',
    descLabel: 'Description', descPlaceholder: 'Describe what you want: character features, pose, style, background, etc.',
    refLabel: 'Reference images (optional, up to 5, ≤10MB each)', refExceed: 'Up to 5 reference images',
    refTip: 'The artist can add more references to the order gallery after you submit. Gallery total limit: 20 images.',
    pricingDetail: 'Price details',
    qqLabel: 'Your QQ number', qqPlaceholder: 'The artist will contact you via QQ',
    nameLabel: 'Nickname (optional)', namePlaceholder: 'What should we call you',
    notifyLabel: '📩 Notify me on QQ when my turn comes', agreeLabel: '✋ I have read and agree to the guidelines above',
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
    summaryTitle: 'SUMMARY', summaryNoTier: 'Pick a tier to see the price here',
    // R58-3: receipt confirmation
    receiptSub: '· COMMISSION SLIP ·', receiptTotal: 'Total', receiptConfirm: 'Confirm order', submitting: 'Submitting…',
    // R58-4: inspiration tags
    inspireHint: '✨ Not sure what to write? Tap a tag to fill it in:',
    // R58-5: copy order summary
    copySummary: 'Copy order info', summaryCopied: 'Order info copied', summaryOrderNo: 'Order No.: '
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
    deliverables: '📦 Delivered files', otherOrder: 'Track another order', enterQq: 'Please enter your QQ number',
    // SPEC-003: price & payments
    priceTitle: '💰 Price breakdown', finalPrice: 'Final price', installmentsTitle: 'Payment schedule', paid: 'Paid', unpaid: 'Unpaid',
    // B7: quota-pool payment progress
    payPaid: 'Paid', payNext: 'Next Due', payRemaining: 'Outstanding', payTotal: 'Total',
    contactTitle: 'Forgot your order number?', contactDesc: 'Contact the admin or the artist with your QQ number to recover it.',
    contactArtist: 'Artist QQ', contactAdmin: 'Admin QQ', copyQq: 'Copy', copied: 'Copied',
    noOrdersTitle: 'No orders found', noOrdersDesc: 'This QQ number has no orders with this artist. Please double-check the number.',
    noOrdersCountdown: 'Closes in {n}s',
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
    empty: 'No messages yet — say something 💬',
    nickname: 'Nickname', nicknamePlaceholder: 'What should we call you',
    content: 'Message', contentPlaceholder: 'Say something to the artist…',
    submit: 'Post',
    pendingHint: 'Submitted — visible once the artist approves',
    rateLimited: 'Posting too fast — please wait a moment',
    artistTag: 'Artist',
    loadMore: 'Load more',
    noMore: 'No more messages'
  },
  delivery: {
    delivered: 'Artwork delivered', notDelivered: 'Artwork not yet delivered',
    orderInfo: 'Order: {no} | Artist: {artist}', download: '⬇ Download', noFiles: 'No delivered files yet'
  },
  login: {
    title: '🎨 Artist login', subtitle: 'Enter your QQ number — a login code will be sent to your QQ',
    qqPlaceholder: 'Enter your QQ number', getCode: 'Get login code', codeSent: 'Login code sent to QQ {qq}',
    codePlaceholder: 'Enter the 6-digit code', login: 'Log in', changeQq: '← Use a different QQ',
    devCode: 'Dev mode login code: {code}', enterQq: 'Please enter your QQ number', enterCode: 'Please enter the login code', loginSuccess: 'Logged in!'
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
    guestbookTitle: '💬 Guestbook moderation', guestbookEmpty: 'No messages',
    guestbookPending: 'Pending', guestbookApproved: 'Approved', guestbookRejected: 'Rejected',
    guestbookApprove: 'Approve', guestbookReject: 'Reject', guestbookReply: 'Reply',
    guestbookReplyPlaceholder: 'Reply to this visitor (≤500 chars)', guestbookReplySave: 'Save reply',
    guestbookApprovedMsg: 'Message approved', guestbookRejectedMsg: 'Message rejected', guestbookRepliedMsg: 'Reply saved',
    // R52: today stats
    todayNewOrders: 'New orders today', todayRevenue: 'Revenue today',
    // R51: deadlines + today's todos
    deadlineCard: '⏰ Due soon', noDeadlines: 'No deadlines coming up 🎉',
    todoCard: "📌 Today's todos", noTodos: 'Nothing pending — enjoy your tea ☕',
    daysLeft: '{n}d left', dueToday: 'Due today',
    // v0.18 dashboard rebuild
    revenueTitle: '📊 Revenue', periodMonth: 'Month', periodQuarter: 'Quarter', periodYear: 'Year',
    revenueOrderCount: '{n} completed', revenueVs: 'vs {label}', revenueError: 'Failed to load revenue data',
    retry: 'Retry',
    todoTitle: "📌 What's next", todoError: 'Failed to load todo list', todoEmpty: 'Nothing pending — take a break 🎨',
    tag_overdue: 'Overdue', tag_dueToday: 'Due today', tag_pending: 'New', tag_revision: 'Revision', tag_inProgress: 'In progress',
    activityTitle: '🕐 Recent activity', activityError: 'Failed to load activity', activityEmpty: 'No recent activity',
    timeJustNow: 'just now', timeMinutesAgo: '{n}m ago', timeHoursAgo: '{n}h ago', timeDaysAgo: '{n}d ago',
    slotTitle: '🎯 Slot overview', slotFormal: 'Formal {used}/{total}', slotBuffer: 'Buffer {used}/{total}',
    slotNext: 'Next in buffer: {name} (QQ: {qq})',
    artworks: 'Gallery', tiers: 'Tiers'
  },
  queue: {
    title: '📋 Queue Board',
    hint: 'Drag cards to reorder. Order is saved immediately. Priority is a label only and does not affect sorting.',
    confirm: '✅ Confirm', startWip: '🎨 Start work', done: '✔ Complete', deliver: '📦 Deliver', cancel: '❌ Cancel',
    empty: 'Queue is empty — no orders yet', orderUpdated: 'Order updated',
    // SPEC-004: buffer zone
    bufferTitle: '🕐 Buffer zone (waitlist)', bufferHint: 'When formal slots are full, new orders wait here. Promoted orders move to the formal queue',
    bufferTag: 'Waitlist', bufferEmpty: 'No waitlist orders in the buffer zone',
    promote: 'Promote', promoted: 'Promoted to formal queue',
    slideToCancel: 'Slide to confirm cancellation', statusUpdated: 'Status updated',
    advanceStage: 'Advance to next stage', stageAdvanced: 'Advanced to next stage',
    dragHint: 'Drag to reorder',
    focusDisplay: 'Focus image', focusOff: 'Off', focusLarge: 'Large',
    uploadFocus: 'Upload focus image',
    // R53: focus image replacement
    dropToReplace: 'Drop to replace focus image'
  },
  orderList: {
    title: '📦 Order Management', all: 'All',
    colOrderNo: 'Order No.', colType: 'Type', colQq: 'Client QQ', colName: 'Nickname',
    colPriority: 'Priority', colStatus: 'Status', colSource: 'Source', colTime: 'Order time', colActions: 'Actions',
    colImage: 'Image'
  },
  orderDetail: {
    backToQueue: 'Back to queue', backToList: 'Back to orders', orderNo: 'Order #',
    orderInfo: 'Order info', colOrderNo: 'Order No.', colType: 'Type', colQq: 'Client QQ', colName: 'Nickname',
    colPriority: 'Priority', colSource: 'Source', colTime: 'Order time', colDesc: 'Description',
    statusFlow: 'Status flow', confirmOrder: '✅ Accept order', startWip: '🎨 Start work',
    needRevision: '✏️ Needs revision', markDone: '✔ Mark done', uploadDeliver: '📦 Upload delivery', cancelOrder: '❌ Cancel order',
    references: 'Reference images', noNotes: 'No notes yet', notePlaceholder: 'Add a note...', addNote: 'Add',
    deliverFiles: 'Delivered files', deliverTitle: 'Upload delivery file', dragUpload: 'Drag a file here, or click to upload',
    confirmDeliver: 'Confirm delivery', cancelConfirm: 'Cancel this order?', confirmTitle: 'Confirm',
    statusUpdated: 'Status updated', priorityUpdated: 'Priority updated', noteAdded: 'Note added', deliverSuccess: 'Delivered!',
    uploadTip: 'Images and archives supported, max 50MB per file',
    invalidFileType: 'Unsupported file type. Please upload an image or archive',
    fileTooLarge: 'File too large (max 50MB)', referenceImage: 'Reference image',
    noReferences: 'No reference images',
    focusUpdated: 'Focus image updated',
    deleteRef: 'Delete reference', deleteRefConfirm: 'Delete this reference image? This cannot be undone.', deleteRefSuccess: 'Reference image deleted',
    focusHint: 'Display size is set globally in the queue board toolbar',
    workflowTitle: '📈 Workflow progress', stageOff: 'Turn off stage tracking',
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
    // R58-6: QQ jump + copy
    jumpQq: 'Open QQ', copyQq: 'Copy QQ', qqCopied: 'Client QQ copied',
    // plan-node-speech: client communication block
    commTitle: 'Client Communication', commQq: 'QQ:',
    commPriceSummary: 'Price: total {total} / paid {paid} / due {unpaid}',
    commCopyBtn: 'Copy text & open QQ', commCopied: 'Speech copied — opening QQ',
    commNoQq: 'No client QQ set', commNoStage: 'Order not on a workflow stage — no speech yet', commNoSpeech: 'No speech for the current stage',
    // B7: 额度池收款区
    payTitle: 'Payment Records', payAddBtn: '+ Record Payment',
    payPaid: 'Received', payFinal: 'Total Due', payRemaining: 'Outstanding',
    payFlowTitle: 'Payment History', payRevoke: 'Revoke', payEmpty: 'No payment records yet',
    payRefTitle: 'Due Reference (Workflow Stages)',
    payRefPaid: 'Paid', payRefPartial: 'Partial {amount}', payRefPending: 'Pending',
    payDialogTitle: 'Record Payment', payAmountLabel: 'Amount (¥)', payAmountPlaceholder: 'Enter amount',
    payNoteLabel: 'Note (optional)', payNotePlaceholder: 'e.g. WeChat transfer, deposit',
    paySuccess: 'Payment recorded', payRevokeConfirm: 'Revoke the {amount} payment record?', payRevokeSuccess: 'Revoked'
  },
  manualOrder: {
    title: '✍ Manual Entry', hint: 'After the client contacts you on QQ, record the order here manually.',
    clientQq: 'Client QQ', clientQqPlaceholder: "Client's QQ number",
    clientName: 'Client nickname (optional)', clientNamePlaceholder: 'What to call the client',
    tier: 'Tier', tierPlaceholder: 'Select a tier (optional)',
    addons: 'Add-ons', multipliers: 'Usage & Rush',
    usage: 'Usage', rush: 'Rush', personal: 'Personal', noRush: 'No rush', inquiry: 'Inquiry',
    totalPrice: 'Total', finalPrice: 'Final price (CNY)', finalPriceHint: 'Editable; leave blank to use calculated price',
    desc: 'Description', descPlaceholder: "Paste the client's request from the QQ chat",
    references: 'Reference images', refExceed: 'Max 5 reference images', fileTooBig: '{name} too large ({size}MB), max 10MB',
    refTip: 'You can add more references to the order gallery after creation. Gallery total limit: 20 images.',
    priority: 'Priority', priorityHigh: '🔴 High', priorityMedium: '🟡 Medium (default)', priorityLow: '🟢 Low',
    clientNotify: 'Allow client to receive QQ queue notifications',
    catExpression: 'Expressions', catOutfit: 'Outfits', catBackground: 'Backgrounds', catWeapon: 'Weapons', catOther: 'Other',
    submit: 'Record order', resultTitle: 'Recorded', orderNo: 'Order No: {no}', addedToQueue: 'Added to the queue',
    viewQueue: 'View queue', continueEntry: 'Enter another', fillClientQq: "Please enter the client's QQ number",
    // R51: deadline
    deadline: 'Deadline (optional)', deadlinePlaceholder: 'Pick a deadline'
  },
  tiers: {
    title: '💰 Pricing', addTier: '+ Add tier',
    colExample: 'Example', colName: 'Name', colPrice: 'Price', colDays: 'Turnaround', colDesc: 'Description',
    editTitle: 'Edit tier', addTitle: 'Add tier', nameLabel: 'Name',
    namePlaceholder: 'e.g. Headshot, Half-body, Full-body', priceLabel: 'Price (CNY)', daysLabel: 'Turnaround (days)',
    descLabel: 'Description', descPlaceholder: 'Briefly describe what this tier includes', exampleLabel: 'Example image (optional)',
    changeExample: 'Change image', uploadExample: 'Upload image', removeExample: 'Remove',
    exampleUploaded: 'Image uploaded — click Save to apply', fillName: 'Please enter a name',
    confirmDelete: 'Delete tier "{name}"?', daysUnit: '{n} days',
    // R55: example image drag-and-drop
    dropToUpload: 'Drop to upload', notImage: 'Only image files are supported', tooBig: 'Image exceeds the 10MB limit',
    overwriteTitle: 'Replace example image', overwriteConfirm: 'This tier already has an example image. The old image cannot be recovered after replacement. Continue?',
    exampleUpdated: 'Example image updated',
    // R54: card layout empty state
    empty: 'No tiers yet'
  },
  artworks: {
    title: '🖼 Portfolio', dragUpload: 'Drag images here, or click to upload',
    tip: 'JPG / PNG / WebP supported; ≥ 800px recommended', empty: 'No artworks yet — upload some!',
    uploaded: 'Uploaded', confirmDelete: 'Delete this artwork?', image: 'Artwork image',
    // R45: multi-select delete
    manage: 'Manage', manageDone: 'Done',
    selected: '{n} selected',
    batchDeleteTitle: 'Batch delete', batchDeleteConfirm: 'Delete {n} selected artworks? This cannot be undone.',
    batchDeleted: '{n} artworks deleted', batchPartial: 'Delete finished: {ok} succeeded, {failed} failed',
    slideToDelete: 'Slide to confirm deletion'
  },
  rules: {
    title: '📜 Guidelines Editor', hint: 'Edit the commission guidelines clients must read before ordering. HTML tags supported.',
    placeholder: 'Enter your commission guidelines. HTML tags like <h3>, <ul>, <li>, <strong> are supported',
    preview: 'Preview:', save: 'Save guidelines', saved: 'Guidelines saved'
  },
  settings: {
    title: 'Page Settings', tabProfile: 'Profile', tabTemplate: 'Page Template', tabWorkflow: 'Workflow & Payment',
    tabRules: 'Rules',
    nameLabel: 'Artist name', bioLabel: 'Bio', bioPlaceholder: 'Introduce yourself',
    codeLabel: 'Artist code (order prefix)', codePlaceholder: 'e.g. ALICE, QY (2-10 uppercase letters/digits)',
    codeHint: 'Used as the order number prefix (e.g. ALICE-001). Changes apply to new orders only.',
    statusLabel: 'Page status', statusOpen: 'Open', statusFull: 'Full', statusBreak: 'On break',
    linksLabel: 'Links (shown on public page)', linkName: 'Name', addLink: 'Add link',
    linksHint: 'Up to 6 links. Changes appear on your public page immediately after saving. Empty rows are not saved.',
    // R58-8: Platform links + inspiration tags
    platformLabel: 'Platform links (shown on public page)', platformAuto: 'Auto-detect',
    platformHint: 'Up to 10 links. Changes appear on your public page immediately after saving. Empty rows are not saved. Platform is auto-detected by default, or can be set manually.',
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
    defaultPanelLabel: 'Dashboard default panel', defaultPanelHint: 'Shortcut shown when entering the dashboard',
    announcementLabel: 'Homepage announcement', announcementPlaceholder: 'e.g.: On break this week, back on Monday',
    announcementHint: 'Shown above the fold on your public page (max 500 chars). Leave empty to hide.',
    announcementExpiresLabel: 'Auto-hide date (optional)', announcementExpiresHint: 'The announcement disappears automatically after this date. Leave unset to keep it indefinitely.',
    save: 'Save settings', saved: 'Settings saved',
    // R48: avatar upload
    avatarLabel: 'Avatar', avatarHint: 'Click to upload or change (JPG/PNG/WebP, ≤10MB)',
    avatarUpdated: 'Avatar updated', avatarNotImage: 'Only image files are supported', avatarTooBig: 'Image exceeds the 10MB limit',
    // R49: accent color
    accentLabel: 'Accent color', accentHint: 'Button/link/highlight color on your public page, independent of visitor accent choice',
    accentClear: 'Default', accentDarkHint: 'Dark mode auto-brightens, no manual adjustment needed',
    // R50: preview
    previewBtn: 'Preview page'
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
    galleryDesc: 'Full-screen artwork opening, plaque-style name, editorial large-small gallery',
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
    copyBtn: '📋 Copy code',
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
    confirmRemoveTitle: '⚠️ Dangerous action', confirmRemoveBtn: 'Confirm removal',
    artistOrders: '📦 Order history', noOrders: 'No orders yet', statusUpdated: 'Status updated',
    // B7: order expand row — payment summary
    payPaid: 'Received', payFinal: 'Total Due', payRemaining: 'Outstanding',
    payRefPaid: 'Paid', payRefPartial: 'Partial', payRefPending: 'Pending', payNoData: 'No payment info',
    transferAdmin: '🔑 Transfer admin', transferTitle: 'Transfer admin account',
    transferStep1Title: 'Verify current admin', transferStep2Title: 'Verify new admin',
    currentAdminQq: 'Current admin QQ', newAdminQq: 'New admin QQ',
    newAdminQqPlaceholder: 'Enter new admin QQ (must be a registered artist)',
    sendCode: 'Send code', codeSent: 'Code sent', enterCode: 'Enter 6-digit code',
    nextStep: 'Next', confirmTransfer: 'Confirm transfer',
    transferSuccess: 'Admin transferred to {name}', adminTag: 'Admin',
    orderColNo: 'Order No.', orderColQq: 'Client QQ', orderColStatus: 'Status',
    orderColType: 'Type', orderColTime: 'Order time',
    greetingManage: 'Greeting Manager', greetingPlaceholder: 'Enter greeting, use {name} for artist name',
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
      title: '🗑 Recycle Bin', empty: 'Empty bin',
      colFile: 'File', colPath: 'Original path', colSize: 'Size', colMovedAt: 'Moved at',
      emptyTitle: 'Empty recycle bin', emptyConfirm: 'Files in the recycle bin will be permanently deleted and cannot be recovered. Empty it?',
      emptied: '{n} files permanently deleted', emptyHint: 'Recycle bin is empty'
    },
    // F4: guestbook management (cross-artist)
    guestbook: {
      title: '💬 Guestbook management', empty: 'No messages',
      colArtist: 'Artist', colNickname: 'Nickname', colContent: 'Content', colStatus: 'Status', colTime: 'Time',
      delete: 'Force delete', deleteConfirm: 'Delete this message? It will no longer appear on the client page.', deleted: 'Message deleted'
    },
    // HC: system health check
    health: {
      title: '🩺 System Health', start: 'Run checks', checking: 'Checking…',
      download: 'Download diagnostic report', refresh: 'Results are not persisted after refresh',
      diskNote: 'for reference only', expandDetail: 'Details',
      statusOk: 'OK', statusWarn: 'Warning', statusFail: 'Failed',
      emptyHint: 'Click “Run checks” to execute the 8 system checks'
    }
  }
}
