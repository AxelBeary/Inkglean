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
    notFound: 'Page Not Found'
  },
  menu: {
    logo: 'HuiYue', dashboard: 'Dashboard', queue: 'Queue Board', orders: 'Orders',
    manualOrder: 'Manual Entry', tiers: 'Pricing', artworks: 'Portfolio',
    rules: 'Guidelines', settings: 'Page Settings', logout: 'Log out'
  },
  landing: {
    title: '🎨 Artist Commission Platform', subtitle: 'Find your favorite artist and start commissioning',
    noBio: 'This artist has not written a bio yet', weibo: 'Weibo', bilibili: 'Bilibili',
    enterHome: 'Visit page →', noArtists: 'No artists have joined yet', loadFailed: 'Failed to load artist list'
  },
  artistHome: {
    weibo: '🔗 My Weibo', bilibili: '📺 My Bilibili', commission: '🎨 Commission me', track: '📋 Track order',
    priceList: '💰 Price list', artworks: '🖼 Portfolio', rules: '📜 Commission guidelines', workflow: '📐 Workflow & Payment',
    aboutDays: '⏱ ~{n} days', loadFailed: 'Artist not found or failed to load',
    statusOpen: '✅ Open for commissions', statusFull: '⏳ Fully booked', statusBreak: '💤 On break',
    about: 'About', navPricing: 'Pricing', navProcess: 'Process', navWork: 'Work',
    heroOpen: 'Open for commissions', heroFull: 'Currently full', heroBreak: 'On break',
    startCommission: 'Start a commission →', trackOrder: 'Track order', howItWorks: 'How it works',
    ctaSubtitle: "Ready to work together? Let's create something amazing.",
    weiboPlain: 'Weibo', bilibiliPlain: 'Bilibili',
    revisionNote: 'Revision policy'
  },
  orderForm: {
    backHome: 'Back to page', title: 'Commission me', tierLabel: 'Select tier', tierPlaceholder: 'Choose a commission type',
    workflowLabel: 'Workflow',
    descLabel: 'Description', descPlaceholder: 'Describe what you want: character features, pose, style, background, etc.',
    refLabel: 'Reference images (optional, up to 5, ≤10MB each)', refExceed: 'Up to 5 reference images',
    qqLabel: 'Your QQ number', qqPlaceholder: 'The artist will contact you via QQ',
    nameLabel: 'Nickname (optional)', namePlaceholder: 'What should we call you',
    notifyLabel: '📩 Notify me on QQ when my turn comes', agreeLabel: '✋ I have read and agree to the guidelines above',
    submit: 'Submit commission', successTitle: 'Commission submitted!', orderNoIs: 'Your order number is: ',
    addQqHint: 'Add the artist on QQ to discuss details — just quote your order number', viewProgress: 'Track progress',
    selectTier: 'Please select a tier', fillQq: 'Please enter your QQ number',
    fileTooBig: 'File "{name}" exceeds the 10MB limit ({size}MB). Please compress and re-upload',
    typeWarning: 'Converting to JPG or WebP is recommended for better previews, but the current format can still be uploaded.',
    loadFailed: 'Failed to load artist info'
  },
  track: {
    backHome: 'Back to page', title: 'Track order', inputPlaceholder: 'Leave blank if you forgot it', search: 'Search',
    orderNo: 'Order No.', orderNoLabel: 'Order number', qqLabel: 'Your QQ number', qqPlaceholder: 'The QQ you used when ordering',
    artist: 'Artist', type: 'Type', status: 'Status', position: 'Queue position',
    positionText: '#{pos} of {total}', orderTime: 'Order time',
    stepSubmitted: 'Submitted', stepConfirmed: 'Confirmed', stepWip: 'In progress', stepDone: 'Done', stepDelivered: 'Delivered',
    deliverables: '📦 Delivered files', otherOrder: 'Track another order', enterQq: 'Please enter your QQ number',
    contactTitle: 'Forgot your order number?', contactDesc: 'Contact the admin or the artist with your QQ number to recover it.',
    contactArtist: 'Artist QQ', contactAdmin: 'Admin QQ', copyQq: 'Copy', copied: 'Copied',
    noOrdersTitle: 'No orders found', noOrdersDesc: 'This QQ number has no orders with this artist. Please double-check the number.',
    noOrdersCountdown: 'Closes in {n}s'
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
    slotMorning: 'Morning', slotAfternoon: 'Afternoon', slotEvening: 'Evening', slotNight: 'Late night'
  },
  queue: {
    title: '📋 Queue Board',
    hint: 'Drag cards to reorder. Order is saved immediately. Priority is a label only and does not affect sorting.',
    confirm: '✅ Confirm', startWip: '🎨 Start work', done: '✔ Complete', deliver: '📦 Deliver', cancel: '❌ Cancel',
    empty: 'Queue is empty — no orders yet', orderUpdated: 'Order updated',
    confirmCancel: 'Cancel order #{no}?', confirmCancelTitle: 'Confirm cancellation', statusUpdated: 'Status updated',
    dragHint: 'Drag to reorder'
  },
  orderList: {
    title: '📦 Order Management', all: 'All',
    colOrderNo: 'Order No.', colType: 'Type', colQq: 'Client QQ', colName: 'Nickname',
    colPriority: 'Priority', colStatus: 'Status', colSource: 'Source', colTime: 'Order time', colActions: 'Actions'
  },
  orderDetail: {
    backToQueue: 'Back to queue', backToList: 'Back to orders', orderNo: 'Order #',
    orderInfo: 'Order info', colOrderNo: 'Order No.', colType: 'Type', colQq: 'Client QQ', colName: 'Nickname',
    colPriority: 'Priority', colSource: 'Source', colTime: 'Order time', colDesc: 'Description',
    statusFlow: 'Status flow', confirmOrder: '✅ Accept order', startWip: '🎨 Start work',
    needRevision: '✏️ Needs revision', markDone: '✔ Mark done', uploadDeliver: '📦 Upload delivery', cancelOrder: '❌ Cancel order',
    references: 'Reference images', notes: 'Notes', noNotes: 'No notes yet', notePlaceholder: 'Add a note...', addNote: 'Add',
    deliverFiles: 'Delivered files', deliverTitle: 'Upload delivery file', dragUpload: 'Drag a file here, or click to upload',
    confirmDeliver: 'Confirm delivery', cancelConfirm: 'Cancel this order?', confirmTitle: 'Confirm',
    statusUpdated: 'Status updated', priorityUpdated: 'Priority updated', noteAdded: 'Note added', deliverSuccess: 'Delivered!',
    uploadTip: 'Images and archives supported, max 50MB per file',
    invalidFileType: 'Unsupported file type. Please upload an image or archive',
    fileTooLarge: 'File too large (max 50MB)', referenceImage: 'Reference image',
    noReferences: 'No reference images', setFocus: 'Set as focus', focusSelected: '✓ Focus',
    focusMode: 'Queue board display', focusOff: 'Off', focusSmall: 'Small', focusLarge: 'Large',
    focusUpdated: 'Focus image updated', focusSelectFirst: 'Select a reference image as focus first'
  },
  manualOrder: {
    title: '✍ Manual Entry', hint: 'After the client contacts you on QQ, record the order here manually.',
    clientQq: 'Client QQ', clientQqPlaceholder: "Client's QQ number",
    clientName: 'Client nickname (optional)', clientNamePlaceholder: 'What to call the client',
    tier: 'Tier', tierPlaceholder: 'Select a tier (optional)',
    desc: 'Description', descPlaceholder: "Paste the client's request from the QQ chat",
    priority: 'Priority', priorityHigh: '🔴 High', priorityMedium: '🟡 Medium (default)', priorityLow: '🟢 Low',
    submit: 'Record order', resultTitle: 'Recorded', orderNo: 'Order No: {no}', addedToQueue: 'Added to the queue',
    viewQueue: 'View queue', continueEntry: 'Enter another', fillClientQq: "Please enter the client's QQ number"
  },
  tiers: {
    title: '💰 Pricing', addTier: '+ Add tier',
    colExample: 'Example', colName: 'Name', colPrice: 'Price', colDays: 'Turnaround', colDesc: 'Description',
    editTitle: 'Edit tier', addTitle: 'Add tier', nameLabel: 'Name',
    namePlaceholder: 'e.g. Headshot, Half-body, Full-body', priceLabel: 'Price (CNY)', daysLabel: 'Turnaround (days)',
    descLabel: 'Description', descPlaceholder: 'Briefly describe what this tier includes', exampleLabel: 'Example image (optional)',
    changeExample: 'Change image', uploadExample: 'Upload image', removeExample: 'Remove',
    exampleUploaded: 'Image uploaded — click Save to apply', fillName: 'Please enter a name',
    confirmDelete: 'Delete tier "{name}"?', daysUnit: '{n} days'
  },
  artworks: {
    title: '🖼 Portfolio', dragUpload: 'Drag images here, or click to upload',
    tip: 'JPG / PNG / WebP supported; ≥ 800px recommended', empty: 'No artworks yet — upload some!',
    uploaded: 'Uploaded', confirmDelete: 'Delete this artwork?', image: 'Artwork image'
  },
  rules: {
    title: '📜 Guidelines Editor', hint: 'Edit the commission guidelines clients must read before ordering. HTML tags supported.',
    placeholder: 'Enter your commission guidelines. HTML tags like <h3>, <ul>, <li>, <strong> are supported',
    preview: 'Preview:', save: 'Save guidelines', saved: 'Guidelines saved'
  },
  settings: {
    title: 'Page Settings', tabProfile: 'Profile', tabTemplate: 'Page Template', tabWorkflow: 'Workflow & Payment',
    nameLabel: 'Artist name', bioLabel: 'Bio', bioPlaceholder: 'Introduce yourself',
    codeLabel: 'Artist code (order prefix)', codePlaceholder: 'e.g. ALICE, QY (2-10 uppercase letters/digits)',
    codeHint: 'Used as the order number prefix (e.g. ALICE-001). Changes apply to new orders only.',
    statusLabel: 'Page status', statusOpen: 'Open', statusFull: 'Full', statusBreak: 'On break',
    weiboLabel: 'Weibo link (optional)', bilibiliLabel: 'Bilibili link (optional)',
    contactQqLabel: 'Contact QQ (visible to clients)', contactQqPlaceholder: 'Leave blank to use your login QQ',
    contactQqHint: 'Clients who forgot their order number will see this QQ to contact you',
    notifyLabel: 'Client QQ notifications', notifyText: 'Allow clients to receive queue/completion notifications',
    save: 'Save settings', saved: 'Settings saved'
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
    greetingArtistHint: 'Artist-specific entries only apply to this artist, mixed with global entries when drawing.'
  }
}
