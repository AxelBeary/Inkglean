export default {
  errors: {
    // 认证
    NOT_LOGGED_IN: '未登录',
    SESSION_EXPIRED: '登录已过期，请重新登录',
    ACCOUNT_NOT_FOUND: '画师账号不存在',
    ACCOUNT_DISABLED: '账号已被停用',
    TOKEN_REVOKED: '登录状态已失效，请重新登录',
    ADMIN_REQUIRED: '需要管理员权限',
    CODE_INVALID: '登录码错误',
    CODE_EXPIRED: '登录码已过期',
    CODE_TOO_MANY_ATTEMPTS: '尝试次数过多，请重新获取登录码',
    QQ_NOT_REGISTERED: '该 QQ 号未注册为画师',

    // 画师
    ARTIST_NOT_FOUND: '画师不存在',
    NAME_EMPTY: '昵称不能为空',
    CODE_FORMAT: '身份码只能包含大写字母和数字，2-10个字符',
    CODE_TAKEN: '身份码已被使用，请换一个',
    INVALID_STATUS: '无效的主页状态',
    INVALID_URL: '链接必须以 http:// 或 https:// 开头',
    SUBDOMAIN_FORMAT: '子域名只能包含小写字母、数字和连字符，2-20个字符',

    // 流程
    STAGE_NOT_FOUND: '节点不存在',
    STAGE_NAME_EMPTY: '节点名称不能为空',
    FINAL_CANNOT_DISABLE: '尾款节点的收款不可关闭',
    FINAL_CANNOT_DELETE: '尾款节点不可删除',
    TRACK_ALREADY_ON: '该订单已启用流程跟踪',
    NO_WORKFLOW_TEMPLATE: '请先创建工作流模板（至少 1 个节点）',
    FINAL_READONLY: '不能直接修改尾款比例',
    MAX_INSTALLMENTS: '最多 20 期',
    FINAL_TOO_LOW: '尾款比例不足，无法开启新收款节点',
    MIN_STAGES: '至少保留 1 个流程节点',
    REORDER_LENGTH: '排序数组长度不匹配',
    REORDER_INVALID: '排序数组包含无效节点',
    REORDER_DUPLICATE: '排序数组有重复',
    NO_FINAL: '无尾款节点',
    NOT_PAYMENT_STAGE: '不是收款节点',
    BP_TOO_LOW: '比例不能低于 5%',
    BP_TOO_HIGH: '比例过高，尾款不能低于 5%',
    NO_PAYMENT_NODE: '至少需要保留 1 个收款节点',
    SUM_NOT_100: '比例总和必须等于 100%',
    STAGES_RESET_BLOCKED: '有 {count} 个进行中订单，请先完成或关闭流程跟踪后再重置工作流',

    // 订单
    ORDER_NOT_FOUND: '订单不存在',
    ORDER_INVALID_STATUS: '无效状态',
    INVALID_TRANSITION: '不能进行此状态转换',
    DELIVER_WRONG_STATUS: '当前状态不能上传交付文件',
    TIER_NOT_FOUND: '价格档位不存在或不属于该画师',
    ILLEGAL_PATH: '非法路径',
    MISSING_FILE: '缺少文件路径',
    QUEUE_EMPTY: '排序列表不能为空',
    QUEUE_NOT_OWNED: '订单不属于当前队列',
    QUEUE_LENGTH: '排序列表长度与队列不一致',
    QUEUE_DUPLICATE: '排序列表存在重复订单',
    INVALID_PRIORITY: '无效优先级',

    // 备注删除（v0.15 R46）
    NOTE_NOT_FOUND: '备注不存在',
    SYSTEM_NOTE_PROTECTED: '系统备注不可删除',

    // 强调色（v0.15 R49）
    INVALID_ACCENT_COLOR: '无效的强调色',

    // 截稿日（v0.15 R51）
    INVALID_DEADLINE: '截稿日格式无效（须为 ISO 8601）',
    INVALID_START_DATE: '开工日不能晚于截稿日',
    INVALID_ANNOUNCEMENT_DATE: '公告过期日不能早于今天',

    // 上传
    ILLEGAL_FILE_TYPE: '非法文件类型',
    UNSUPPORTED_FORMAT: '不支持此文件格式',

    // 管理员
    ADMIN_VERIFY_FAILED: '管理员验证失败',

    // 通用
    NOT_FOUND: '资源不存在',
    VALIDATION: '请求参数格式不正确',
    INTERNAL: '服务器内部错误',
    UNKNOWN: '请求错误',

    // 折扣码（v0.31 F3）
    DISCOUNT_DISABLED: '该画师未开启折扣码功能',
    DISCOUNT_CODE_INVALID: '折扣码无效',
    DISCOUNT_CODE_EXPIRED: '折扣码已过期',
    DISCOUNT_CODE_EXHAUSTED: '折扣码使用次数已达上限',
    DISCOUNT_CODE_NOT_FOUND: '折扣码不存在',
    DISCOUNT_CODE_TAKEN: '该折扣码已被使用'
  },
  pref: { toLight: '切换到亮色模式', toDark: '切换到暗色模式', theme: '主题设置', base: '底色', accent: '主色', auto: '随系统', light: '亮', dark: '暗' },
  common: {
    status: { open: '可约稿', full: '已排满', break: '休息中', unknown: '未知' },
    statusShort: { open: '可约', full: '排满', break: '休息' },
    priority: { high: '高', medium: '中', low: '低' },
    orderStatus: {
      pending: '待确认', confirmed: '已确认', wip: '制作中', revision: '修改中',
      done: '已完成', delivered: '已交付', cancelled: '已取消', unknown: '未知'
    },
    source: { self: '自助', manual: '手动', clientSelf: '客户自助', manualEntry: '手动录入' },
    custom: '自定义', none: '无',
    save: '保存', cancel: '取消', delete: '删除', edit: '编辑', download: '下载',
    confirm: '确认', detail: '详情', actions: '操作', remove: '移除', add: '添加',
    saved: '保存成功', deleted: '已删除', removed: '已移除',
    confirmDeleteTitle: '确认删除', uploadFailed: '上传失败',
    footer: 'Powered by 画师约稿平台'
  },
  disclaimer: {
    title: '平台职责说明',
    text: '本平台仅协助验证身份与连接双方，所有后续沟通、支付与交付均在外进行。平台不提供托管、仲裁服务，请自行承担风险。'
  },
  upload: {
    pasteHint: '支持 Ctrl+V 粘贴图片',
    pasteNotImage: '仅支持粘贴图片',
    pasteTooMany: '最多粘贴 {max} 张图片',
    pasteTooBig: '文件「{name}」超过 {max}MB 限制（{size}MB），请压缩后重试'
  },
  pageTitle: {
    home: '画师约稿平台',
    artistHome: '画师主页',
    order: '我要约稿',
    track: '查询进度',
    delivery: '下载作品',
    login: '画师登录',
    healthCheck: '系统自检',
    notFound: '页面不存在'
  },
  menu: {
    logo: '绘约', dashboard: '仪表盘', queue: '排期看板', orders: '订单管理',
    manualOrder: '手动录单', tiers: '价格管理', artworks: '作品管理',
    guestbook: '留言管理', slots: '开稿管理',
    preview: '主页预览',
    rules: '须知编辑', settings: '主页设置', preferences: '偏好设置', admin: '管理后台', logout: '退出登录',
    collapse: '收起侧边栏', expand: '展开侧边栏', openMenu: '打开菜单',
    // REQ-016 C: 侧边栏分组标题
    groupWork: '工作', groupBiz: '经营', groupFront: '门面'
  },
  landing: {
    title: '画师约稿平台', subtitle: '找到你喜欢的画师，开始约稿',
    noBio: '这位画师还没有写简介', weibo: '微博', bilibili: 'B站',
    enterHome: '进入主页 →', noArtists: '还没有画师入驻', loadFailed: '加载画师列表失败',
  },
  // v0.34 任务A：独立 404 页
  notFound: {
    message: '你访问的页面不存在或已被移动。',
    backHome: '回平台首页',
    artistsTitle: '或者，去看看这些画师'
  },
  artistHome: {
    weibo: '我的微博', bilibili: '我的B站', commission: '我要约稿', track: '查询进度',
    priceList: '价格表', artworks: '作品展示', rules: '约稿须知', workflow: '约稿流程与收款',
    aboutDays: '约 {n} 天', loadFailed: '画师不存在或加载失败', hidden: '该画师暂未开放主页',
    statusOpen: '可约稿', statusFull: '已排满', statusBreak: '休息中',
    about: '关于', navPricing: '价格', navProcess: '流程', navWork: '作品',
    heroOpen: '接受约稿中', heroFull: '目前已排满', heroBreak: '休息中',
    startCommission: '开始约稿 →', trackOrder: '查询进度', howItWorks: '约稿流程',
    ctaSubtitle: '期待与你一起创作出好作品。',
    weiboPlain: '微博', bilibiliPlain: 'B站',
    revisionNote: '修改说明',
    // #9: 档位展示柜
    tierSelectBtn: '选择此档位', tierShowcase: '暂不接单', tierShowcaseBtn: '暂不接单',
    // R50: 预览模式
    previewBanner: '预览模式 — 修改尚未保存',
    // v0.25 A: 封面精选
    covers: '封面精选',
    // v0.32 REQ-023 Phase3: 多画风价格表
    styleOrderBtn: '选择此画风约稿',
    // v0.34 任务B：尺寸选中后下单引导
    styleSizeHint: '已选 {size} · ¥{price}，点击下方按钮带此选择进入约稿'
  },
  orderForm: {
    backHome: '返回主页', title: '我要约稿', tierLabel: '选择档位', tierPlaceholder: '请选择约稿类型',
    workflowLabel: '约稿流程',
    descLabel: '需求描述', descPlaceholder: '描述你想要的画面：角色特征、姿势、风格、背景等',
    refLabel: '参考图（可选，最多5张，每张≤10MB）', refExceed: '最多上传5张参考图',
    refTip: '下单后画师也可在订单图库中补充参考图，订单图库合计上限 20 张。',
    pricingDetail: '详细计价',
    qqLabel: '你的QQ号', qqPlaceholder: '画师会通过QQ联系你',
    nameLabel: '昵称（可选）', namePlaceholder: '怎么称呼你',
    notifyLabel: '排到我的时候通过QQ通知我', agreeLabel: '我已阅读并同意以上约稿须知',
    submit: '提交约稿', successTitle: '约稿提交成功！', orderNoIs: '你的订单号是：',
    addQqHint: '请添加画师QQ沟通细节，报上你的订单号即可', viewProgress: '查看进度',
    selectTier: '请选择档位', fillQq: '请填写QQ号',
    fileTooBig: '文件「{name}」超过10MB限制（{size}MB），请压缩后重新上传',
    typeWarning: '建议转换为 JPG 或 WebP 格式以获得更好的预览体验，但当前格式也可以正常上传。',
    loadFailed: '加载画师信息失败',
    // R57: 草稿恢复
    draftTitle: '恢复草稿', draftFound: '检测到未提交的草稿，是否恢复？',
    draftRestore: '恢复', draftDiscard: '丢弃', draftRestored: '草稿已恢复',
    // R58-6: QQ 跳转 + 复制
    artistQqLabel: '画师QQ', jumpQq: '跳转QQ', copyQq: '复制QQ', qqCopied: 'QQ号已复制',
    // R58-2: 分步引导
    step1: '选档位', step2: '写需求', step3: '联系方式',
    step1Title: '选择约稿档位', step2Title: '描述你的需求', step3Title: '留下联系方式',
    nextStep: '下一步', prevStep: '上一步',
    summaryTitle: '约稿摘要', summaryNoTier: '选好档位后这里会显示价格',
    // R58-3: 小票二次确认
    receiptSub: '· 约稿确认单 ·', receiptTotal: '合计', receiptConfirm: '确认下单', submitting: '提交中…',
    // R58-4: 灵感标签
    inspireHint: '没想好怎么写？点选灵感标签快速填入：',
    // R58-5: 复制约稿信息
    copySummary: '复制约稿信息', summaryCopied: '约稿信息已复制', summaryOrderNo: '订单号：',
    // v0.31 F3: 折扣码
    discountLabel: '折扣码', discountPlaceholder: '有折扣码？输入试试', discountValidate: '验证',
    discountEstimate: '预估折扣', discountedTotal: '预估折后总价',
    // v0.32 REQ-023 Phase2: 多画风三步走
    styleStep: '选画风', sizeStep: '选尺寸', addonStep: '选增项',
    styleStepTitle: '选择画风', sizeStepTitle: '选择尺寸', addonStepTitle: '增项与加急',
    addonStepEmpty: '该尺寸下暂无可选增项',
    addonOptionPrice: '选项价',
    multiplierLabel: '用途与加急', usageLabel: '用途：', rushLabel: '加急：',
    personal: '个人', noRush: '不加急',
    // v0.35 F4: 入口 A 预选可见横幅（展示柜带选择进来）
    preselectedBoth: '已按主页选择预选：{style} · {size}',
    preselectedStyle: '已预选画风「{style}」，请选择尺寸',
    preselectChange: '修改'
  },
  // R24: 校验失败弹窗
  order: {
    validation: {
      title: '请先完成以下项目',
      confirm: '知道了',
      agreeRequired: '请勾选「我已阅读并同意以上约稿须知」'
    }
  },
  track: {
    backHome: '返回主页', title: '查询进度', inputPlaceholder: '如果不记得请留空', search: '查询',
    orderNo: '订单号', orderNoLabel: '订单号', qqLabel: '你的QQ号', qqPlaceholder: '下单时填写的QQ号',
    artist: '画师', type: '类型', status: '状态', position: '排队位置',
    positionText: '第 {pos} 位 / 共 {total} 位', orderTime: '下单时间',
    stepSubmitted: '已提交', stepConfirmed: '已确认', stepWip: '制作中', stepDone: '已完成', stepDelivered: '已交付',
    deliverables: '交付文件', otherOrder: '查询其他订单', enterQq: '请输入QQ号',
    // SPEC-003: 价格与付款
    priceTitle: '价格明细', finalPrice: '最终价格', installmentsTitle: '付款节点', paid: '已付', unpaid: '未付',
    // B7: 额度池付款进度
    payPaid: '已付', payNext: '下期应付', payRemaining: '待付', payTotal: '总额',
    contactTitle: '不记得订单号？', contactDesc: '请联系管理员或画师，报上你的QQ号即可找回订单。',
    contactArtist: '画师QQ', contactAdmin: '管理员QQ', copyQq: '复制', copied: '已复制',
    noOrdersTitle: '未找到订单', noOrdersDesc: '该QQ号在本画师处没有订单记录，请核对QQ号是否正确。',
    noOrdersCountdown: '{n} 秒后可关闭',
    timeline: {
      title: '制作进度',
      current: '进行中',
      progress: '{name} {current}/{total}',
      revision: '画师打回修改中，进度已回退',
      revisionAt: '已回退到「{name}」',
      notStarted: '订单已提交，等待画师确认后进入制作流程',
      orderedAt: '下单时间：'
    }
  },
  // F4: 留言板（客户端留言墙，共享组件 TplGuestbook）
  guestbook: {
    title: '留言板',
    empty: '还没有留言，来说点什么吧',
    nickname: '昵称', nicknamePlaceholder: '怎么称呼你',
    content: '留言内容', contentPlaceholder: '想对画师说的话…',
    submit: '留言',
    pendingHint: '已提交，等待画师审核后可见',
    rateLimited: '留言太频繁了，请稍后再试',
    artistTag: '画师',
    loadMore: '加载更多',
    noMore: '没有更多了'
  },
  // #1: 画师端留言管理页面
  guestbookManage: {
    title: '留言管理',
    all: '全部',
    replyLabel: '画师回复',
    editReply: '编辑回复',
    rejectConfirm: '确定拒绝这条留言？拒绝后客户主页将不显示。',
    // F8: 语言筛选
    languageAll: '全部语言'
  },
  // v0.35 F6: 客户端画廊筛选 + 大图标签（共享组件 TplGallery）
  gallery: {
    filterAll: '全部',
    filterEmpty: '该档位下暂时没有作品',
    tierTag: '档位',
    prev: '上一张',
    next: '下一张'
  },
  delivery: {
    delivered: '作品已交付', notDelivered: '作品尚未交付',
    orderInfo: '订单号：{no} | 画师：{artist}', download: '下载', noFiles: '暂无交付文件'
  },
  login: {
    title: '画师登录', subtitle: '输入你的QQ号，登录码将发送到你的QQ',
    qqPlaceholder: '输入你的QQ号', getCode: '获取登录码', codeSent: '登录码已发送至 QQ {qq}',
    codePlaceholder: '输入6位登录码', login: '登录', changeQq: '← 换个QQ号',
    devCode: '开发模式登录码: {code}', enterQq: '请输入QQ号', enterCode: '请输入登录码', loginSuccess: '登录成功！'
  },
  dashboard: {
    title: '仪表盘', pendingNew: '待处理新单', activeOrders: '进行中订单',
    monthRevenue: '本月收入', totalCompleted: '累计完成', quickActions: '快捷操作',
    queueBoard: '排期看板', manualOrder: '手动录单', allOrders: '全部订单', settings: '主页设置',
    currentStatus: '当前主页状态', statusUpdated: '状态已更新',
    statusOpen: '可约稿', statusFull: '已排满', statusBreak: '休息中',
    anotherOne: '换一句',
    slotMorning: '清晨', slotAfternoon: '午后', slotEvening: '傍晚', slotNight: '深夜',
    defaultPanel: '默认面板', panelQueue: '排期看板', panelOrders: '订单列表', panelManual: '手动录单', panelTiers: '价格管理',
    // F4: 留言审核
    guestbookTitle: '留言审核', guestbookEmpty: '暂无留言',
    guestbookPending: '待审核', guestbookApproved: '已通过', guestbookRejected: '已拒绝',
    guestbookApprove: '通过', guestbookReject: '拒绝', guestbookReply: '回复',
    guestbookReplyPlaceholder: '回复这位访客（≤500字）', guestbookReplySave: '保存回复',
    guestbookApprovedMsg: '留言已通过', guestbookRejectedMsg: '留言已拒绝', guestbookRepliedMsg: '回复已保存',
    // R52: 今日统计
    todayNewOrders: '今日新增订单', todayRevenue: '今日收入',
    // R51: 截稿日 + 今日待办
    deadlineCard: '即将到期', noDeadlines: '近期无截稿',
    todoCard: '今日待办', noTodos: '暂无待办，喝杯茶吧',
    daysLeft: '剩 {n} 天', dueToday: '今天截稿',
    // v0.18 仪表盘重构
    revenueTitle: '收入统计', periodMonth: '月', periodQuarter: '季', periodYear: '年',
    revenueOrderCount: '{n} 单完成', revenueVs: 'vs {label}', revenueError: '收入数据加载失败',
    retry: '重试',
    todoTitle: '现在要干什么', todoError: '待办列表加载失败', todoEmpty: '当前没有待办，休息一下',
    tag_overdue: '逾期', tag_dueToday: '截稿', tag_pending: '新单', tag_revision: '修改', tag_inProgress: '进行中',
    activityTitle: '最近活动', activityError: '活动记录加载失败', activityEmpty: '暂无最近活动',
    timeJustNow: '刚刚', timeMinutesAgo: '{n} 分钟前', timeHoursAgo: '{n} 小时前', timeDaysAgo: '{n} 天前',
    slotTitle: '名额概览', slotFormal: '正式 {used}/{total}', slotBuffer: '缓冲 {used}/{total}',
    slotNext: '下一位候补：{name}（QQ: {qq}）',
    // #4: 名额概览改版
    slotCombined: '已接 {used}/{total}', slotNotEnabled: '未开启名额限制，去设置 →', slotDisplayFallback: '—',
    artworks: '图库管理', tiers: '档位管理'
  },
  queue: {
    title: '排期看板',
    hint: '拖拽卡片调整顺序，顺序立即保存。优先级仅作标记，不影响排列顺序。',
    confirm: '确认', startWip: '开始制作', done: '✔ 完成', deliver: '交付', cancel: '取消',
    empty: '队列空空，暂无订单', orderUpdated: '排序已更新',
    // SPEC-004: 缓冲区
    bufferTitle: '缓冲区（候补）', bufferHint: '正式位满后新订单在此候补，递补后移入正式队列',
    bufferTag: '候补', bufferEmpty: '缓冲区暂无候补订单',
    promote: '递补', promoted: '已递补到正式队列',
    slideToCancel: '滑动确认取消订单', statusUpdated: '状态已更新',
    advanceStage: '推进到下一节点', stageAdvanced: '已推进到下一节点',
    // P0-3b: 标签切换
    tabFormal: '正式区', tabBuffer: '缓冲区',
    // REQ-013 #7: 工作流 done 订单交付入口 + 完成区
    goDeliver: '去交付',
    completedTitle: '近期已交付', completedHint: '已交付订单在此保留 7 天后自动隐藏',
    completedEmpty: '近期无已交付订单',
    dragHint: '拖拽排序',
    focusDisplay: '焦点图显示', focusOff: '关', focusLarge: '大',
    uploadFocus: '上传焦点图',
    // R53: 焦点图替换
    dropToReplace: '拖入替换焦点图',
    // SPEC-005: 月历视图
    viewBoard: '看板', viewCalendar: '月历', viewTimeline: '时间条',
    calPrev: '上个月', calNext: '下个月', calToday: '今天',
    calTitle: '{y}年{m}月',
    calMon: '一', calTue: '二', calWed: '三', calThu: '四', calFri: '五', calSat: '六', calSun: '日',
    calNoDeadline: '未设截稿',
    calLegendFormal: '正式订单', calLegendBuffer: '缓冲位', calLegendNoDeadline: '未设截稿', calLegendOverdue: '已逾期', calLegendDone: '已完成',
    // v0.25 D: 时间条视图
    tlZoom2w: '两周', tlZoom1m: '一个月', tlZoom2m: '两个月',
    tlEmpty: '可见时间范围内没有订单',
    // v0.28: 时间条拖拽
    tlDragDeadline: '截稿 {d}', tlDragStart: '开工 {d}',
    tlDragMove: '{s} → {e}',
    tlDragSaved: '日期已更新',
    tlDragDeadlineBeforeStart: '截稿日不能早于开工日',
    tlDragStartAfterDeadline: '开工日不能晚于截稿日'
  },
  orderList: {
    title: '订单管理', all: '全部',
    colOrderNo: '订单号', colType: '类型', colQq: '客户QQ', colName: '昵称',
    colPriority: '优先级', colStatus: '状态', colSource: '来源', colTime: '下单时间', colActions: '操作',
    colImage: '图片',
    // REQ-020 F1: 订单搜索
    searchPlaceholder: '搜索昵称 / 订单号 / 档位名', noSearchResult: '无匹配订单'
  },
  orderDetail: {
    backToQueue: '返回排期看板', backToDashboard: '返回仪表盘', backToList: '返回订单列表', orderNo: '订单 #',
    orderInfo: '订单信息', colOrderNo: '订单号', colType: '类型', colQq: '客户QQ', colName: '昵称',
    colPriority: '优先级', colSource: '来源', colTime: '下单时间', colDesc: '需求描述',
    statusFlow: '状态流转', confirmOrder: '确认接单', startWip: '开始制作',
    needRevision: '需要修改', markDone: '✔ 标记完成', uploadDeliver: '上传交付', cancelOrder: '取消订单',
    references: '参考图', noNotes: '暂无备注', notePlaceholder: '添加备注...', addNote: '添加',
    deliverFiles: '交付文件', deliverTitle: '上传交付文件', dragUpload: '拖拽文件到此处，或点击上传',
    confirmDeliver: '确认交付', cancelConfirm: '确定取消此订单？', confirmTitle: '确认',
    statusUpdated: '状态已更新', priorityUpdated: '优先级已更新', noteAdded: '备注已添加', deliverSuccess: '交付成功！',
    uploadTip: '支持图片及压缩包，单文件不超过 50MB',
    invalidFileType: '不支持的文件格式，请上传图片或压缩包',
    fileTooLarge: '文件过大（最大 50MB）', referenceImage: '参考图',
    noReferences: '暂无参考图',
    focusUpdated: '焦点图已更新',
    deleteRef: '删除参考图', deleteRefConfirm: '确定删除这张参考图？删除后不可恢复。', deleteRefSuccess: '参考图已删除',
    focusHint: '显示尺寸在排期看板工具栏统一设置',
    workflowTitle: '流程进度', stageOff: '关闭流程跟踪',
    stageProgress: '进度 {current}/{total}', stageRevision: '已打回修改',
    advanceTo: '推进到：', stageBack: '↩ 打回上一节点', stageUpdated: '流程已更新',
    stageBackConfirm: '确定打回到「{name}」？订单状态将标记为修改中。',
    stageOffConfirm: '关闭后此订单不再跟随工作流程，回到固定状态流转。确定关闭？',
    stageOffDone: '已关闭流程跟踪',
    gallery: '订单图库', galleryUpload: '上传图片', galleryUploadSuccess: '图片已添加',
    setFocus: '设为焦点图',
    galleryHint: '点击图片放大预览 · 点 ✓ 设为焦点图 · 支持拖拽 / 点击 / Ctrl+V 上传 · 客户图 + 画师图合计最多 20 张',
    galleryNotImage: '仅支持图片文件', galleryTooBig: '图片超过 10MB 限制',
    uploading: '上传中...', sourceClient: '客户', sourceArtist: '画师',
    noteImage: '备注附图', noteImageSingle: '备注仅支持 1 张附图，已使用第一张',
    // R39: 状态区重构（方案B）
    lastActivity: '最后活动：{time}',
    noteCount: '备注 {n} 条', refCount: '参考图 {n} 张',
    enableTrackingHint: '启用流程跟踪，获得更细粒度的进度管理',
    enableTracking: '启用', trackingEnabled: '已启用流程跟踪',
    slideToCancel: '滑动到底部取消订单',
    completedAt: '完成于 {time}',
    // R40: 活动时间线
    activityTitle: '订单状态', timelineTitle: '活动时间线',
    tlTypeSystem: '状态变更', tlTypeNote: '备注', tlTypeImage: '带图备注',
    // R46: 备注删除
    deleteNote: '删除备注', deleteNoteConfirm: '确定删除这条备注？删除后不可恢复。', deleteNoteSuccess: '备注已删除',
    // SPEC-003: 附加工作项
    extraItemsTitle: '附加工作项', extraEmpty: '暂无附加项', extraAdd: '添加附加项',
    extraDialogTitle: '添加附加工作项', extraNameLabel: '名称', extraNamePlaceholder: '如：背景细化、加急费',
    extraDescLabel: '说明（可选）', extraDescPlaceholder: '补充说明', extraPriceLabel: '金额（元）',
    extraAdded: '附加项已添加', extraDeleted: '附加项已删除', extraDelete: '删除附加项',
    extraDeleteConfirm: '确定删除附加项「{name}」？删除后最终价格将自动重算。',
    extraTotal: '最终价格', extraAutoHint: '最终价格 = 基础价格 + 附加项合计，由系统自动计算',
    // R51: 截稿日
    colDeadline: '截稿日', deadlinePlaceholder: '选择截稿日', deadlineUpdated: '截稿日已更新',
    // v0.26 B: 开工日
    colStartDate: '开工日', startDatePlaceholder: '选择开工日', startDateUpdated: '开工日已更新',
    deadlineAutoSet: '已按工期自动设置截稿日',
    // R58-6: QQ 跳转 + 复制
    jumpQq: '跳转QQ', copyQq: '复制QQ', qqCopied: '客户QQ已复制',
    // plan-node-speech：客户沟通小块
    commTitle: '客户沟通', commQq: 'QQ:', commCopyContact: '复制联系方式',
    commPriceSummary: '价格小结：总价{total} / 已付{paid} / 待付{unpaid}',
    commCopyBtn: '复制文案并唤起QQ', commCopied: '已复制节点文案，正在唤起QQ',
    commNoQq: '未设置客户QQ', commNoStage: '该订单未接入流程节点，暂无话术', commNoSpeech: '当前节点暂无话术',
    // B7: 额度池收款区
    payTitle: '收款记录', payAddBtn: '+ 记录收款',
    payPaid: '已收', payFinal: '应收', payRemaining: '待收',
    payFlowTitle: '收款流水', payRevoke: '撤销', payEmpty: '暂无收款记录',
    payRefTitle: '应收参考（工作流节点）',
    payRefPaid: '已收', payRefPartial: '部分 {amount}', payRefPending: '待收',
    payDialogTitle: '记录收款', payAmountLabel: '收款金额（元）', payAmountPlaceholder: '输入金额',
    payNoteLabel: '备注（可选）', payNotePlaceholder: '如：微信转账、定金',
    paySuccess: '收款已记录', payRevokeConfirm: '确认撤销 {amount} 的收款记录？', payRevokeSuccess: '已撤销',
    // v0.31 F4: 节点收款
    payNodePaid: '已收', payNodeDue: '应收', payNodeRemain: '差额',
    payNodeCollect: '收款', payNodeTitle: '「{name}」节点收款',
    // v0.31 F5: 下一节点应收
    nextDueLabel: '下一节点应收：{name} {amount}',
    // v0.31 五号方案A：改价按钮
    priceEditBtn: '修改价格', priceDialogTitle: '修改最终价格',
    priceNewLabel: '新价格（元）', pricePlaceholder: '输入新的最终价格',
    priceNoteLabel: '改价原因', priceNotePlaceholder: '如：客户追加需求、协商优惠',
    priceUpdated: '价格已更新',
    // v0.31 REQ-021 F1: 操作记录
    logTitle: '操作记录', logTypeAll: '全部', logEmpty: '暂无操作记录',
    logActorSystem: '系统', logActorArtist: '画师', logActorClient: '客户',
    logType: {
      status_change: '状态变更', price_change: '改价', extra_item: '附加项',
      payment: '收款', stage_advance: '节点', note_update: '备注'
    },
    logDetail: {
      statusChange: '{from} → {to}',
      priceChange: '¥{from} → ¥{to}',
      extraAdd: '添加附加项「{name}」', extraDelete: '删除附加项「{name}」',
      paymentAdd: '收款 ¥{amount}', paymentRevoke: '撤销收款 ¥{amount}',
      stageAdvance: '推进到「{name}」', stageRollback: '「{from}」打回「{to}」',
      noteAdd: '添加备注', noteDelete: '删除备注'
    }
  },
  manualOrder: {
    title: '手动录单', hint: '客户通过QQ联系你后，在这里手动录入订单信息。',
    leftTitle: '客户说了什么', rightTitle: '怎么录',
    clientQq: '客户QQ号', clientQqPlaceholder: '客户的QQ号',
    clientName: '客户昵称（可选）', clientNamePlaceholder: '怎么称呼客户',
    tier: '档位', tierPlaceholder: '选择档位（可不选）',
    noTiers: '还没有档位，请先在价格管理中添加', tierDays: '{n}天',
    addons: '可选增项', multipliers: '用途与加急',
    usage: '用途', rush: '加急', personal: '个人', noRush: '不加急', inquiry: '面议',
    totalPrice: '总价', finalPrice: '最终价格（元）', finalPriceHint: '可手动修改，留空则使用计算价',
    priceDetail: '明细',
    desc: '需求描述', descPlaceholder: '从QQ聊天中复制客户的需求描述',
    references: '参考图', refExceed: '最多上传5张参考图', fileTooBig: '{name} 过大（{size}MB），上限10MB',
    refTip: '录单后仍可在订单图库中补充参考图，订单图库合计上限 20 张。',
    priority: '优先级', priorityHigh: '高', priorityMedium: '中（默认）', priorityLow: '低',
    clientNotify: '允许客户接收QQ排队提醒',
    catExpression: '表情差分', catOutfit: '服装替换', catBackground: '背景场景', catWeapon: '武器道具', catOther: '其他',
    submit: '录入订单', resultTitle: '录入成功', orderNo: '订单号: {no}', addedToQueue: '已加入排期队列',
    viewQueue: '查看排期', continueEntry: '继续录入', fillClientQq: '请填写客户QQ号',
    // R51: 截稿日
    deadline: '截稿日（可选）', deadlinePlaceholder: '选择截稿日',
    // F2: 拖拽上传提示
    dragHint: '拖拽图片到此处，或点击上传',
    // F3: 开稿日
    startDate: '开稿日（可选）', startDatePlaceholder: '选择开稿日',
    // F4: 初始节点状态
    initialStatus: '初始节点状态', initialStatusHint: '线下已谈好的单子可直接跳过确认环节',
    // REQ-015: QQ历史面板
    historyTitle: '该客户的历史订单', newClient: '新客户，暂无历史订单'
  },
  tiers: {
    title: '价格管理', addTier: '+ 添加档位',
    dragHint: '拖拽排序', reorderSaved: '排序已保存',
    colExample: '例图', colName: '名称', colPrice: '价格', colDays: '工期', colDesc: '描述',
    editTitle: '编辑档位', addTitle: '添加档位', nameLabel: '名称',
    namePlaceholder: '如：头像、半身像、全身像', priceLabel: '价格（元）', daysLabel: '工期（天）',
    descLabel: '描述', descPlaceholder: '简要说明这个档位包含什么', exampleLabel: '例图（可选）',
    changeExample: '更换例图', uploadExample: '上传例图', removeExample: '移除',
    exampleUploaded: '例图已上传，点保存后生效', fillName: '请填写名称',
    confirmDelete: '确定删除档位「{name}」？', daysUnit: '{n}天',
    // #10: 档位三态
    visVisible: '开', visShowcase: '只展示', visHidden: '不展示',
    // R55: 示例图拖拽直传
    dropToUpload: '拖入上传', notImage: '仅支持图片文件', tooBig: '图片超过 10MB 限制',
    overwriteTitle: '覆盖示例图', overwriteConfirm: '已有示例图，覆盖后旧图不可恢复。确定覆盖？',
    exampleUpdated: '示例图已更新',
    // R54: 卡片布局空状态
    empty: '还没有档位',
    // v0.28 T3: Tab 标签 + 操作文案 i18n 化
    tabTiers: '档位', tabAddons: '增项', tabMultipliers: '倍率', tabWorkflow: '流程与比例',
    tabDiscount: '折扣码',
    newTier: '＋ 新建档位', cancel: '取消', save: '保存',
    uploaded: '已上传', saved: '已保存', deleted: '已删除'
  },
  // v0.31 F3: 折扣码管理
  discount: {
    enableLabel: '折扣码功能', enabledHint: '客户下单时可输入折扣码', disabledHint: '客户端不显示折扣码输入框',
    enabledMsg: '折扣码功能已开启', disabledMsg: '折扣码功能已关闭',
    addBtn: '新建折扣码', addTitle: '新建折扣码', editTitle: '编辑折扣码',
    colCode: '折扣码', colType: '折扣', colUsage: '已用/上限', colExpiry: '有效期', colStatus: '状态',
    noExpiry: '永久', statusOn: '启用', statusOff: '停用',
    codeLabel: '折扣码', codePlaceholder: '如 SUMMER20（大写字母+数字）',
    typeLabel: '折扣类型', typePercent: '百分比', typeFixed: '固定金额',
    valuePercent: '折扣比例（%）', valueFixed: '减免金额（元）',
    maxUsesLabel: '使用次数上限', maxUsesPlaceholder: '不限', maxUsesHint: '留空 = 不限次数',
    expiryLabel: '过期日期', expiryPlaceholder: '留空 = 永久有效',
    createdMsg: '折扣码已创建', updatedMsg: '折扣码已更新', deletedMsg: '折扣码已删除',
    deleteConfirm: '确定删除折扣码「{code}」？', disable: '停用', enable: '启用',
    empty: '还没有折扣码，点击"新建折扣码"创建'
  },
  // v0.32 REQ-023 Phase1: 画风管理 + 增项库
  styleManage: {
    tabStyles: '画风管理', tabTemplates: '增项库', confirmTitle: '确认',
    // 增项库
    tplName: '名称', tplControl: '控件', tplPricing: '计价', tplDefaultPrice: '建议默认价', tplActions: '操作',
    tplEmpty: '还没有增项模板，点击"新建增项"创建', tplAdd: '+ 新建增项',
    tplAddTitle: '新建增项', tplEditTitle: '编辑增项',
    tplNameLabel: '名称', tplNamePlaceholder: '如：加人、加差分、加背景', tplNameRequired: '请输入增项名称',
    tplControlLabel: '控件类型', tplControlSwitch: '开关', tplControlQuantity: '数量', tplControlRadio: '单选',
    tplPricingLabel: '计价模式', tplPricingFixed: '固定价', tplPricingPerUnit: '单价×数量', tplPricingPerOption: '选项价',
    tplPriceLabel: '默认价格（元）',
    tplUnitLabel: '单位标签', tplUnitPlaceholder: '如：人、张、个',
    tplOptionsLabel: '选项列表', tplOptionLabel: '选项名', tplAddOption: '+ 添加选项',
    tplOptionsHint: '客户下单时可从中选择一个选项，各选项可单独定价', tplOptionsRequired: '单选类型至少需要一个有效选项',
    tplSaved: '增项已保存', tplDeleted: '增项已删除', tplDeleteConfirm: '确定删除增项「{name}」？所有画风中对该增项的引用将一并删除。',
    pricePerUnit: '¥{price}/{unit}', unitDefault: '个',
    // 画风
    styleAdd: '+ 新建画风（从增项库一键导入）', styleAddTitle: '新建画风', styleEditTitle: '编辑画风',
    styleNameLabel: '画风名称', styleNamePlaceholder: '如：日系、厚涂、像素风', styleNameRequired: '请输入画风名称',
    styleDescLabel: '描述（可选）', styleDescPlaceholder: '适合什么风格、什么场景',
    styleCoverLabel: '示例图（可选）', styleCoverUpload: '上传示例图', styleCoverChange: '更换示例图',
    styleImportAddons: '从增项库一键导入', styleImportHint: '勾选后，增项库中所有增项将自动导入到该画风（默认启用，可逐个调整）',
    styleSaved: '画风已保存', styleDeleted: '画风已删除', styleDeleteConfirm: '确定删除画风「{name}」？其下所有尺寸、增项配置和覆盖将一并删除。',
    styleActive: '启用', styleEmpty: '还没有画风，点击"新建画风"开始配置',
    // 尺寸
    sizeTitle: '尺寸与基础价', sizeName: '尺寸', sizePrice: '基础价', sizeActions: '操作',
    sizeNamePlaceholder: '如：头像、半身、全身', sizeNameRequired: '请输入尺寸名称',
    sizeAdd: '添加', sizeSaved: '尺寸已保存', sizeAdded: '尺寸已添加', sizeDeleted: '尺寸已删除',
    sizeDeleteConfirm: '确定删除尺寸「{name}」？该尺寸下的覆盖配置将一并删除。',
    // 增项
    addonTitle: '增项（从增项库导入）', addonEmpty: '还没有导入增项，可在增项库中创建后重新导入',
    addonSave: '保存增项配置', addonSaved: '增项配置已保存',
    // 尺寸覆盖
    overrideExpand: '尺寸覆盖 ▾', overrideCollapse: '收起 ▴',
    overrideTitle: '「{name}」尺寸覆盖', overrideHidden: '隐藏', overrideSaved: '覆盖已保存'
  },
  artworks: {
    title: '作品管理', dragUpload: '拖拽图片到此处，或点击上传作品',
    tip: '支持 JPG / PNG / WebP，建议尺寸 ≥ 800px', empty: '还没有作品，上传一些吧',
    uploaded: '上传成功', confirmDelete: '确定删除这张作品？', image: '作品图片',
    // R45: 多选删除
    manage: '管理', manageDone: '完成',
    selected: '已选 {n} 项',
    batchDeleteTitle: '批量删除', batchDeleteConfirm: '确定删除选中的 {n} 张作品？删除后不可恢复。',
    batchDeleted: '已删除 {n} 张作品', batchPartial: '删除完成：成功 {ok} 张，失败 {failed} 张',
    slideToDelete: '滑动到底部确认删除',
    // REQ-017: 封面操作
    coverSet: '设为封面', coverUnset: '取消封面',
    coverSetSuccess: '已设为封面', coverUnsetSuccess: '已取消封面',
    coverTag: '封面',
    // F7: 主图去重
    mainImages: '主图', mainTag: '主图',
    // v0.31: 多封面排序
    coverMoveUp: '前移', coverMoveDown: '后移', coverReordered: '封面顺序已更新'
  },
  rules: {
    title: '须知编辑', hint: '编辑客户下单前必须阅读的约稿须知。支持 HTML 标签。',
    placeholder: '输入约稿须知内容，支持 HTML 标签如 <h3>、<ul>、<li>、<strong> 等',
    preview: '预览：', save: '保存须知', saved: '须知已保存'
  },
  // #44: 偏好设置独立页面（从主页设置拆出）
  preferences: { title: '偏好设置' },
  settings: {
    title: '主页设置', tabProfile: '基本资料', tabShowcase: '主页展示', tabTemplate: '模板与风格',
    tabPrefs: '偏好', tabRules: '须知编辑', tabWorkflow: '流程与比例',
    quickTitle: '快捷按钮', quickLabel: '仪表盘快捷按钮（3-9 个）',
    quickHint: '勾选后点保存生效，仪表盘快捷区将按此显示。',
    quickSave: '保存快捷按钮', quickSaved: '快捷按钮已保存', quickLimitError: '请选择 3-9 个快捷按钮',
    quickLocalFallback: '已保存到本地（服务端暂不可用，下次打开自动同步）',
    nameLabel: '画师昵称', bioLabel: '个人简介', bioPlaceholder: '介绍一下自己',
    codeLabel: '身份码（订单号前缀）', codePlaceholder: '如 ALICE、QY（2-10位大写字母/数字）',
    codeHint: '身份码用于生成订单号前缀（如 ALICE-001），修改后新订单生效，已有订单号不变',
    statusLabel: '主页状态', statusOpen: '可约稿', statusFull: '已排满', statusBreak: '休息中',
    linksLabel: '外链（客户主页展示）', linkName: '名称', addLink: '添加链接',
    linksHint: '最多 6 条，保存后客户主页立即生效。留空的行不会保存。',
    // R58-8: 平台链接 + 灵感标签
    platformLabel: '平台链接（客户主页展示）', platformAuto: '自动识别',
    platformHint: '最多 10 条，保存后客户主页立即生效。留空的行不会保存。平台默认自动识别，也可手动指定。',
    inspireLabel: '灵感标签（客户下单页展示）', inspireInputPlaceholder: '输入标签后回车添加',
    inspireHint: '最多 20 个，每个 ≤30 字。客户点击标签可快捷填入需求描述。未设置时客户下单页不显示此区域。',
    inspireTagTooLong: '标签不能超过 30 个字符', inspireTagLimit: '最多 20 个标签', inspireTagDuplicate: '标签已存在',
    // SPEC-004: 名额与缓冲
    slotLabel: '正式名额（N）', slotEnable: '启用名额限制', slotUnit: '个',
    slotHint: '关闭 = 不限制接单数；0 = 申请制（客户可提交申请但不直接占位）；N>0 = 限额接单。启用后正式位 + 缓冲位总数须 ≥ 1。',
    slotMinError: '启用名额限制时，正式位 + 缓冲位总数须 ≥ 1',
    bufferLabel: '缓冲名额（M）', bufferHint: '正式位满后，新订单进入缓冲区候补。递补后移入正式队列。',
    // S5: 月度额度池
    quotaLabel: '月度额度', quotaEnable: '启用月度额度', quotaUnit: '单/月',
    quotaHint: '限制每月可接新订单数（按创建时间计，已取消不计）。关闭 = 不限制。与名额系统独立，两者同时启用时任一达到上限即约满。',
    bufferSwitchLabel: '缓冲区设置',
    autoPromote: '自动递补（正式位空出时自动将缓冲区最早订单移入）',
    hideQueuePosition: '对客户隐藏排队位置（只显示"排队中"）',
    hidePromoteNotify: '递补时不通知客户',
    bufferShortForm: '缓冲区订单使用简表模式（看板只显示关键信息）',
    bufferSwitchHint: '以上开关仅在有缓冲名额时生效。',
    contactQqLabel: '联系QQ（客户可见）', contactQqPlaceholder: '留空则默认使用登录QQ',
    contactQqHint: '客户不记得订单号时会看到此QQ，用于联系你找回订单',
    notifyLabel: '客户QQ通知', notifyText: '允许客户接收排队/完成通知',
    defaultPanelLabel: '仪表盘默认面板', defaultPanelHint: '进入仪表盘时显示的快捷入口',
    announcementLabel: '主页公告', announcementPlaceholder: '如：本周休息，下周一恢复接单',
    announcementHint: '显示在客户主页首屏，最多 500 字。留空则不显示。',
    announcementExpiresLabel: '自动隐藏日期（可选）', announcementExpiresHint: '到期后公告自动消失，不设置则长期显示',
    // REQ-018: 公告过期日快捷预设
    shortcut7d: '近 7 天', shortcut30d: '近 30 天', shortcutMonthEnd: '本月底',
    save: '保存设置', saved: '设置已保存',
    // R48: 头像上传
    avatarLabel: '头像', avatarHint: '点击上传或更换（JPG/PNG/WebP，≤10MB）',
    avatarUpdated: '头像已更新', avatarNotImage: '仅支持图片文件', avatarTooBig: '图片超过 10MB 限制',
    // R49: 强调色
    accentLabel: '强调色', accentHint: '客户主页的按钮/链接/高亮颜色，与访客自选主色独立',
    accentClear: '默认', accentDarkHint: '暗色模式自动提亮，无需额外调整',
    // v0.25 A: 封面管理
    coverTitle: '封面图（主页顶部轮播）',
    coverHint: '点击星标将作品设为主页封面，可设多张（自动轮播）。再点一次取消。',
    coverSet: '设为封面', coverUnset: '取消封面',
    coverSetSuccess: '已设为封面', coverUnsetSuccess: '已取消封面',
    coverEmpty: '暂无作品，上传作品后可设置封面',
    coverManageLink: '管理封面',
    // R50: 预览
    previewBtn: '预览主页'
  },
  // v0.26 C: 开稿管理独立页
  slots: {
    title: '开稿管理',
    statusSection: '接稿状态',
    slotSection: '名额设置',
    quotaSection: '月度额度',
    queueSection: '队列行为',
    totalHint: '正式 {n} + 缓冲 {m} = 合计 {sum} 席',
    statusOpen: '当前正在接受约稿',
    statusFull: '已接满，暂停接单',
    statusBreak: '休息中，暂不接单',
    statusHidden: '主页已隐藏'
  },
  templates: {
    tab: '主页模板',
    hint: '选择客户看到的画师主页样式。布局决定页面结构，配色决定气质底色，所有模板共享同一套作品/价格数据。',
    label: '页面布局',
    atelier: '画册工作室',
    atelierDesc: '纸感暖调，宋体标题，笔触下划线，安静的手作气质',
    classic: '经典工作室',
    classicDesc: '代表作横幅开场，桌面双栏，约稿按钮吸顶常驻',
    gallery: '美术馆画廊',
    galleryDesc: '全屏画作开场，展签式名字，大小交错画廊',
    folio: '单页落地页',
    folioDesc: '左文右图分屏开场，滚动侦测导航，适合品牌风格',
    palette: '页面配色',
    paletteHint: '配色决定页面的气质底色（亮暗由访客偏好自动适配），主色仍跟随访客的五色选择。',
    palettePaper: '纸', palettePaperDesc: '暖白宣纸，墨字，安静',
    paletteInk: '墨', paletteInkDesc: '画廊深炭，层灰，克制',
    paletteDusk: '暮', paletteDuskDesc: '蓝灰暮色，冷静',
    paletteMoss: '苔', paletteMossDesc: '深绿自然，温润',
    saved: '模板已更新'
  },
  embed: {
    tab: '嵌入脚本',
    hint: '如果你已经有自己的个人网站（Carrd / Framer / 自建站等），可以在你的网站里插入一段代码，让客户直接通过你的网站下单。',
    step1: '1. 复制以下代码：',
    step2: '2. 将代码粘贴到你网站中想要显示「我要约稿」按钮的位置。客户点击按钮后会弹出下单表单。',
    copyBtn: '复制代码',
    copied: '已复制',
    copyFailed: '复制失败，请手动选择并复制'
  },
  workflow: {
    stageList: '流程节点', paymentBar: '收款比例', overview: '流程全览',
    addPlaceholder: '新节点名称，如「细化确认」', final: '尾款', auto: '自动',
    deleteHint: '确定删除此节点？', deletePayHint: '此节点收款比例将并入尾款，确定删除？',
    savePayment: '保存比例', unsaved: '有未保存的比例变更',
    saved: '比例已保存', detached: '已移除该收款节点，比例已并入尾款',
    dragHandle: '拖拽调整比例', minPercent: '比例不能低于 5%', finalTooLow: '尾款比例不足，无法分配',
    reset: '恢复默认模板', resetConfirm: '确定恢复默认模板？你当前的所有自定义节点和比例将被覆盖，此操作无法撤销。', resetDone: '已恢复默认模板',
    descPlaceholder: '点击添加说明',
    // plan-node-speech：节点话术（{客户名}等为后端变量契约，中英文界面均保持中文原文）
    // Bug 1: 花括号会被 vue-i18n 当 ICU 占位符解析（中文非合法标识符→崩溃），用 {'{'} 字面量转义
    speechLabel: '话术', speechPlaceholder: "{'{'}客户名{'}'}，你的订单已{'{'}节点名{'}'}。",
    speechSave: '保存话术', speechSaved: '话术已保存', speechVarHint: '点击插入变量',
    // #8: 话术界面改进（变量公共区 + 折叠预览）
    speechVarCommon: '话术变量（点下方编辑框后再点变量插入）', speechVarNoFocus: '先点击某个节点的话术编辑框',
    speechEmpty: '暂无话术',
    // v0.27: 多模板随机开关
    randomTemplate: '随机', randomTemplateHint: '多条话术时可开启，发送时随机选一条',
    helpBtn: '使用说明', helpTitle: '流程与比例使用说明',
    helpLines: [
      '每个节点代表约稿的一个阶段，客户会按顺序看到你的进度。',
      '打开节点右侧的开关即可在该阶段收款，比例条会实时分配。',
      '最后一个收款节点是「尾款」，比例由系统自动计算，不可手动修改。',
      '拖动比例条上的手柄可调整相邻两期的比例；向左拖到底可移除该期收款。',
      '拖动节点左侧的 ⠿ 可调整阶段顺序，尾款标签会自动跟随最后一个收款节点。',
      '点击节点名称可改名，点击灰色说明文字可为该阶段添加描述。',
      '所有比例之和恒为 100%，每一期不得低于 5%。'
    ]
  },
  admin: {
    backToAdmin: '返回后台', panelTitle: '管理员面板',
    artistCount: '画师数', totalOrders: '总订单', activeOrders: '活跃订单',
    artistList: '画师列表', manageArtists: '管理画师',
    colName: '昵称', colSubdomain: '子域名', colQq: 'QQ号', colStatus: '状态', colBio: '简介',
    backToPanel: '返回管理面板', artistManage: '画师管理', addArtist: '+ 添加画师',
    addTitle: '添加画师', qqLabel: 'QQ号', qqPlaceholder: '画师的QQ号（用于登录）',
    nameLabel: '昵称', namePlaceholder: '展示给客户的名字',
    subdomainLabel: '子域名', subdomainPlaceholder: '如 alice（小写字母/数字/连字符）',
    codeLabel: '身份码（可选）', codePlaceholder: '如 ALICE（默认用子域名大写）',
    bioLabel: '简介（可选）', domainSuffix: '.主域名',
    requiredFields: 'QQ号、昵称和子域名为必填项', added: '画师已添加',
    confirmRemove: '确定移除画师「{name}」？该画师的所有订单、作品数据将被永久删除！',
    confirmRemoveTitle: '危险操作', confirmRemoveBtn: '确定移除',
    artistOrders: '订单记录', noOrders: '暂无订单', statusUpdated: '状态已更新',
    // B7: 订单行展开——收款摘要
    payPaid: '已收', payFinal: '应收', payRemaining: '待收',
    payRefPaid: '已收', payRefPartial: '部分', payRefPending: '待收', payNoData: '暂无付款信息',
    transferAdmin: '更换管理员', transferTitle: '更换管理员账号',
    transferStep1Title: '验证当前管理员', transferStep2Title: '验证新管理员',
    currentAdminQq: '当前管理员QQ', newAdminQq: '新管理员QQ',
    newAdminQqPlaceholder: '输入新管理员的QQ号（必须是已注册画师）',
    sendCode: '发送验证码', codeSent: '验证码已发送', enterCode: '输入6位验证码',
    nextStep: '下一步', confirmTransfer: '确认更换',
    transferSuccess: '管理员已更换为 {name}', adminTag: '管理员',
    orderColNo: '订单号', orderColQq: '客户QQ', orderColStatus: '状态',
    orderColType: '类型', orderColTime: '下单时间',
    greetingManage: '问候语管理', greetingPlaceholder: "输入问候语，用 {'{'}name{'}'} 代替画师名",
    greetingPreview: '预览', greetingEmpty: '请输入问候语内容',
    greetingColText: '问候语', greetingColSlot: '时段', greetingColEnabled: '启用',
    slotAny: '全天', slotMorning: '清晨', slotAfternoon: '午后', slotEvening: '傍晚', slotNight: '深夜',
    defaultWorkflow: '默认流程模板', defaultWorkflowHint: '修改后仅影响新注册画师，已有画师不受影响。',
    resetTemplate: '重置为出厂默认', resetConfirm: '确定恢复出厂默认模板？当前自定义模板将被覆盖。', resetDone: '已恢复出厂默认',
    manage: '管理', artistDetail: '画师详情', tierName: '档位名称',
    artworkHint: '作品图片需通过画师后台上传，此处仅支持查看和删除。',
    greetingTab: '问候语',
    greetingGlobalHint: '通用库条目对所有画师生效，与画师专属库混合抽取。',
    greetingArtistHint: '专属库条目仅对该画师生效，与通用库混合抽取。',
    // 回收站（事故修复：孤儿文件可恢复）
    recycleBin: {
      title: '回收站', empty: '清空回收站',
      colFile: '文件名', colPath: '原始路径', colSize: '大小', colMovedAt: '移入时间',
      emptyTitle: '清空回收站', emptyConfirm: '回收站中的文件将被永久删除，不可恢复。确定清空？',
      emptied: '已清空，删除 {n} 个文件', emptyHint: '回收站是空的'
    },
    // F4: 留言管理（跨画师）
    guestbook: {
      title: '留言管理', empty: '暂无留言',
      colArtist: '画师', colNickname: '昵称', colContent: '内容', colStatus: '状态', colTime: '时间',
      delete: '强制删除', deleteConfirm: '确定删除这条留言？删除后客户主页将不再显示。', deleted: '留言已删除'
    },
    // HC: 系统自检
    health: {
      title: '系统自检', start: '开始检查', checking: '检查中…',
      download: '下载诊断包', refresh: '刷新后结果不保留',
      diskNote: '仅供参考', expandDetail: '详情',
      statusOk: '正常', statusWarn: '警告', statusFail: '异常',
      emptyHint: '点击「开始检查」运行 8 项系统检查'
    }
  }
}
