export default {
  pref: { toLight: 'Switch to light mode', toDark: 'Switch to dark mode' },
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
  menu: {
    logo: '🎨 Studio', dashboard: '📊 Dashboard', queue: '📋 Queue Board', orders: '📦 Orders',
    manualOrder: '✍ Manual Entry', tiers: '💰 Pricing', artworks: '🖼 Portfolio',
    rules: '📜 Guidelines', settings: '⚙ Page Settings', logout: '🚪 Log out'
  },
  landing: {
    title: '🎨 Artist Commission Platform', subtitle: 'Find your favorite artist and start commissioning',
    noBio: 'This artist has not written a bio yet', weibo: 'Weibo', bilibili: 'Bilibili',
    enterHome: 'Visit page →', noArtists: 'No artists have joined yet', loadFailed: 'Failed to load artist list'
  },
  artistHome: {
    weibo: '🔗 My Weibo', bilibili: '📺 My Bilibili', commission: '🎨 Commission me', track: '📋 Track order',
    priceList: '💰 Price list', artworks: '🖼 Portfolio', rules: '📜 Commission guidelines',
    aboutDays: '⏱ ~{n} days', loadFailed: 'Artist not found or failed to load',
    statusOpen: '✅ Open for commissions', statusFull: '⏳ Fully booked', statusBreak: '💤 On break'
  },
  orderForm: {
    backHome: 'Back to page', title: 'Commission me', tierLabel: 'Select tier', tierPlaceholder: 'Choose a commission type',
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
    title: '📊 Dashboard', pendingNew: 'New pending', activeOrders: 'Active orders',
    monthRevenue: 'Revenue this month', totalCompleted: 'Total completed', quickActions: 'Quick actions',
    queueBoard: '📋 Queue Board', manualOrder: '✍ Manual Entry', allOrders: '📦 All Orders', settings: '⚙ Settings',
    currentStatus: 'Current page status', statusUpdated: 'Status updated',
    statusOpen: '✅ Open', statusFull: '⏳ Full', statusBreak: '💤 On break'
  },
  queue: {
    title: '📋 Queue Board',
    hint: 'Drag cards to reorder. A dragged order takes the priority of its target position; the rest shift down automatically.',
    confirm: '✅ Confirm', startWip: '🎨 Start work', done: '✔ Complete', deliver: '📦 Deliver', cancel: '❌ Cancel',
    empty: 'Queue is empty — no orders yet', orderUpdated: 'Order updated',
    confirmCancel: 'Cancel order #{no}?', confirmCancelTitle: 'Confirm cancellation', statusUpdated: 'Status updated'
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
    statusUpdated: 'Status updated', priorityUpdated: 'Priority updated', noteAdded: 'Note added', deliverSuccess: 'Delivered!'
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
    uploaded: 'Uploaded', confirmDelete: 'Delete this artwork?'
  },
  rules: {
    title: '📜 Guidelines Editor', hint: 'Edit the commission guidelines clients must read before ordering. HTML tags supported.',
    placeholder: 'Enter your commission guidelines. HTML tags like <h3>, <ul>, <li>, <strong> are supported',
    preview: 'Preview:', save: 'Save guidelines', saved: 'Guidelines saved'
  },
  settings: {
    title: '⚙ Page Settings', nameLabel: 'Artist name', bioLabel: 'Bio', bioPlaceholder: 'Introduce yourself',
    codeLabel: 'Artist code (order prefix)', codePlaceholder: 'e.g. ALICE, QY (2-10 uppercase letters/digits)',
    codeHint: 'Used as the order number prefix (e.g. ALICE-001). Changes apply to new orders only.',
    statusLabel: 'Page status', statusOpen: '✅ Open', statusFull: '⏳ Full', statusBreak: '💤 On break',
    weiboLabel: 'Weibo link (optional)', bilibiliLabel: 'Bilibili link (optional)',
    contactQqLabel: 'Contact QQ (visible to clients)', contactQqPlaceholder: 'Leave blank to use your login QQ',
    contactQqHint: 'Clients who forgot their order number will see this QQ to contact you',
    notifyLabel: 'Client QQ notifications', notifyText: 'Allow clients to receive queue/completion notifications',
    save: 'Save settings', saved: 'Settings saved'
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
    confirmRemoveTitle: '⚠️ Dangerous action', confirmRemoveBtn: 'Confirm removal'
  }
}
