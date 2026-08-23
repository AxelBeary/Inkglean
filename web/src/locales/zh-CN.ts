export default {
  errors: {
    // 认证
    NOT_LOGGED_IN: '未登录',
    SESSION_EXPIRED: '登录已过期，请重新登录',
    ACCOUNT_NOT_FOUND: '画师账号不存在',
    ACCOUNT_DISABLED: '账号已被停用',
    ARTIST_BANNED: '账号已被封禁，如有疑问请联系管理员',
    TOKEN_REVOKED: '登录状态已失效，请重新登录',
    ADMIN_REQUIRED: '需要管理员权限',
    // REQ-041: 管理后台二次验证
    STEP_UP_REQUIRED: '需要完成管理员二次验证',
    QQ_NOT_REGISTERED: '该 QQ 号未注册为画师',
    TOTP_NOT_BOUND: '该画师尚未绑定动态口令，请联系管理员',
    TOTP_INVALID: 'QQ号或动态口令错误',
    TOTP_LOCKED: '尝试次数过多，账号已临时锁定，请稍后再试',
    TOTP_BIND_INVALID: '动态口令错误，请让画师确认验证器上当前显示的 6 位码',
    // REQ-040: WebAuthn Passkey（v143 补齐：后端错误码↔前端键三轴审计收尾）
    WEBAUTHN_CHALLENGE_INVALID: '验证超时或 Challenge 无效，请重试',
    WEBAUTHN_REGISTRATION_FAILED: 'Passkey 注册失败，请重试',
    WEBAUTHN_AUTHENTICATION_FAILED: '身份验证失败，请重试',
    WEBAUTHN_CREDENTIAL_EXISTS: '该设备已注册',
    WEBAUTHN_CREDENTIAL_NOT_FOUND: 'Passkey 凭据不存在',
    // REQ-040: TOTP 自助重绑
    REBIND_COOLDOWN: '重绑操作过于频繁，请在 24 小时后再试',
    REBIND_NO_CREDENTIAL: '没有可用的验证方式，请联系管理员重绑',
    // REQ-039: 邀请码注册
    INVITE_INVALID: '邀请码无效、已使用或已过期',
    INVITE_CANNOT_REVOKE: '仅未使用的邀请码可吊销',
    ONBOARDING_DISABLED: '当前未开启邀请入驻，请联系管理员开通',

    // 画师
    ARTIST_NOT_FOUND: '画师不存在',
    NAME_EMPTY: '昵称不能为空',
    CODE_FORMAT: '身份码只能包含大写字母和数字，2-20 个字符',
    CODE_TAKEN: '身份码已被使用，请换一个',
    INVALID_STATUS: '无效的主页状态',
    INVALID_URL: '链接必须以 http:// 或 https:// 开头',
    SUBDOMAIN_FORMAT: '主页标识只能包含小写字母和数字，2-20 个字符',

    // 流程
    STAGE_NOT_FOUND: '节点不存在',
    STAGE_NAME_EMPTY: '节点名称不能为空',
    FINAL_CANNOT_DISABLE: '尾款节点的收款不可关闭',
    FINAL_CANNOT_DELETE: '尾款节点不可删除',
    TRACK_ALREADY_ON: '流程跟踪已开启，请刷新页面查看',
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
    WORKFLOW_PAYMENT_IN_USE: '有 {count} 个进行中的订单已引用收款节点，调整收款结构会影响这些订单的节点锁定与收款计划；请先完成订单或稍后再试',

    // 订单
    ORDER_NOT_FOUND: '订单不存在',
    ORDER_NOT_OWNED: '该订单不属于你，无权操作',
    ORDER_INVALID_STATUS: '无效状态',
    INVALID_TRANSITION: '不能进行此状态转换',
    // D-1（R-5）: 订单 version 乐观锁冲突（双标签页/撤销重放）
    ORDER_CONFLICT: '订单已被其他操作更新，请刷新后重试',
    // R-2: 已收款订单取消需二次确认（Batch A 契约 409 CANCEL_WITH_PAYMENT）
    CANCEL_WITH_PAYMENT: '该订单已收款，请先线下退还后再取消',
    MY_ORDERS_RETIRED: '「我的订单」查询已下线，请使用下单时保存的追踪链接，或联系画师补发',
    LOOKUP_RETIRED: '「订单查询」已下线，请使用下单时保存的追踪链接，或联系画师补发',
    PAYMENT_STATUS_BLOCKED: '当前订单状态不允许该收款操作',
    // 815 拍板 #1：取消后 5 秒撤销窗口
    CANCEL_UNDO_EXPIRED: '撤销窗口已过（取消后 5 秒内可撤销）',
    DELIVER_WRONG_STATUS: '当前状态不能上传交付文件',
    // 815 拍板 #4：交付文件一次性下载
    DOWNLOAD_LOCKED: '该交付文件已下载过并被锁定，需画师再许可后才能再次下载',
    DOWNLOAD_COOLDOWN: '下载尝试过于频繁，请稍后重试',
    // ICS 订阅事件防护（单事件序列化上限）
    INVALID_EVENT_PAYLOAD: '事件扩展数据过大（单事件序列化 ≤2KB）',
    TIER_NOT_FOUND: '价格档位不存在或不属于该画师',
    ILLEGAL_PATH: '文件路径无效，请重新选择',
    MISSING_FILE: '缺少文件路径',
    QUEUE_EMPTY: '排序列表不能为空',
    QUEUE_NOT_OWNED: '订单不属于当前队列',
    QUEUE_LENGTH: '排序列表长度与队列不一致',
    QUEUE_DUPLICATE: '排序列表存在重复订单',
    INVALID_PRIORITY: '无效优先级',

    // REQ-022 F1: 发布为作品
    PUBLISH_WRONG_STATUS: '仅已交付的订单可发布为作品',
    DELIVERABLE_NOT_FOUND: '交付文件不存在或不属于该订单',

    // 备注删除（v0.15 R46）
    NOTE_NOT_FOUND: '备注不存在',
    SYSTEM_NOTE_PROTECTED: '系统备注不可删除',

    // 强调色（v0.15 R49）
    INVALID_ACCENT_COLOR: '无效的强调色',

    // 截稿日（v0.15 R51）
    INVALID_DEADLINE: '截稿日格式无效，请重新选择日期',
    INVALID_START_DATE: '开工日不能晚于截稿日',
    INVALID_ANNOUNCEMENT_DATE: '公告过期日不能早于今天',

    // 上传
    ILLEGAL_FILE_TYPE: '不支持的文件类型',
    UNSUPPORTED_FORMAT: '不支持此文件格式',

    // 管理员
    ADMIN_VERIFY_FAILED: '管理员验证失败',

    // 通用
    NOT_FOUND: '内容不存在',
    VALIDATION: '提交的信息格式有误，请检查后重试',
    INTERNAL: '服务器内部错误',
    UNKNOWN: '请求错误',

    // 折扣码（v0.31 F3）
    DISCOUNT_DISABLED: '该画师未开启折扣码功能',
    DISCOUNT_CODE_INVALID: '折扣码无效',
    DISCOUNT_CODE_EXPIRED: '折扣码已过期',
    DISCOUNT_CODE_EXHAUSTED: '折扣码使用次数已达上限',
    DISCOUNT_CODE_NOT_FOUND: '折扣码不存在',
    DISCOUNT_CODE_TAKEN: '该折扣码已被使用',

    // 画师（补充）
    QQ_TAKEN: '该QQ号已被注册',
    SUBDOMAIN_TAKEN: '该主页标识已被使用',

    // 通用（补充）
    RATE_LIMITED: '操作过于频繁，请稍后再试',
    MISSING_PARAMS: '缺少必要参数',

    // 输入校验（补充）
    QQ_REQUIRED: '请填写QQ号',
    QQ_FORMAT: 'QQ号格式不正确（5-15 位数字）',
    MISSING_CREDENTIALS: '请输入QQ号和动态口令',

    // 订单输入（补充）
    ARTIST_NOT_OPEN: '该画师当前不接受新约稿',
    RULES_NOT_AGREED: '请先阅读并同意约稿须知',
    STATUS_REQUIRED: '请指定状态',
    NOTE_EMPTY: '备注内容不能为空',
    ORDER_INVALID_ID: '订单号无效',

    // 增项（补充）
    // 增项选择（补充，SPEC-PRICE-2：用途/加急各只生效一个）
    ADDON_SELECTION_MUTEX: '用途/加急增项各只能选择一个生效',

    // 倍率（补充）

    // 计算（补充）
    PRICING_CALC_FAILED: '价格计算失败',
    INVALID_PRICE: '价格无效（须为大于 0 的金额）',
    // 计价引擎（补充，v0.37 REQ-025）
    PRICING_CONSERVATION: '价格数据出现异常，操作未完成，请刷新后重试',
    PRICE_CHANGE_AFTER_DONE: '订单已完成，改价请通过增减附加项操作',

    // 焦点图（补充）
    FOCUS_IMAGE_NOT_FOUND: '焦点图不存在',
    FOCUS_IMAGE_NOT_OWNED: '该焦点图不属于此订单',
    INVALID_FOCUS_MODE: '焦点图模式无效（可选：关闭 / 小图 / 大图）',

    // 外链（补充）
    LINKS_TOO_MANY: '外链数量不能超过8条',
    LINK_URL_INVALID: '外链地址格式不正确（须以 http:// 或 https:// 开头）',

    // 图库（补充）
    REFERENCES_LIMIT: '参考图总数不能超过20张',
    REFERENCE_DUPLICATE: '该图片已在图库中',
    NOTE_IMAGE_PATH_INVALID: '备注附图路径不合法',

    // 下单页模板（补充）
    INVALID_ORDER_TEMPLATE: '无效的下单页模板',

    // 平台链接（补充）
    PLATFORM_URLS_TOO_MANY: '平台链接数量不能超过10条',
    PLATFORM_URL_INVALID: '平台链接格式不正确（须以 http:// 或 https:// 开头）',

    // 社交平台（补充，v0.38 REQ-022 F2）
    PLATFORM_NOT_FOUND: '社交平台不存在',
    PLATFORM_NAME_EMPTY: '平台名称不能为空',
    PLATFORM_ICON_REQUIRED: '平台图标键与单字兜底至少填一项',
    PLATFORM_DOMAIN_INVALID: '平台域名格式不正确（不含协议/路径/端口）',
    PLATFORM_DOMAIN_TAKEN: '该域名已被其他启用平台占用',

    // 灵感标签（补充）
    TAGS_TOO_MANY: '灵感标签数量不能超过20个',

    // 附加工作项（补充）
    EXTRA_ITEM_LIMIT: '附加工作项数量不能超过20条',
    ORDER_FINAL_STATE: '已交付或已取消的订单不能添加附加项',

    // 名额与缓冲（补充）
    BATCH_FULL: '该画师已接满，暂时无法下单',
    INVALID_BATCH_LIMIT: '名额设置无效（正式位+缓冲位至少为1）',
    NOT_BUFFER_ORDER: '该订单不在缓冲区',

    // 流程（补充）
    STAGE_IN_USE: '该节点下有进行中的订单，请先完成或转移后再删除',

    // 作品（补充）
    ARTWORK_NOT_FOUND: '作品不存在',
    COVER_LIMIT_REACHED: '封面最多 6 张，请先取消部分封面',

    // 档位三态（补充）
    TIER_NOT_AVAILABLE: '该档位暂不接受下单',

    // 多画风（补充，v0.32 REQ-023）
    STYLE_NOT_FOUND: '画风不存在',
    STYLE_NAME_EMPTY: '画风名称不能为空',
    STYLE_SIZE_NOT_FOUND: '尺寸不存在',
    STYLE_SIZE_NAME_EMPTY: '尺寸名称不能为空',
    STYLE_SIZE_INVALID_PRICE: '尺寸价格无效',
    STYLE_SIZE_NOT_AVAILABLE: '该尺寸暂不接受约稿',
    ADDON_TEMPLATE_NOT_FOUND: '增项模板不存在',
    ADDON_TEMPLATE_NAME_EMPTY: '增项模板名称不能为空',
    ADDON_TEMPLATE_INVALID_PRICE: '增项模板价格无效',
    ADDON_TEMPLATE_INVALID_CONTROL: '无效的控件类型',
    ADDON_TEMPLATE_INVALID_PRICING: '无效的计价模式',
    STYLE_ADDON_NOT_FOUND: '画风增项不存在',
    STYLE_ADDON_DUPLICATE: '该增项已导入此画风',
    SIZE_OVERRIDE_NOT_FOUND: '尺寸覆盖不存在'
  },
  pref: {
    theme: '主题设置', base: '底色', accent: '主色', auto: '随系统', light: '亮', dark: '暗',
    // 主色色板名（第三方打磨批 A：英文界面不再显中文）
    accentNames: { teal: '青', turquoise: '碧', blue: '蓝', indigo: '靛', violet: '紫' },
    // v0.38: 画师后台宣纸/墨黑双主题（REQ-026 §1.2）
    artistToInk: '切换到墨黑主题', artistToPaper: '切换到宣纸主题',
    artistToastInk: '已切换 · 墨黑', artistToastPaper: '已切换 · 宣纸'
  },
  common: {
    // 画师占位名（817 修复：原缺失键致 profile 未就绪时顶栏直显原始键 common.artist）
    artist: '画师',
    // 815 审计 P1-3：乐观锁冲突提示（双开标签页/旧快照写入被后端 409 拦下）
    orderConflict: '该订单刚被其他操作更新过，已为你刷新，请重试',
    status: { open: '可约稿', full: '已排满', break: '休息中', hidden: '隐藏' },
    statusShort: { open: '可约', full: '排满', break: '休息', hidden: '隐藏' },
    priority: { high: '高', medium: '中', low: '低' },
    orderStatus: {
      pending: '待确认', confirmed: '已确认', wip: '制作中', revision: '修改中',
      done: '已完成', delivered: '已交付', cancelled: '已取消'
    },
    source: { self: '自助', manual: '手动', clientSelf: '客户自助', manualEntry: '手动录入' },
    custom: '自定义', none: '无',
    save: '保存', cancel: '取消', delete: '删除', edit: '编辑', download: '下载',
    confirm: '确认', close: '关闭', detail: '详情', actions: '操作', remove: '移除', add: '添加', or: '或',
    like: '点赞', unlike: '取消点赞',
    saved: '保存成功', deleted: '已删除', removed: '已移除',
    confirmDeleteTitle: '确认删除', uploadFailed: '上传失败', copyFailed: '复制失败，请手动复制',
loadRetry: '再试一次', networkError: '网络错误，请稍后重试', globalError: '页面出了点小问题，请刷新重试',
    // 812-B5: Passkey 交互人话提示（浏览器不支持/被取消/验证失败）
    passkeyNotSupported: '当前浏览器不支持 Passkey（需 HTTPS 或 localhost）',
    passkeyCancelled: '已取消 Passkey 验证',
    passkeyFailed: 'Passkey 验证失败，请重试或换用其他方式',
    footer: '拾绘 · 画师约稿平台'
  },
  disclaimer: {
    title: '平台职责说明',
    text: '本平台为约稿工具，仅协助核实双方身份、建立联系；沟通与支付均在站外进行，平台不托管资金。交付文件由平台提供一次性传递通道，不干预交付结果；平台不提供仲裁服务，交易风险请自行承担。'
  },
  // 方案 B: 交付弹窗模式（上传文件 / 无文件交付）
  deliverMode: {
    file: '上传交付文件',
    noFile: '无文件交付',
    noFileHint: '本订单无需交付文件（如纯咨询、已线下交付等）。确认后订单将直接标记为「已交付」，该操作不可撤销。',
    noFileConfirm: '确定无需交付文件、直接完成交付吗？订单将进入「已交付」状态。'
  },
  upload: {
    pasteHint: '支持 Ctrl+V 粘贴图片',
    pasteNotImage: '仅支持粘贴图片',
    pasteTooMany: '最多粘贴 {max} 张图片',
    pasteTooBig: '文件「{name}」超过 {max}MB 限制（{size}MB），请压缩后重试',
    dragFromPage: '页面里的图片不能直接拖进上传区（拖进来的是渲染图，不是原文件）。请从文件管理器拖入，或 Ctrl+V 粘贴',
    // 05D-A2: 上传（非粘贴）路径校验提示
    fileNotImage: '仅支持图片文件',
    fileTooBig: '文件「{name}」超过 {max}MB 限制（{size}MB），请压缩后重试'
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
    // REQ-040: 账号与安全菜单项
    account: '账号与安全',
    logo: '拾绘',
    // v0.38: 侧栏品牌印章字（REQ-026 §三.1 朱砂印章「绘」）
    logoSeal: '绘',
    dashboard: '仪表盘', queue: '排期看板', orders: '订单管理',
    manualOrder: '手动录单', tiers: '价格管理', artworks: '作品管理',
    guestbook: '留言管理', slots: '开稿管理',
    preview: '主页预览',
    rules: '须知编辑', stats: '数据统计', settings: '主页设置', preferences: '偏好设置', admin: '管理后台', logout: '退出登录',
    collapse: '收起侧边栏', expand: '展开侧边栏', openMenu: '打开菜单',
    langToEn: 'English', langToZh: '中文', langAriaToEn: 'Switch to English', langAriaToZh: '切换到中文',
    // REQ-035 批D: 今天吃什么（工具组菜单项）
    foodMenu: '今天吃什么',
    // REQ-031 A1: 收入导出（工具组菜单项）
    toolsExport: '收入导出',
    // REQ-035 批C: 散单记账（工具组菜单项）
    standaloneIncome: '散单记账',
    // REQ-035 批D: 图片水印（工具组菜单项）
    watermark: '图片水印',
    // REQ-035 批E: 进度拼图 / 排期公示（工具组菜单项）
    puzzle: '进度拼图',
    scheduleShare: '排期公示',
    // REQ-035 批A: 客户标记 + 老客召回（工具组菜单项）
    clientTags: '客户标记',
    returningClients: '老客召回',
    // REQ-035 工具集后置: 稿价计算器 / 社恐轻松回复 / 速记剪切板 / 截稿日建议（工具组菜单项）
    priceCalc: '稿价计算器',
    socialReply: '社恐轻松回复',
    quickNote: '速记剪切板',
    deadlineAdvice: '截稿日建议',
    // 812-tools-a: 新工具波 A（报价单/压图改尺寸；改稿计数已随 v128 下架，订单详情改用真实修改记录）
    quote: '报价单',
    imageResize: '压图改尺寸',
    // REQ-016 C: 侧边栏分组标题
    groupWork: '工作', groupBiz: '经营', groupTools: '工具', groupFront: '门面',
    // 工具箱收纳（纸墨提案 §5.5：导航一个把手 + 四个分类格子）
    toolbox: '工具箱', toolboxHint: '小工具都收在这里，按用途分了四格',
    toolboxCatMoney: '钱袋子', toolboxCatDelivery: '交付', toolboxCatClients: '客户', toolboxCatEfficiency: '效率',
    // 812 工具波 B: 价目分享卡 / 交付检查清单 / 定金台账（工具组菜单项）
    priceCard: '价目分享卡',
    deliveryChecklist: '交付检查清单',
    deposit: '定金台账',
    // oimimo 吸纳批五：小票打印机（工具组菜单项）
    receiptPrinter: '小票打印机',
  },
  // REQ-035 工具集后置: 稿价计算器（工具页文案）
  priceCalc: {
    title: '稿价计算器',
    subtitle: '客户询价时快速算个参考价，结果与客户看到的报价一致',
    // 818-B 布局打磨：分组卡片 + 组头描述（同类成组）
    stepStyleDesc: '画风不同价格不同，先选画风',
    stepSizeDesc: '尺寸影响价格和工期',
    stepAddonsDesc: '按需勾选，选完自动估算',
    loading: '加载中…',
    loadFailed: '画风与费率加载失败，请重试',
    stepStyle: '选画风',
    stepSize: '选尺寸',
    stepAddons: '增项（选填）',
    stepMultipliers: '倍率（选填）',
    noSizes: '该画风还没有配置尺寸，请先到价格管理添加',
    noStyles: '还没有配置画风与尺寸，请先到价格管理配置',
    workDays: '约 {n} 天',
    usage: '用途',
    rush: '加急',
    none: '无',
    basePrice: '基础价',
    multiplierNote: '倍率合计',
    optionPrice: '按选项计价',
    disclaimer: '仅供参考，以实际报价为准',
    // 815 K2-5: 算价失败保留上次结果并明示（禁止静默清空）
    calcFailed: '算价失败，已保留上次结果'
  },
  // REQ-035 工具集后置: 社恐轻松回复（工具页文案）
  reply: {
    title: '社恐轻松回复',
    subtitle: '预设话术直接复制，不好意思开口的场景照抄就行',
    // 818-B 布局打磨：组头 + 描述（同类成组）
    listTitle: '常用话术',
    listDesc: '点击复制，粘贴到聊天窗口直接发给客户',
    copy: '复制',
    copied: '已复制到剪贴板',
    copyFailed: '复制失败，请手动复制',
    cats: {
      remind: '催款',
      decline: '拒单',
      delay: '延期',
      negotiate: '谈价',
      daily: '日常沟通'
    }
  },
  // REQ-035 工具集后置: 速记剪切板（工具页文案）
  note: {
    title: '速记剪切板',
    subtitle: '随手记灵感、客户要求、待办，自动保存在本机浏览器',
    // 818-B 布局打磨：分组卡片 + 一行一事（说明在左，控件在右）
    formTitle: '新增速记',
    titleLabel: '标题（选填）',
    titleDesc: '给速记起个名字，方便之后查找',
    contentLabel: '内容',
    contentDesc: '记下灵感、客户要求或待办事项',
    listTitle: '全部速记',
    listDesc: '记录保存在本机浏览器，复制后可粘贴到任意聊天窗口',
    titlePlaceholder: '标题（选填）',
    contentPlaceholder: '记点什么…',
    add: '记一条',
    empty: '还没有记录，记下第一笔吧',
    untitled: '无标题',
    copy: '复制',
    delete: '删除',
    // A5: localStorage 数据删除后不可恢复
    deleteConfirm: '删除这条速记？删除后不可恢复。',
    copied: '已复制',
    copyFailed: '复制失败，请手动复制',
  },
  // REQ-040: 账号与安全页
  account: {
    title: '账号与安全',
    accountInfo: '账号信息',
    qqLabel: 'QQ 号',
    profileHint: '修改昵称、头像等个人资料请前往',
    profileLink: '主页设置',
    totpSection: '动态口令（TOTP）',
    totpBound: '已绑定',
    totpNotBound: '未绑定',
    totpRebind: '自助重绑',
    totpRebindStep1: '验证身份',
    totpRebindStep2: '扫描新二维码',
    totpRebindDone: '重绑完成',
    totpRebindPasskeyHint: '使用 Passkey 验证身份',
    totpRebindCodeHint: '输入当前验证器上的 6 位码',
    totpRebindNewCodeHint: '输入新绑定验证器上的 6 位码',
    totpRebindNewCodePlaceholder: '新验证器上的 6 位数字',
    totpRebindConfirm: '确认重绑',
    totpRebindCooldown: '重绑太频繁，{hours} 小时后再试',
    totpRebindSuccess: 'TOTP 已重绑成功，所有设备已强制登出，请重新登录',
    passkeySection: 'Passkey 登录设备',
    passkeyRegister: '注册本设备',
    passkeyRegistering: '正在注册…',
    passkeyDeviceName: '设备名',
    passkeyLastUsed: '最后使用',
    passkeyNeverUsed: '未使用',
    passkeyDelete: '删除',
    passkeyDeleteConfirm: '确定删除此 Passkey 凭据？删除后该设备无法使用 Passkey 登录。',
    passkeyEmpty: '还没有注册设备，点击右侧按钮注册',
    passkeyNotSupported: '当前浏览器不支持 Passkey（需 HTTPS 或 localhost）',
    // 818-H：安全项行结构（说明在左、操作在右）
    totpRowDesc: '绑定后登录需输入验证器上的 6 位动态口令；已绑定可随时自助重绑。',
    passkeyRowDesc: '已注册设备可免输口令登录；可在此重命名或删除。',
    // 波3-2: 凭据/重绑失败反馈（原静默失败补 ElMessage）
    passkeyLoadFailed: 'Passkey 凭据加载失败，请重试',
    passkeyRenameFailed: '设备名保存失败，请重试',
    passkeyDeleteFailed: '删除 Passkey 失败，请重试',
    totpRebindFailed: 'TOTP 重绑失败，请重试',
    // oimimo 吸纳批一：日历订阅（ICS）——手机日历同步排期与截稿日
    feedSection: '日历订阅',
    feedTitle: '同步到手机日历',
    feedDesc: '开启后生成一条私密订阅链接，添加到手机日历后，排期与截稿日自动同步。链接含私密令牌，请勿公开。',
    feedUrlLabel: '订阅链接',
    feedUrlDesc: 'iPhone：设置 → 日历 → 账户 → 添加已订阅日历；安卓：在支持订阅的日历应用中粘贴此链接。',
    feedCopy: '复制',
    feedCopied: '订阅链接已复制',
    feedRotate: '更换链接',
    feedRotateConfirm: '更换后旧链接立即失效，手机里需重新添加新链接，确定吗？',
    feedRotated: '链接已更换，请重新复制到手机',
    feedLoadFailed: '订阅状态加载失败，请重试',
    feedToggleFailed: '订阅开关操作失败，请重试',
  },
  // REQ-035 工具集后置: 截稿日建议（工具页文案）
  deadlineAdvice: {
    title: '截稿日建议',
    subtitle: '客户问「什么时候能好」时，快速算一个建议日期',
    groupCalc: '计算参数',
    workDays: '工期（天）',
    workDaysDesc: '从今天起向后数 N 天，作为建议交付日',
    queueMode: '按队列顺延',
    queueHint: '当前正式队列 {n} 单，每单约 1 天缓冲',
    compute: '算建议日期',
    resultLabel: '建议截稿日',
    today: '今天',
    workDaysShort: '工期',
    queueBuffer: '队列缓冲',
    totalDays: '合计',
    daysUnit: '天',
    ordersUnit: '单',
    disclaimer: '估算仅供参考，实际以排期和档期安排为准',
    weekdays: {
      sun: '周日', mon: '周一', tue: '周二', wed: '周三', thu: '周四', fri: '周五', sat: '周六'
    }
  },
  // REQ-035 批D: 今天吃什么（工具页文案）
  foodMenu: {
    title: '今天吃什么',
    subtitle: '选一个模式，随机推荐一道菜',
    groupChoose: '选择模式',
    modeLabel: '菜单模式',
    modeDesc: '按饮食约束选择今日菜池',
    pickLabel: '随机推荐',
    pickDesc: '从当前模式的菜池里随机抽一条，不满意可再抽',
    modes: {
      healthy: '健康版',
      diabetes: '糖尿病版',
      gout: '痛风版',
      takeout: '外卖版'
    },
    pick: '随机推荐',
    again: '换一个',
    disclaimer: '本推荐仅供参考，具体饮食请遵医嘱。',
    emptyHint: '点上方「随机推荐」按钮，看看今天吃什么',
    // b4-6 保底方案：英文界面先说明菜名为中文原文（翻译量另行排期）
    originalNamesNote: '当前为中文菜名，英文菜单还在做'
  },
  // REQ-031 A1: 收入导出 CSV（工具页文案）
  toolsExport: {
    title: '收入导出',
    subtitle: '按时间段导出收款流水（含退款负项），用于对账与报税',
    groupRange: '导出设置',
    rangeLabel: '时间段',
    rangeDesc: '含订单收款与散单收入',
    exportDesc: '生成 CSV 文件并开始下载',
    startPlaceholder: '开始日期',
    endPlaceholder: '结束日期',
    exportBtn: '导出 CSV',
    emptyHint: '该时间段无收款记录',
    note: '导出的 CSV 包含：日期、客户、金额（分）、类型（订单收款/散单收入）、订单号。数据与后端一致，不包含画师私有备注。',
    incomeOverview: '收入概览',
    incomeLoading: '加载中…',
    incomeOrder: '订单收款',
    incomeStandalone: '散单收入',
    incomeTotal: '总收入',
    incomeNote: '口径与导出 CSV 一致（订单收款 + 散单收入）',
    incomeLoadFailed: '收入概览加载失败',
    // oimimo 吸纳批四：收入趋势图（与上方概览同源同口径）
    incomeTrend: '收入趋势',
    incomeTrendLabel: '近 12 个月到账走势',
    incomeTrendDesc: '与上方收入概览同源同口径（订单收款 + 散单记账），按到账日归属月份',
    incomeTrendEmpty: '近 12 个月还没有到账记录',
    incomeTrendFailed: '收入趋势加载失败，请刷新重试',
    incomeMonthlyTitle: '每月到账（订单收款 + 散单）',
    incomeCumulativeTitle: '逐月累计',
    // oimimo 吸纳补遗：画风分布 + 客户排名（与上方同窗口同口径）
    incomeStyleTitle: '画风收入分布',
    incomeClientsTitle: '客户消费排名',
    incomeDistEmpty: '近 12 个月还没有订单到账记录',
    incomeUncategorized: '未分类',
    incomeClientOrders: '{n} 单',
    downloaded: '已开始下载',
    failed: '导出失败，请稍后重试',
    // 05D-E1: CSV 导出超时
    timeout: '导出超时，请重试'
  },
  // REQ-035 批C: 散单记账（工具页文案）
  standaloneIncome: {
    title: '散单记账',
    subtitle: '记一笔散单收入（定金、尾款、加急费等），随时对账',
    groupAdd: '记一笔',
    amountLabel: '金额（元）',
    amountDesc: '记一笔收入金额，自动换算为分',
    amountPlaceholder: '如 128.50',
    dateLabel: '日期',
    dateDesc: '默认今天，可按实际收款日修改',
    datePlaceholder: '选择日期',
    clientLabel: '客户昵称（选填）',
    clientDesc: '方便对账的客户标识，可不填',
    clientPlaceholder: '客户昵称，方便对账',
    noteLabel: '备注（选填）',
    noteDesc: '补充收款方式、订单来源等说明',
    notePlaceholder: '补充说明，如收款方式、订单来源',
    addBtn: '记一笔',
    adding: '保存中…',
    addSuccess: '已记入散单',
    addFailed: '保存失败，请稍后重试',
    listTitle: '记账明细',
    empty: '还没有散单记录，记下第一笔吧',
    loadFailed: '散单列表加载失败',
    anonymous: '匿名',
    delete: '删除',
    deleteConfirm: '确定删除这条散单记录吗？删除后不可恢复。',
    deleteSuccess: '已删除',
    deleteFailed: '删除失败，请稍后重试',
    notFound: '记录不存在或已删除',
    amountRequired: '请输入金额',
    amountPositive: '金额须大于 0',
    clientTooLong: '客户昵称不能超过 50 字',
    noteTooLong: '备注不能超过 200 字',
    dateRequired: '请选择日期'
  },
  // 812-tools-a: 报价单生成（工具页文案）
  quote: {
    title: '报价单',
    subtitle: '把条目和金额填进模板，生成图片或文字报价，发给客户确认',
    // 818-B 布局打磨：分组卡片 + 一行一事（说明在左，控件在右）
    groupContent: '报价内容',
    clientDesc: '显示在报价单顶部，方便客户确认',
    itemsDesc: '填条目名称与金额，至少一条有效条目才能生成',
    noteDesc: '补充修改次数、授权范围等说明',
    groupExport: '生成与复制',
    totalDesc: '全部条目金额合计',
    clientLabel: '客户称呼（选填）',
    clientPlaceholder: '如：张三、XX 工作室',
    itemsLabel: '条目列表',
    itemNamePlaceholder: '条目名称，如：头像 · 半身',
    itemAmountPlaceholder: '金额（元）',
    addItem: '添加条目',
    removeItem: '删除',
    emptyItems: '还没有条目，先加一行',
    noteLabel: '备注（选填）',
    notePlaceholder: '如：含 3 次修改、商用授权等',
    total: '合计',
    exportPng: '生成图片',
    copyText: '复制文字版',
    copied: '已复制到剪贴板',
    copyFailed: '复制失败，请手动复制',
    needItems: '请至少添加一条有效条目',
    imageGenerated: '图片已生成',
    imageFailed: '图片生成失败，请重试',
    // 画布固定模板文案（单模板填空，随语言切换）
    canvasTitle: '报价单',
    canvasClient: '客户：',
    canvasTotal: '合计：',
    canvasNote: '备注：',
    canvasFooter: '拾绘 Inkglean 生成',
    // 纯文字版行模板
    clientLine: '客户：{name}',
    totalLine: '合计：{total}',
    noteLine: '备注：{note}'
  },
  // 812-tools-a: 压图改尺寸（工具页文案）
  imageResize: {
    title: '压图改尺寸',
    subtitle: '本地缩放压缩图片，按平台预设导出 WebP，图片不出浏览器',
    chooseFile: '拖入图片，或点击选择',
    fileTypeError: '请选择图片文件',
    presetsLabel: '尺寸预设',
    presetXhs: '小红书 1242×1660',
    presetWeibo: '微博 1080 宽',
    presetAvatar: '头像 500×500',
    presetCustom: '自定义宽高',
    widthLabel: '宽',
    heightLabel: '高',
    widthPlaceholder: '宽度（px）',
    heightPlaceholder: '高度（px，留空等比）',
    qualityLabel: '质量',
    process: '开始压缩',
    processing: '处理中…',
    resultTitle: '压缩结果',
    resultDims: '输出尺寸：{w} × {h}',
    resultSize: '预估体积：{size}',
    originalSize: '原图：{size}',
    download: '下载 WebP',
    noImage: '请先选择图片',
    invalidDims: '宽高须为 1-10000 的整数',
    processFailed: '压缩失败，请换一张图片重试'
  },
  // REQ-035 批D: 图片水印（工具页文案）
  watermark: {
    title: '图片水印工具',
    sourceSection: '图片来源',
    watermarkSection: '水印设置',
    // 818-B 布局打磨：面板组头 + 描述，参数行一行一事
    sourceDesc: '选择图片来源，预览会实时更新',
    watermarkDesc: '调节文字、位置与透明度后导出',
    logoLabel: '水印图片',
    sourceNew: '新传图',
    sourceArtwork: '作品图',
    sourceDeliverable: '完稿图',
    chooseFile: '选择图片',
    selectOrder: '选择订单',
    emptyArtworks: '暂无作品',
    emptyDeliverables: '该订单暂无完稿图',
    watermarkType: '水印类型',
    textInputLabel: '水印文字',
    text: '文字水印',
    logo: 'LOGO 水印',
    logoAlt: 'LOGO',
    uploadLogo: '上传透明底 LOGO',
    logoScale: 'LOGO 缩放',
    modeLabel: '水印模式',
    modeCorner: '四角',
    modeStretch: '拉伸',
    modeTile: '平铺',
    opacity: '透明度',
    fontSize: '字号',
    margin: '边距',
    spacing: '间距',
    position: '位置',
    positionAll: '四角',
    posTopLeft: '左上',
    posTopRight: '右上',
    posBottomLeft: '左下',
    posBottomRight: '右下',
    posCenter: '中央',
    export: '导出图片',
    exporting: '导出中…',
    noImage: '请先选择图片',
    preview: '预览',
    renderError: '图片合成失败，请换一张图片重试',
    fileTypeError: '请选择图片文件（LOGO 需 PNG）',
    logoSaved: 'LOGO 已保存',
    // A8: logo 模式需先上传 LOGO 再预览/导出
    logoRequired: 'LOGO 模式下请先上传 LOGO，再预览或导出',
    // 波3-2: 加载失败错误态（区分失败与空列表）
    loadArtworksFailed: '作品列表加载失败，请重试',
    loadOrdersFailed: '订单列表加载失败，请重试',
    loadDeliverablesFailed: '完稿图加载失败，请重试'
  },
  // REQ-035 批E: 进度对比拼图（工具页文案）
  puzzle: {
    title: '进度对比拼图',
    subtitle: '把同一订单的多张图片拼成一张对比图，方便向客户展示进度',
    groupSteps: '拼图设置',
    selectOrder: '选择订单',
    orderDesc: '同一订单的图片才能拼成一张',
    selectImages: '勾选图片（2~6 张）',
    imagesDesc: '从完稿图与参考图中勾选，最多 6 张',
    arrange: '调整顺序',
    arrangeDesc: '导出时按这里的顺序从左到右排',
    up: '上移',
    down: '下移',
    export: '导出拼图',
    preview: '实时预览',
    noImages: '该订单暂无图片',
    needTwo: '至少选择 2 张图片',
    kindDeliverable: '完稿',
    kindReference: '参考',
    loadOrdersFailed: '加载订单列表失败',
    loadOrderFailed: '加载订单详情失败',
    exportFailed: '导出失败：部分图片受跨域限制，请重新选择',
    exported: '拼图已导出'
  },
  // REQ-035 批E: 排期公示（工具页文案）
  schedule: {
    title: '排期公示',
    subtitle: '生成可分享的排期状态，复制文本或下载图片发给客户',
    shareLabel: '导出分享',
    shareDesc: '把当前排期发给客户或发到社交平台',
    loading: '加载排期中…',
    copyText: '复制文本',
    downloadImage: '下载图片',
    queueFormal: '正式队列 {n} 单',
    queueBuffer: '缓冲队列 {n} 单',
    deadlineSoon: '近期截稿',
    statusBusy: '排期较满',
    statusNormal: '档期正常',
    statusFree: '档期宽松',
    statusLabel: '档期状态：',
    textHeader: '【拾绘排期】{artist}',
    noDeadline: '近期无截稿',
    brandFooter: '拾绘 · 排期公示',
    copied: '已复制',
    copyFailed: '复制失败，请手动复制',
    loadFailed: '加载排期数据失败',
    exported: '排期卡片已下载',
    exportFailed: '生成图片失败'
  },
  // REQ-035 批A: 客户标记（工具页文案）
  clients: {
    title: '客户标记',
    searchPlaceholder: '搜索QQ号',
    qq: 'QQ',
    tags: '标签',
    note: '备注',
    actions: '操作',
    edit: '编辑',
    delete: '删除',
    deleteConfirm: '确定删除该客户标记？',
    empty: '暂无客户标记',
    editTitle: '编辑客户标记',
    save: '保存',
    cancel: '取消',
    // 校验/反馈文案（后端规则子集：tags ≤20、每项 ≤20 字符；note ≤200）
    tagsMax: '标签最多 20 个',
    tagLength: '每个标签 1-20 个字符',
    noteMax: '备注最多 200 字',
    saveSuccess: '已保存',
    saveFailed: '保存失败，请稍后重试',
    deleteSuccess: '已删除',
    deleteFailed: '删除失败，请稍后重试',
    loadFailed: '加载失败，请稍后重试'
  },
  // REQ-035 批A: 老客召回（工具页文案）
  returning: {
    title: '老客召回',
    filterLabel: '统计区间',
    filterDesc: '按最近下单天数筛选老客',
    days30: '超过30天未下单',
    days60: '超过60天未下单',
    days90: '超过90天未下单',
    ordersColumn: '单数',
    totalOrders: '共 {n} 单',
    totalPaid: '累计',
    lastOrder: '最近一单',
    daysSince: '{n} 天未下单',
    copyScript: '复制话术',
    copySuccess: '话术已复制',
    copyFailed: '复制失败，请手动复制',
    empty: '暂无符合条件的客户',
    loadFailed: '加载失败，请稍后重试',
    script: '好久不见，最近开了新档期。你上次约稿是 {days} 天前了，有空来看看吗？'
  },
  // F3 快捷入口动作（2026-08-07 用户拍板）
  quickAction: {
    title: '设置',
    rules: '约稿须知编辑',
    share: '分享接稿页',
    quickconfig: '快捷入口',
    publish: '快速发作品',
    uploading: '发布中…',
    published: '作品已发布',
    publishFailed: '发布失败',
    notImage: '仅支持图片',
    copied: '接稿页链接已复制',
    noSubdomain: '未设置主页标识，去设置'
  },
  landing: {
    title: '拾绘 Inkglean', subtitle: '找到你喜欢的画师，开始约稿',
    noBio: '这位画师还没有写简介',
    noArtists: '还没有画师入驻', loadFailed: '加载画师列表失败',
  },
  // v0.34 任务A：独立 404 页
  notFound: {
    message: '你访问的页面不存在或已被移动。',
    backHome: '回平台首页',
    artistsTitle: '或者，去看看这些画师'
  },
  artistHome: {
    commission: '我要约稿', track: '查询进度',
    menuLabel: '菜单',
    noWorks: '暂无作品',
    priceList: '价格表', artworks: '作品展示', rules: '约稿须知', workflow: '约稿流程与收款',
    aboutDays: '约 {n} 天', loadFailed: '画师不存在或加载失败',
    hidden: '该画师暂未开放主页。如你是店主，请到「设置 → 主页展示」开启「小店展示」。',
    // 状态文字（useArtistData.statusText 动态键，模板不直写）
    statusOpen: '可约稿', statusFull: '已排满', statusBreak: '休息中', statusHidden: '已隐藏',
    navPricing: '价格', navWork: '作品', navRules: '约稿须知', navGuestbook: '留言板',
    startCommission: '开始约稿 →', trackOrder: '查询进度',
    // v0.42 Step 6: 客户端画廊「加载更多」
    loadMore: '加载更多',
    otherLink: '链接',
    revisionNote: '修改说明',
    // #9: 档位展示柜
    tierSelectBtn: '选择此档位', tierShowcase: '暂不接单', tierShowcaseBtn: '暂不接单',
    // R50: 预览模式
    previewBanner: '预览模式 — 修改尚未保存',
    // v0.25 A: 封面精选
    // v0.32 REQ-023 Phase3: 多画风价格表
    styleOrderBtn: '选择此画风约稿',
    // v0.34 任务B：尺寸选中后下单引导
    styleSizeHint: '已选 {size} · ¥{price}，点击下方按钮带此选择进入约稿',
    // 波 M：主页分块接口失败统一占位
    sectionLoadFailed: '部分内容加载失败'
  },
  orderForm: {
    backHome: '返回主页', title: '我要约稿',
    workflowLabel: '约稿流程',
    descLabel: '需求描述', descPlaceholder: '描述你想要的画面：角色特征、姿势、风格、背景等',
    // D 软提示（用户拍板：需求描述可空过，仅留空时提示一次，不拦截）
    descSoftTitle: '需求描述为空', descSoftMsg: '你还没有填写需求描述，确定继续吗？（画师可能不太清楚你的想法）',
    descSoftContinue: '继续',
    refLabel: '参考图（可选，最多5张，每张≤10MB）', refExceed: '最多上传5张参考图',
    refTip: '下单后画师也可在订单图库中补充参考图，订单图库合计上限 20 张。',
    refUpload: '上传参考图',
    qqLabel: '你的QQ号', qqPlaceholder: '画师会通过QQ联系你',
    nameLabel: '昵称（可选）', namePlaceholder: '怎么称呼你',
    notifyLabel: '排到我的时候通过QQ通知我', agreeLabel: '我已阅读并同意以上约稿须知',
    submit: '提交约稿', successTitle: '约稿提交成功！', orderNoIs: '你的订单号是：',
    addQqHint: '请添加画师QQ沟通细节，报上你的订单号即可', viewProgress: '查看进度',
    fillQq: '请填写QQ号', selectSizeFirst: '请先选择画风和尺寸',
    fileTooBig: '文件「{name}」超过10MB限制（{size}MB），请压缩后重新上传',
    typeWarning: 'JPG 或 WebP 预览效果更好，当前格式也可以正常上传。',
    // G-7（P2-13）: 参考图归属凭证获取失败（匿名凭证签发链路网络异常时提示）
    anonTokenRequired: '参考图凭证获取失败，请检查网络后重试',
    loadFailed: '加载画师信息失败',
    // R57: 草稿恢复
    draftTitle: '恢复草稿', draftFound: '检测到未提交的草稿，是否恢复？',
    draftRestore: '恢复', draftDiscard: '丢弃草稿', draftRestored: '草稿已恢复',
    // R58-6: QQ 跳转 + 复制
    artistQqLabel: '画师QQ', jumpQq: '跳转QQ', copyQq: '复制QQ', qqCopied: 'QQ号已复制', qqJumpHint: '正在唤起 QQ…若未打开，请复制 QQ 号手动添加好友',
    // F1 围剿：成功态追踪链接（全文 + 复制 + 二维码）
    saveTrackHint: '请保存此链接，查询进度凭此链接',
    copyTrackLink: '复制链接', trackLinkCopied: '追踪链接已复制', trackQrAlt: '追踪链接二维码',
    // R58-2: 分步引导
    step2: '写需求', step3: '联系方式',
    step2Title: '描述你的需求', step3Title: '留下联系方式',
    nextStep: '下一步', prevStep: '上一步',
    stepProgress: '第 {cur} 步，共 {total} 步',
    summaryTitle: '约稿摘要',
    // W3: 画风模式未选尺寸的空态引导
    summaryNoSize: '选好尺寸后这里会显示价格',
    // REQ-022 F3: 摘要卡客户信息回显
    summaryNickname: '昵称', summaryDescription: '需求描述',
    // E13: 摘要卡档位描述/工期/示意图
    summaryWorkDays: '约 {n} 天', summarySizeImgAlt: '尺寸示意图',
    // R58-3: 小票二次确认
    receiptSub: '· 约稿确认单 ·', receiptTotal: '合计', receiptConfirm: '确认下单', submitting: '提交中…',
    // R58-4: 灵感标签
    inspireHint: '没想好怎么写？点选灵感标签快速填入：',
    // R58-5: 复制约稿信息
    copySummary: '复制约稿信息', summaryCopied: '约稿信息已复制', summaryOrderNo: '订单号：',
    // v0.31 F3: 折扣码
    discountLabel: '折扣码', discountPlaceholder: '有折扣码？输入试试', discountValidate: '验证',
    discountEstimate: '预估折扣',
    // v0.32 REQ-023 Phase2: 多画风三步走
    styleStep: '选画风', sizeStep: '选尺寸', addonStep: '选增项',
    styleStepTitle: '选择画风', sizeStepTitle: '选择尺寸', addonStepTitle: '增项与加急',
    addonStepEmpty: '该尺寸下暂无可选增项',
    noSizeHint: '该画风暂未设置尺寸，可跳过直接继续',
    noSizeContinue: '跳过尺寸，继续',
    // SPEC-PRICE-2：增项步三区分组 + 用途/加急单选 + 展示态尺寸 + 价格明细
    noStylesHint: '画师暂未开放约稿配置，请稍后再来',
    addonGroupRegular: '普通增项（可多选）',
    addonGroupUsage: '用途（最多选一项）',
    addonGroupRush: '加急（最多选一项）',
    multOptionalHint: '可不选',
    sizeShowcaseTag: '展示中 · 暂不可约',
    sizeShowcaseBlocked: '该尺寸展示中，暂不可约稿',
    pctOfBase: '按基础价计算',
    priceCalcFailed: '价格计算失败，请稍后重试',
    priceSubtotal: '小计（基础价 + 增项）',
    previewBaseLine: '基础价（{size}）',
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
      agreeRequired: '请勾选「我已阅读并同意以上约稿须知」',
      termsRequired: '请先阅读并同意服务条款与隐私政策'
    }
  },
  track: {
    backHome: '返回主页', title: '查询进度', search: '查询',
    // F1 围剿：粘贴完整追踪链接（令牌承载身份）
    linkLabel: '追踪链接', linkPlaceholder: '粘贴下单时保存的完整追踪链接',
    pasteHint: '把下单成功页保存的链接粘贴到这里，即可查询进度',
    enterLink: '请先粘贴追踪链接',
    linkInvalid: '链接格式不正确，请粘贴下单时保存的完整追踪链接',
    linkExpired: '链接已失效，请联系画师补发',
    savedTitle: '已保存的追踪链接', savedQuery: '点击查询',
    orderNo: '订单号',
    artist: '画师', type: '类型',
    positionText: '第 {pos} 位 / 共 {total} 位', orderTime: '下单时间',
    // L-5（审计 七#1）: 缓冲队列文案由状态键驱动（后端不再硬编码中文）
    queued: '排队中', queuedPosition: '排队中（第 {pos} 位）',
    stepSubmitted: '已提交', stepConfirmed: '已确认', stepWip: '制作中', stepDone: '已完成', stepDelivered: '已交付',
    deliverables: '交付文件', otherOrder: '查询其他订单',
    // SPEC-003: 价格与付款
    priceTitle: '价格明细', finalPrice: '最终价格',
    // B7: 额度池付款进度
    payPaid: '已付', payNext: '下期应付', payRemaining: '待付', payTotal: '总额',
    // 815-P2 金额#2：收款后降价/多收场景的多付提示
    overpaid: '已多付 ¥{amount}，差额将由画师线下退还',
    // D-3（R-11）: 零元订单显式化
    zeroOrder: '0 元订单',
    zeroOrderHint: '本订单为 0 元，无需收款',
    searchFailed: '查询失败，请稍后重试',
    // U1: 需求回顾
    briefTitle: '需求回顾', briefRefAlt: '参考图',
    timeline: {
      title: '制作进度',
      current: '进行中',
      progress: '{name} {current}/{total}',
      revisionAt: '已回退到「{name}」',
      notStarted: '订单已提交，等待画师确认后进入制作流程',
      orderedAt: '下单时间：'
    },
    // REQ-031 C4: 时区显示
    tzBeijing: '北京时间',
    tzLocal: '你的当地时间',
    // REQ-031 A2: 订单收据
    receiptBtn: '收据',
    receiptTitle: '订单收据',
    receiptSub: '交付完成 · 只读凭证',
    receiptOrderNo: '订单号',
    receiptArtist: '画师',
    receiptItems: '付款节点',
    receiptTotal: '合计金额',
    receiptPaid: '已付',
    receiptRemaining: '待付',
    receiptNote: '逐笔收款明细将在后续版本提供'
  },
  // F4: 留言板（客户端留言墙，共享组件 TplGuestbook）
  guestbook: {
    title: '留言板',
    empty: '还没有留言，来说点什么吧',
    nickname: '昵称', nicknamePlaceholder: '怎么称呼你',
    content: '留言内容', contentPlaceholder: '想对画师说的话…',
    nicknameRequired: '请填写昵称', contentRequired: '请填写留言内容',
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
    filterLabel: '留言筛选',
    filterDesc: '按审核状态与留言语言筛选列表',
    all: '全部',
    replyLabel: '画师回复',
    editReply: '编辑回复',
    rejectConfirm: '确定拒绝这条留言？拒绝后客户主页将不显示。',
    // v130: 批量审核（批准/婉拒）
    selectAll: '全选',
    selectedCount: '已选 {n} 条',
    bulkApprove: '批量批准',
    bulkReject: '批量婉拒',
    bulkRejectConfirm: '婉拒选中的 {n} 条留言？客户主页将不再显示它们。',
    bulkDone: '已处理 {n} 条',
    // F8: 语言筛选
    languageAll: '全部语言',
    // 820-L：留言功能关闭空态
    disabled: '留言功能已关闭，重新开启后客户可继续留言。'
  },
  // v0.35 F6: 客户端画廊筛选 + 大图标签（共享组件 TplGallery）
  gallery: {
    filterAll: '全部',
    filterEmpty: '该档位下暂时没有作品',
    filterEmptyAll: '画师还没有上传作品',
    tierTag: '档位',
    prev: '上一张',
    next: '下一张'
  },
  delivery: {
    delivered: '作品已交付', notDelivered: '作品尚未交付',
    orderInfo: '订单号：{no} | 画师：{artist}', download: '下载',
    downloadFailed: '下载失败，请重试或联系画师', verifyFailed: '验证失败，请稍后重试',
    // 815 拍板 #4：一次性下载
    downloadLocked: '已下载',
    downloadLockedMsg: '该文件已下载过并被锁定，如需再次下载请联系画师再许可'
  },
  login: {
    // REQ-040: Passkey 登录按钮
    passkeyLogin: '使用 Windows Hello / 指纹登录',
    passkeyLogging: '正在验证身份…',

    // v0.46 纸墨登录页：品牌区（朱砂印 + 拾绘 + 副标）
    brandTitle: '拾绘', subtitle: '画师后台',
    // 偏好区：主题 + 语言（与后台同逻辑）
    prefThemeGroup: '主题切换', themePaper: '纸白', themeInk: '墨黑',
    prefLangGroup: '语言切换',
    // 表单
    qqLabel: 'QQ 号', qqPlaceholder: '输入你的 QQ 号',
    codeLabel: '动态口令', codePlaceholder: '验证器上的 6 位数字',
    login: '登 录', logging: '正在进站…',
    enterQq: '先填一下 QQ 号。', qqInvalid: 'QQ 号只有数字。',
    enterCode: '还差验证器里的 6 位数字。', codeInvalid: '动态口令是 6 位数字，看一眼验证器。',
    loginSuccess: '登录成功！',
    // 锁定错误（TOTP_LOCKED 带 remainingLockMs 时按此呈现剩余时长）
    locked: '尝试太多次，先锁一会儿——约 {minutes} 分钟后再试。',
    // 帮助：真实 TOTP 验证器推荐（2026-08-10 用户拍板重写：
    // 旧 helpTencent/helpAegis/helpNotGoogle 内容属臆测，已删；TOTP 是 RFC 6238 标准，任何标准验证器都能用）
    helpTitle: '需要验证器 App？点此查看推荐',
    helpDesc: '动态口令需要验证器 App 来生成，推荐口径如下：',
    helpNote: '绑定后每 30 秒刷新一次，登录时输入当前显示的 6 位数字。'
  },
  // P0-9: 倍率管理（MultiplierManager）i18n
  multiplier: {
  },
  // v0.42 Step5: 画师统计独立页（REQ-033 埋点三态：off 关 / hidden 不显 / on 开）
  stats: {
    title: '数据统计',
    totalEvents: '总事件数',
    byDay: '按日趋势',
    byName: '事件明细',
    disabledHint: '统计未开启，请在管理后台开启',
    empty: '暂无事件数据',
    loadFailed: '统计加载失败，请重试',
    // 820-L：统计功能管理员未开（默认关闭）
    featureDisabled: '统计功能未开启，请管理员开启后使用。',
    events: {
      dashboard_view: '工作台访问', queue_view: '排期看板', orders_view: '订单列表',
      manual_view: '手动录单', artworks_view: '作品管理', settings_view: '设置',
      tiers_view: '档位', guestbook_view: '留言', preferences_view: '偏好',
      dashboard_quick_click: '快捷操作', artist_page_enter: '主页访问', artist_action: '画师操作'
    }
  },
  // v0.42 Step5: 埋点三态（管理后台开关：关/不显/开）
  tracking: {
    modeOff: '关闭',
    modeHidden: '不显示',
    modeOn: '开启',
    saved: '已保存'
  },
  dashboard: {
    pendingNew: '待处理新单', activeOrders: '进行中订单',
    totalCompleted: '累计完成',
    statusUpdated: '状态已更新',
    statusOpen: '可约稿', statusFull: '已排满', statusBreak: '休息中',
    anotherOne: '换一句',
    plaqueHintOpen: '点一下 · 休息中',
    plaqueHintBreak: '点一下 · 可约稿',
    // E2: 挂牌满态——开稿面显示变体单字（藤黄点缀）
    plaqueFullChar: '满',
    ledgerEmpty: '今天账清了',
    ledgerSunk: '已了 · 沉底',
    ledgerSettle: '清账 · 撕页',
    ledgerSettled: '账清了，轻装上阵。',
    ledgerMonth: '本月已收',
    ledgerCooldown: '墨迹未干 {n}s',
    ledgerVerbConfirm: '确认',
    ledgerVerbStart: '开始制作',
    ledgerVerbDone: '✔ 完成',
    ledgerVerbAdvance: '推进 · {stage}',
    ledgerVerbDeliver: '去交付',
    scheduleTitle: '近期排期',
    scheduleExpand: '展开看板 →',
    scheduleEmpty: '近 7 日暂无排期',
    scheduleSummaryTitle: '订单摘要',
    scheduleSummaryClient: '客户',
    scheduleSummaryStage: '当前节点',
    scheduleSummaryStyle: '画风/尺寸',
    scheduleSummaryStart: '开工',
    scheduleSummaryDeadline: '截稿',
    scheduleSummaryStatus: '状态',
    scheduleSummaryDetail: '进订单详情',
    // 排期块四款式切换（批二子代理 F：ledger/ptags/waybill 三款共用，只加不改既有）
    scheduleToday: '今',
    scheduleMoreAria: '还有 {n} 条，去排期看板查看全部',
    greetSign: '—— 拾绘',
    // 自定义首页批二 G：印框款（seal）右上朱印印文
    greetStamp: '拾绘',
    annPrefix: '店公告',
    // 自定义首页批一：公告独立板块（自 GreetingNote 公告行拆出）
    annExpand: '查看全文',
    annCollapse: '收起',
    // 自定义首页批一：列表板块行数上限截断提示（todo/guestbook/activity 共用）
    listMore: '还有 {n} 条…',
    slotEarly: '清晨', slotMorning: '上午', slotNoon: '午后', slotAfternoon: '下午', slotEvening: '夜晚', slotMidnight: '深夜',
    panelQueue: '排期看板', panelOrders: '订单列表', panelManual: '手动录单', panelTiers: '价格管理', panelDashboard: '仪表盘',
    // F4: 留言审核
    guestbookTitle: '留言审核', guestbookEmpty: '暂无留言',
    guestbookPending: '待审核', guestbookApproved: '已通过', guestbookRejected: '已拒绝',
    guestbookApprove: '通过', guestbookReject: '拒绝', guestbookReply: '回复',
    guestbookReplyPlaceholder: '回复这位访客（≤500字）', guestbookReplySave: '保存回复',
    guestbookApprovedMsg: '留言已通过', guestbookRejectedMsg: '留言已拒绝', guestbookRepliedMsg: '回复已保存',
    guestbookError: '留言审核加载失败',
    // R52: 今日统计
    todayNewOrders: '今日新增订单', todayRevenue: '今日收入',
    // R51: 截稿日 + 今日待办
    // v0.18 仪表盘重构
    retry: '重试',
    todoTitle: '现在要干什么',
    tag_overdue: '逾期', tag_dueToday: '截稿', tag_pending: '新单', tag_revision: '修改', tag_inProgress: '进行中',
    activityTitle: '最近活动', activityError: '活动记录加载失败', activityEmpty: '暂无最近活动',
    timeJustNow: '刚刚', timeMinutesAgo: '{n} 分钟前', timeHoursAgo: '{n} 小时前', timeDaysAgo: '{n} 天前',
    // #4: 名额概览改版
    slotCombined: '已接 {used}/{total}',
  },
  queue: {
    title: '排期看板',
    hint: '拖拽卡片调整顺序，顺序立即保存。优先级仅作标记，不影响排列顺序。',
    confirm: '确认', startWip: '开始制作', done: '✔ 完成', deliver: '交付', cancel: '取消',
    empty: '队列空空，暂无订单',
    // REQ-037 C1: 拖拽排序成功提示 + 撤销
    reorderSuccess: '已调整顺序', reorderUndo: '撤销',
    // SPEC-004: 缓冲区
    bufferHint: '正式位满后新订单在此候补，递补后移入正式队列',
    bufferTag: '候补', bufferEmpty: '缓冲区暂无候补订单',
    promote: '递补', promoted: '已递补到正式队列',
    slideToCancel: '滑动确认取消订单', slideCancelConfirm: '确认取消订单', statusUpdated: '状态已更新',
    // 815 拍板 #1：已收款取消走内联二次确认（详见 QueueBoardList doCancelWithUndo；本键保留兼容）
    cancelPaidGoDetail: '该订单已有收款，请到订单详情页确认后取消',
    advanceStage: '推进到下一节点', stageAdvanced: '已推进到下一节点',
    workflowLoadFailed: '工作流节点加载失败，推进按钮已隐藏，请重试',
    // P0-3b: 标签切换
    tabFormal: '正式区', tabBuffer: '缓冲区',
    // REQ-013 #7: 工作流 done 订单交付入口 + 完成区
    goDeliver: '去交付',
    completedTitle: '近期已交付', completedHint: '已交付订单在此保留 7 天后自动隐藏',
    completedEmpty: '近期无已交付订单',
    dragHint: '拖拽排序',
    reorderLabel: '调整队列顺序', moveUp: '上移订单', moveDown: '下移订单',
    focusDisplay: '焦点图显示',
    focusDisplayDesc: '控制正式区与缓冲区订单是否显示焦点大图',
    uploadFocus: '上传焦点图',
    replaceFocus: '替换焦点图',
    // R53: 焦点图替换
    dropToReplace: '拖入替换焦点图',
    // SPEC-005: 月历视图
    viewBoard: '看板', viewCalendar: '月历', viewTimeline: '时间条',
    viewSwitchLabel: '视图切换',
    viewSwitchDesc: '在列表、月历与时间条之间切换排期视图',
    calPrev: '上个月', calNext: '下个月', calToday: '今天',
    calTitle: '{y}年{m}月',
    calMon: '一', calTue: '二', calWed: '三', calThu: '四', calFri: '五', calSat: '六', calSun: '日',
    calNoDeadline: '未设截稿',
    calLegendFormal: '正式订单', calLegendBuffer: '缓冲位', calLegendSoon: '临期', calLegendNoDeadline: '未设截稿', calLegendOverdue: '已逾期', calLegendDone: '已完成',
    // v0.25 D: 时间条视图（v0.36 波1: 四档缩放 2w/1m/3m/6m，删 2m）
    tlZoomLabel: '时间范围',
    tlZoomDesc: '缩放时间条显示的日期范围',
    tlZoom2w: '两周', tlZoom1m: '一个月', tlZoom3m: '三个月', tlZoom6m: '半年', tlZoom1y: '全年',
    // oimimo 吸纳批二：时间条显示范围过滤
    tlFilterLabel: '显示范围',
    tlFilterDesc: '只看进行中的单，专注当前排期；需要时切全部',
    tlFilterActiveOnly: '仅进行中',
    tlFilterAll: '全部',
    tlEmpty: '可见时间范围内没有订单',
    // v0.28: 时间条拖拽
    tlDragDeadline: '截稿 {d}', tlDragStart: '开工 {d}',
    tlDragMove: '{s} → {e}',
    // v0.36 波1: 拖拽撤销 toast 文案（替代旧 tlDragSaved）
    tlUndoDeadline: '截稿日已改为 {d}', tlUndoStart: '开工日已改为 {d}',
    tlUndoMove: '档期已移动 {s} → {e}', tlUndo: '撤销', tlUndone: '已恢复',
    tlDragDeadlineBeforeStart: '截稿日不能早于开工日',
    tlDragStartAfterDeadline: '开工日不能晚于截稿日',
    // D-1（R-5）: 时间条拖拽撞上他人已改（409 ORDER_CONFLICT）
    tlOrderConflict: '订单已被其他操作更新，请刷新后重试',
    // 批G(2026-08-08): 月历优化（MVP）
    calAvailable: '可接单',
    calDayViewTitle: '{d} · {n} 单',
    calMoreOrders: '还有 {n} 个订单',
    tlEditDates: '改期', tlEditStart: '开工日', tlEditDeadline: '截稿日', tlDateSaved: '日期已更新',
    calSelectMonth: '选择月份'
  },
  orderList: {
    title: '订单管理', all: '全部',
    // 818-H：筛选工具条按行结构整理
    filterTitle: '筛选订单',
    searchLabel: '搜索订单',
    searchDesc: '按昵称、QQ号、订单号或档位名过滤',
    filterLabel: '状态筛选',
    filterDesc: '按订单状态筛选列表',
    colOrderNo: '订单号', colType: '类型', colQq: '客户QQ', colName: '昵称',
    colPriority: '优先级', colStatus: '状态', colSource: '来源', colTime: '下单时间', colActions: '操作',
    colImage: '图片',
    // REQ-020 F1: 订单搜索
    searchPlaceholder: '搜索昵称 / QQ号 / 订单号 / 档位名', noSearchResult: '无匹配订单',
    fetchAllProgress: '正在拉取全部订单（{done}/{total}）…'
  },
  orderDetail: {
    backToQueue: '返回排期看板', backToDashboard: '返回仪表盘', backToList: '返回订单列表', orderNo: '订单 #',
    orderInfo: '订单信息', colOrderNo: '订单号', colType: '类型', colQq: '客户QQ', colName: '昵称',
    colPriority: '优先级', colSource: '来源', colTime: '下单时间', colDesc: '需求描述',
    confirmOrder: '确认接单', startWip: '开始制作',
    needRevision: '需要修改', markDone: '✔ 标记完成', uploadDeliver: '上传交付', cancelOrder: '取消订单',
    confirmCancel: '确认取消订单',
    // R-2: 已收款订单取消的二次确认（金额来自后端 detail.paidCents）
    cancelPaidConfirm: '该订单已收 ¥{amount}，确认取消？资金需线下退还',
    // 815 拍板 #1：取消 5 秒撤销
    cancelUndoHint: '订单 {label} 已取消，{s} 秒内可撤销',
    cancelUndoBtn: '撤销',
    cancelUndone: '已撤销取消，订单已恢复',
    cancelUndoExpired: '撤销窗口已过，无法恢复该订单',
    // 815 拍板 #4：交付文件一次性下载——画师再许可
    deliverableLocked: '下载已锁定',
    deliverableRepermit: '再许可下载',
    deliverableRepermitted: '已再许可，客户可再次下载',
    noNotes: '暂无备注', notePlaceholder: '添加备注...', addNote: '添加',
    deliverFiles: '交付文件', deliverTitle: '上传交付文件', dragUpload: '拖拽文件到此处，或点击上传',
    confirmDeliver: '确认交付', confirmTitle: '确认',
    statusUpdated: '状态已更新', priorityUpdated: '优先级已更新', noteAdded: '备注已添加', deliverSuccess: '交付成功！',
    // REQ-037 F1: 首载失败错误态（自助重试）
    loadFailed: '订单加载失败，请重试', loadFailedRetry: '重试',
    logLoadFailed: '操作记录加载失败，请重试',
    payLoadFailed: '收款流水加载失败，请重试',
    // REQ-022 F1: 发布为作品
    publishArtwork: '发布为作品', publishDialogTitle: '发布为作品',
    publishHint: '勾选交付图发布为作品（复制到公开作品区，原交付文件保留）。',
    publishNotImage: '非图片，不可发布', publishTitleLabel: '标题', publishTitlePlaceholder: '给这批作品起个标题',
    publishDescLabel: '描述（可选）', publishDescPlaceholder: '补充说明（可选，≤500 字）',
    publishSubmit: '发布', publishSuccess: '已发布 {n} 件作品',
    publishDoneTitle: '发布完成', publishGoManage: '已发布 {n} 件作品，去作品管理页看看？',
    uploadTip: '支持图片及压缩包，单文件不超过 50MB',
    invalidFileType: '不支持的文件格式，请上传图片或压缩包',
    fileTooLarge: '文件过大（最大 50MB）', referenceImage: '参考图',
    noReferences: '暂无参考图',
    focusUpdated: '焦点图已更新',
    deleteRef: '删除参考图', deleteRefConfirm: '确定删除这张参考图？删除后不可恢复。', deleteRefSuccess: '参考图已删除',
    stageOff: '关闭流程跟踪',
    stageProgress: '进度 {current}/{total}', stageRevision: '已打回修改',
    // v128: 修改记录（手动修改+打回均计一次，口径用户拍板）
    revisionTitle: '修改记录', revisionTotal: '共 {n} 次',
    revisionManual: '手动修改', revisionRollback: '打回',
    advanceTo: '推进到：', stageBack: '↩ 打回上一节点', stageUpdated: '流程已更新',
    stageBackConfirm: '确定打回到「{name}」？订单状态将标记为修改中。',
    stageOffConfirm: '关闭后此订单不再跟随工作流程，回到固定状态流转。确定关闭？',
    stageOffDone: '已关闭流程跟踪',
    gallery: '订单图库', galleryUpload: '上传图片', galleryUploadSuccess: '图片已添加',
    setFocus: '设为焦点图',
    openViewer: '查看参考图 {n}',
    galleryHint: '点击图片放大预览 · 点 ✓ 设为焦点图 · 支持拖拽 / 点击 / Ctrl+V 上传 · 客户图 + 画师图合计最多 20 张',
    galleryNotImage: '仅支持图片文件', galleryTooBig: '图片超过 10MB 限制',
    anonTokenRequired: '参考图凭证获取失败，请检查网络后重试',
    uploading: '上传中...', sourceClient: '客户', sourceArtist: '画师',
    noteImage: '备注附图', noteImageSingle: '备注仅支持 1 张附图，已使用第一张',
    noteImageUpload: '上传备注附图', viewNoteImage: '查看备注附图大图',
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
    colDeadline: '截稿日', deadlinePlaceholder: '选择截稿日',
    // v0.26 B: 开工日
    colStartDate: '开工日', startDatePlaceholder: '选择开工日',
    deadlineAutoSet: '已按工期自动设置截稿日',
    // v0.38: 日期卡二合一（REQ-026 §四）——两字段一卡 + 即时保存「排期已同步」+ 剩余天数 chip
    dateCardTitle: '日期',
    deadlineSavedSync: '截稿日已保存，排期已同步',
    startDateSavedSync: '开工日已保存，排期已同步',
    daysLeft: '剩 {n} 天', daysOverdue: '逾期 {n} 天', daysToday: '今天截稿',
    dateSyncNote: '改期会自动同步到月历与时间条视图',
    // R58-6: QQ 跳转 + 复制
    jumpQq: '跳转QQ', copyQq: '复制QQ', qqCopied: '客户QQ已复制',
    // F1 围剿：画师补发客户追踪链接（新令牌作废旧令牌，旧链接失效）
    copyTrackLink: '复制客户追踪链接',
    regenerateTokenConfirm: '重新生成后，客户保存的旧链接将立即失效。确认生成新链接？',
    regenerateTokenConfirmBtn: '生成新链接',
    regenerateTokenSuccess: '新追踪链接已复制（旧链接已失效）',
    regenerateTokenFailed: '生成失败，请稍后重试',
    // K1-2: 令牌重生成成功但剪贴板不可用——单独提示手动复制
    regenerateTokenManualTitle: '新链接已生成，请手动复制',
    regenerateTokenManualHint: '剪贴板不可用；以下为新追踪链接（旧链接已失效）：',
    // plan-node-speech：客户沟通小块
    commTitle: '客户沟通',
    commPriceSummary: '价格小结：总价{total} / 已付{paid} / 待付{unpaid}',
    commCopyBtn: '复制文案并唤起QQ', commCopied: '已复制节点文案，正在唤起QQ',
    commNoQq: '未设置客户QQ', commNoStage: '该订单未接入流程节点，暂无话术', commNoSpeech: '当前节点暂无话术',
    // B7: 额度池收款区
    payTitle: '收款记录', payAddBtn: '+ 记录收款',
    payPaid: '已收', payFinal: '应收', payRemaining: '待收', payOverpaid: '多收',
    payFlowTitle: '收款流水', payRevoke: '撤销', payEmpty: '暂无收款记录',
    payRefTitle: '应收参考（工作流节点）',
    payRefPaid: '已收', payRefPartial: '部分 {amount}', payRefPending: '待收',
    payDialogTitle: '记录收款', payAmountLabel: '收款金额（元）', payAmountPlaceholder: '输入金额',
    payNoteLabel: '备注（可选）', payNotePlaceholder: '如：微信转账、定金',
    // REQ-025 二阶段: 负数（退款/撤销）时备注 label 切换（与提交强制校验一致）
    payRefundNoteLabel: '退款原因（必填）',
    paySuccess: '收款已记录', payRevokeConfirm: '确认撤销 {amount} 的收款记录？', payRevokeSuccess: '已撤销',
    paymentRevertNote: '撤销 #{id}',
    // 收款金额前端范围校验（后端 addPayment 规则一致；负数=退款/撤销路径）
    payAmountInvalid: '收款金额须大于 0',
    payAmountZero: '金额不能为 0', payRefundNoteRequired: '退款或撤销时请填写原因', payRefundExceed: '退款金额不能超出已收金额 ¥{amount}',
    // v0.31 F4: 节点收款
    payNodePaid: '已收', payNodeDue: '应收', payNodeRemain: '差额',
    payNodeCollect: '收款', payNodeTitle: '「{name}」节点收款',
    nodePayNoteFallback: '{name}收款',
    // v0.31 F5 → REQ-025 二阶段: 待收横幅（主信息=订单级总待收，副信息=当前节点）
    totalDueLabel: '共待收 {amount}', currentDueSuffix: '当前：{name} {amount}',
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
    },
    // REQ-031 B1: 完稿分享
    shareBtn: '分享',
    shareDialogTitle: '分享完稿',
    sharePlatformLabel: '发布平台',
    shareTextLabel: '分享文案',
    shareTextPlaceholder: '写点想说的话（可含占位符）',
    sharePlaceholders: '可用占位符',
    shareTemplate: '今日份新图！订单 {orderNo} 完成交付~ 欢迎围观 🎉 主页：{homepage}',
    shareOpenBtn: '打开发布页',
    shareOpened: '已在新窗口打开发布页',
    shareCopied: '文案已复制，请在发布页粘贴',
    shareNoHomepage: '文案包含 {homepage}，但未找到该平台主页链接——请先在「主页设置」添加对应平台的链接',
    // 波3-2: 分享平台列表加载失败错误态 + 重试
    shareLoadFailed: '分享平台列表加载失败，请重试',
    // 818-D: 再来一单（基于历史订单一键复用信息开新单）
    reorderBtn: '再来一单',
    reorderDialogTitle: '再来一单',
    reorderDialogHint: '客户QQ与昵称将无条件带入；其余按勾选回填，进入录单页后全部可改。',
    reorderFillDesc: '需求描述',
    reorderFillStyle: '款式尺寸',
    reorderFillNote: '备注',
    // 819-J 二期: 参考图（勾选后源单参考图路径引用复用，不重复上传）
    reorderFillRefs: '参考图',
    reorderConfirm: '去录新单'
  },
  manualOrder: {
    title: '手动录单', hint: '也可以直接粘贴客户的QQ消息，自动识别QQ号与金额、日期线索。',
    leftTitle: '客户信息', rightTitle: '价格信息',
    clientQq: '客户QQ号', clientQqPlaceholder: '5-15 位数字',
    clientName: '客户昵称（可选）', clientNamePlaceholder: '怎么称呼客户',
    addons: '可选增项',
    usage: '用途', rush: '加急',
    totalPrice: '总价', finalPrice: '最终价格（元）', finalPriceHint: '可手动修改，留空则使用计算价',
    priceDetail: '明细',
    desc: '需求描述', descPlaceholder: '从QQ聊天中复制客户的需求描述',
    // 818-D: 备注（再来一单回填源单备注；创建后写入新单）
    note: '备注（选填）', notePlaceholder: '需要跟单记录的备注信息（如沟通要点、线下约定）',
    references: '参考图（可选，最多5张，每张≤10MB）', refExceed: '最多上传5张参考图', fileTooBig: '{name} 过大（{size}MB），上限10MB',
    refTip: '录单后仍可在订单图库中补充参考图，订单图库合计上限 20 张。',
    // G-7（P2-13）: 参考图归属凭证获取失败（匿名凭证签发链路网络异常时提示）
    anonTokenRequired: '参考图凭证获取失败，请检查网络后重试',
    priority: '优先级', priorityHigh: '高', priorityMedium: '中（默认）', priorityLow: '低',
    clientNotify: '允许客户接收QQ排队提醒',
    submit: '录入订单', resultTitle: '录入成功', orderNo: '订单号: {no}', addedToQueue: '已加入排期队列',
    viewQueue: '查看排期', continueEntry: '继续录入', fillClientQq: '请填写客户QQ号',
    // R51: 截稿日
    deadline: '截稿日（可选）', deadlinePlaceholder: '选择截稿日',
    // F2: 拖拽上传提示
    dragHint: '拖拽图片到此处，或点击上传', uploadRefLabel: '上传参考图',
    // F3: 开稿日
    startDate: '开稿日（可选）', startDatePlaceholder: '选择开稿日',
    // B2: 开稿日晚于截稿日的提交拦截
    dateConflict: '开稿日不能晚于截稿日',
    // F4: 初始节点状态
    initialStatus: '初始节点状态', initialStatusHint: '线下已谈好的单子可直接跳过确认环节',
    // REQ-015: QQ历史面板
    historyTitle: '该客户的历史订单', newClient: '新客户，暂无历史订单',
    // REQ-035 批A: 客户信息卡汇总文案
    clientSummaryOrders: '共 {n} 单',
    clientSummaryPaid: '累计 ¥{amount}',
    clientSummaryLast: '最近一单 {date}',
    // v0.38 D路: 画风模式（画风→尺寸→增项 三级选择）
    styleTitle: '选择画风', sizeTitle: '选择尺寸', sizeDays: '{n}天',
    noSizes: '该画风下暂无尺寸',
    // v0.38 补漏批: R2 自定义单提示 / R5 自定义增项 / R6 图片开关
    customHint: '都可以不选，直接手动填价格录入自定义单',
    showImages: '显示图片',
    customAddons: '自定义增项', addCustomAddon: '添加',
    customAddonNamePlaceholder: '名称（必填，≤50字）',
    customAddonPricePlaceholder: '金额（可填负数作为优惠）',
    customAddonNameRequired: '请填写自定义增项名称',
    customAddonPriceRequired: '请填写自定义增项金额',
    removeCustomAddon: '删除自定义增项',
    customAddonMax: '最多添加 20 条自定义增项',
    selectSizeOrPrice: '请先选择画风和尺寸，或手动填写最终价格',
    // F6: 录单草稿（localStorage 暂存 + 恢复提示）
    draftFound: '发现未提交的录单草稿，是否恢复？',
    draftRestored: '已恢复草稿',
    // REQ-037 E3: 恢复弹窗按钮文案显式化（旧 common.cancel「取消」实为丢弃草稿）
    draftRestore: '恢复', draftDiscard: '丢弃草稿',
    // 巡检修复批 A1: 录单后补写失败提示
    postCreateFailed: {
      price: '价格写入失败：{message}',
      extraItem: '自定义增项「{name}」写入失败：{message}',
      deadline: '截稿日写入失败：{message}',
      startDate: '开稿日写入失败：{message}',
      initialStatus: '初始状态设置失败：{message}',
      note: '备注写入失败：{message}',
      summary: '订单 {orderNo} 已创建，但{reason}。请在订单详情中补充。'
    },
    // 818-D: 再来一单预填
    reorderSourceFailed: '读取原订单失败：{message}',
    reorderPrefilled: '已带入订单 {no} 的信息，可修改',
    // 819-J 二期: 参考图预填降级/截断
    reorderNoRefs: '源单没有参考图',
    reorderRefsTruncated: '参考图超过 {count} 张，仅带入前 {count} 张',
    // REQ-035 §五 MVP-1: 粘贴消息解析
    parseMessageTitle: '粘贴消息解析',
    parseDialogTitle: '粘贴消息解析',
    parsePlaceholder: '粘贴客户发来的消息，自动识别 QQ 号与线索…',
    parseBtn: '解析',
    parseQqLabel: '客户QQ',
    parseQqEmpty: '未识别（留空，请手动填写）',
    parseNameLabel: '客户昵称',
    parseAmountLabel: '金额线索',
    parseAmountValue: '{amount} 元',
    parseDeadlineLabel: '日期线索',
    parseNone: '未识别',
    parseConfirmTip: '金额与日期仅作线索提示，不会自动填入，请人工核对后填写。',
    parseApply: '填入表单',
    parseApplied: '已填入表单，请核对后提交',
    // 820 第二批：本地图片识别（懒加载走公共 CDN，首次使用下载识别库）
    parseImageBtn: '识别图片',
    parseImageBusy: '正在识别…首次使用需下载几 MB 识别库，请稍候',
    parseImageTip: '可直接 Ctrl+V 粘贴聊天截图，识别成文字后自动走解析',
    parseImageEmpty: '图片里没认出文字，请换更清晰的截图',
    parseImageDone: '识别完成，请核对上方文字与解析结果',
    parseImageNotImage: '请提供图片文件（PNG/JPG/WebP/BMP/GIF）',
    parseImageTooBig: '图片超过 {max}MB，请压缩后重试',
    parseImageFailed: '识别失败：首次使用需联网下载识别库，请检查网络后重试',
    // 波3-2: 初始化失败错误态（subdomain/报价元数据失败时报价功能不可用要有感知）
    initLoadFailed: '录单数据加载失败，报价与画风功能可能不可用，请重试'
  },
  tiers: {
    title: '价格管理',
    dragHint: '拖拽排序', reorderSaved: '排序已保存',
    daysUnit: '{n}天',
    // #10: 档位三态
    // R55: 示例图拖拽直传
    // R54: 卡片布局空状态
    // v0.28 T3: Tab 标签 + 操作文案 i18n 化
    tabWorkflow: '流程与比例',
    tabDiscount: '折扣码',
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
    empty: '还没有折扣码，点击"新建折扣码"创建',
    // 05D-T2: 行内复制
    copyCode: '复制', copied: '已复制到剪贴板', copyFailed: '复制失败，请手动复制'
  },
  // v0.32 REQ-023 Phase1: 画风管理 + 增项库
  styleManage: {
    tabTemplates: '增项库', confirmTitle: '确认',
    // 增项库（SPEC-PRICE-2：类别/控件/计价方式/数量上限全维度管理）
    tplIntro: '普通增项、用途、加急统一在这里维护，再到「画风与价格」页挂到各画风。',
    tplName: '名称', tplControl: '控件', tplDefaultPrice: '默认价', tplActions: '操作',
    tplCategory: '类别', tplCategoryLabel: '类别', tplMaxQty: '数量上限', tplMaxQtyLabel: '数量上限（个数类防刷）',
    tplEmpty: '还没有增项模板，点击"新建增项"创建', tplAdd: '+ 新建增项',
    tplAddTitle: '新建增项', tplEditTitle: '编辑增项',
    tplNameLabel: '名称', tplNamePlaceholder: '如：加人、背景、商用、加急', tplNameRequired: '请输入增项名称',
    tplControlLabel: '控件类型', tplControlSwitch: '开关', tplControlQuantity: '个数',
    tplPricingLabel: '计价方式', tplPricingFixed: '固定金额 ¥', tplPricingPercent: '百分比 +%',
    tplPriceLabel: '默认价格',
    tplUnitLabel: '单位标签', tplUnitPlaceholder: '如：人、张、个',
    tplSaved: '增项已保存', tplDeleted: '增项已删除', tplDeleteConfirm: '确定删除增项「{name}」？已引用它的画风会保留为独立增项（不再跟随库更新）。',
    // 波3-2: 模板列表加载失败错误态（区分真空与失败，避免误导"没有模板"）
    tplLoadFailed: '增项模板加载失败，请重试',
    unitDefault: '个',
    // 813-fq-tail-shared 战役 S：数量型增项未填单位时的兜底文案（替代 money.js 硬编码「位」）
    unitFallback: '位',
    // 画风
    styleAddTitle: '新建画风', styleEditTitle: '编辑画风',
    styleNameLabel: '画风名称', styleNamePlaceholder: '如：日系、厚涂、像素风', styleNameRequired: '请输入画风名称',
    styleDescLabel: '描述（可选）', styleDescPlaceholder: '适合什么风格、什么场景',
    styleCoverLabel: '示例图（可选）', styleCoverUpload: '上传示例图', styleCoverChange: '更换示例图',
    styleImportAddons: '从增项库导入', styleImportHint: '勾选后，增项库中所有增项将自动导入到该画风（默认启用，可逐个调整）',
    styleSaved: '画风已保存', styleDeleted: '画风已删除', styleDeleteConfirm: '确定删除画风「{name}」？其下所有尺寸、增项配置和覆盖将一并删除。',
    styleActive: '启用', styleEmpty: '还没有画风，点击"新建画风"开始配置',
    // 812-B B7: 无画风空态引导
    styleEmptyGuide: '创建你的第一个画风并添加尺寸，客户即可按画风约稿。',
    styleEmptyCta: '创建我的第一个画风',
    // 尺寸
    sizeTitle: '尺寸与基础价', sizeName: '尺寸', sizePrice: '基础价',
    sizeNamePlaceholder: '如：头像、半身、全身', sizeNameRequired: '请输入尺寸名称',
    sizeSaved: '尺寸已保存', sizeAdded: '尺寸已添加', sizeDeleted: '尺寸已删除',
    sizeDeleteConfirm: '确定删除尺寸「{name}」？该尺寸下的覆盖配置将一并删除。',
    // 增项
    addonTitle: '增项（从增项库导入）',
    addonSaved: '增项配置已保存',
    // 尺寸覆盖
    // v0.35 波1 (REQ-024 F2/F1): 合并入口 + 多画风开关 + 尺寸编辑扩展
    tabStylesAndPricing: '画风与价格',
    multiStyle: '多画风',
    multiStyleHintOff: '关闭：客户只显示默认画风（排在最上的启用画风）；其余画风灰色保留，可点「设为默认」切换',
    multiStyleHintOn: '开启：所有启用的画风对客户可见；拖拽卡片可调展示顺序',
    toolbarStatusOn: '全部启用画风可见',
    toolbarStatusOff: '客户只见默认画风',
    multiStyleLastGuard: '只剩最后一个启用的画风，不能关闭多画风',
    createStyleBtn: '新建画风',
    setAsDefault: '设为默认',
    defaultChanged: '已设为默认并移到最上',
    poolRowEmpty: '暂无',
    styleLocked: '多画风开关已关闭，仅默认画风可编辑',
    styleDefaultTag: '默认',
    sizeAddTitle: '添加尺寸', sizeEditTitle: '编辑尺寸',
    sizeImageLabel: '尺寸图（可选）', sizeImageUpload: '上传新图', sizeImagePick: '从作品集挑选',
    sizeImageRemove: '移除图片', sizeImageHint: '不设置时，客户端显示画风封面兜底',
    sizeImageSavedMsg: '尺寸图已更新', sizeImageUploadHint: '尺寸图已上传，点保存后生效',
    sizeDescLabel: '描述（可选）', sizeDescPlaceholder: '这个尺寸包含什么、适合什么',
    sizeDaysLabel: '工期（天，可选）',
    sizeFromArtworkTag: '作品集', sizeAddBtn: '+ 添加尺寸', sizeEmpty: '还没有尺寸',
    sizePickTitle: '从作品集挑选', sizePickHint: '点击选择一张作品作为尺寸图', sizePickEmpty: '还没有作品，请先去作品管理上传',
    // v0.35 补漏 A4: 已有画风追加导入增项
    addonImportTitle: '从增项库导入',
    addonImportEmpty: '增项库中没有新增项可导入（都已导入该画风）',
    addonImportConfirm: '导入所选', addonImported: '增项已导入',
    // REQ-036 批A: 增项交互直觉化（双入口/池+拖拽/三态/三层弹窗/预览/摘要）
    // 双入口
    addonCreateBtn: '+ 新建增项', addonPickBtn: '+ 从已有挑选',
    // 池子
    addonCapHint: '点击设置 / 拖到尺寸行启用',
    addonAlreadyEnabled: '「{name}」在「{size}」已启用，无需重复拖入',
    addonEnabled: '已启用：{size} ＋ {name}',
    addonDisabled: '已停用：{size} － {name}',
    addonDragBackHint: '拖回池子 = 停用',
    // 新建增项弹窗
    createTitle: '新建增项', createNameLabel: '增项名称', createNamePlaceholder: '如：背景、加人、商用、加急…',
    // SPEC-PRICE-2 (2026-08-09): 类别=后端真实维度 category（普通增项/用途/加急）
    catAdd: '普通增项', catUsage: '用途', catRush: '加急',
    createKindLabel: '类别',
    createCatHintAdd: '普通增项加在基础价上，可多选共存；百分比计价的按基础价计算（不受其他增项影响）',
    createCatHintMultiplier: '用途/加急是计价公式中的乘法位：下单时各选一个生效，乘在普通增项小计之后（开关控件 + 百分比）',
    createControlLabel: '控件类型（顾客怎么选）',
    createPricingLabel: '计价方式', pricingPercent: '百分比 +%', pricingFixed: '固定金额 ¥',
    pricingHintFixed: '固定金额：直接加 ¥N；个数类 = 单价 × 数量',
    pricingHintPercent: '百分比：只按基础价计算，如 50 = 基础价 × 50%',
    createPercentLabel: '百分比（%）', createPercentRangeHint: '百分比须为 0-1000 的整数',
    createUnitLabel: '单位', createUnitPlaceholder: '如：位、张、个',
    createMaxQtyLabel: '数量上限（防刷）', createMaxQtyHint: '顾客一次最多可加的个数，如 10',
    createPriceLabel: '默认价格（元）',
    createSaveHint: '保存后自动挂到本画风，并沉淀进增项库供其他画风复用；若与库中同名会先询问',
    createSaveBtn: '保存并挂载', createNameRequired: '请输入增项名称',
    createDuplicateTitle: '库中已有同名', createDuplicateMsg: '增项库中已有「{name}」，直接挂载 or 另建独立？',
    createAttach: '直接挂载', createNew: '另建独立', createAttached: '已挂载库中模板',
    addonCreatedAttached: '已新建并挂载到本画风', addonAttached: '已挂载到本画风',
    // 三层设置弹窗
    addonDialogTitle: '「{name}」设置', addonTplLevel: '模板级（本身价格 · 影响所有引用画风）',
    addonScopeStyle: '仅当前画风', addonScopeAll: '应用到所有画风',
    addonScopeHintStyle: '改基础属性（名称/控件类型/本身价）并保存：仅影响当前画风',
    addonScopeHintAll: '改基础属性并保存：同时影响所有引用此增项的画风',
    addonStyleLevel: '画风级（本画风）', addonStyleEnable: '本画风激活',
    addonStylePriceOverride: '画风价（已覆盖模板价）：{price}', addonStylePriceTemplate: '沿用模板价：{price}',
    addonSizeLevel: '尺寸级（拖拽的精确版）', addonBatchAll: '全部启用', addonBatchOff: '全部关闭',
    addonBatchHint: '差异价留空 = 沿用画风价', addonSizeCol: '尺寸', addonEnableCol: '启用', addonDiffPriceCol: '本尺寸差异价',
    addonPricePriority: '价格优先级：本尺寸 > 画风价 > 本身价',
    addonRemove: '移除（解绑本画风）',
    addonRemoveConfirm: '确定从本画风移除「{name}」？增项库会保留，可从「从已有挑选」再次选回。', addonRemoved: '已移除（解绑）',
    // 预览弹窗（SPEC-PRICE-2 公式：(基础价+固定增项+百分比增项[只基于基础价])×用途×加急−折扣）
    previewBtn: '预览', previewTitle: '顾客视角预览', previewReadonly: '只读预览 · 顾客看到的样子',
    previewComposition: '价格构成', previewBase: '基础价（{name}）', previewEmpty: '该尺寸未启用增项',
    previewQtyEstimate: '按 ×1 预估 · 数量下单时选', previewPctOfBase: '按基础价计算',
    previewSubtotal: '小计（基础价 + 增项）',
    previewUsageLabel: '用途（选一）', previewRushLabel: '加急（选一）',
    previewMultHint: '用途/加急由顾客下单时各选一个，在小计之后相乘；上方小计未包含。',
    previewFormula: '计价公式：（基础价 + 固定增项 + 百分比增项）× 用途 × 加急 − 折扣；百分比增项只按基础价计算',
    previewClose: '关闭', previewStatusOpen: '可约', previewStatusShow: '展示中 · 顾客可见但不可约稿', previewStatusClose: '已关闭 · 顾客不可见',
    // 尺寸三态
    sizeStatusOpen: '可约', sizeStatusShow: '展示', sizeStatusClose: '关闭',
    styleInactiveTag: '已停用',
    // 尺寸摘要行
    sizeSummaryLabel: '已配增项', sizeSummaryEmpty: '未启用增项（可拖入上方胶囊）'
  },
  artworks: {
    title: '作品管理', dragUpload: '拖拽图片到此处，或点击上传作品',
    tip: '支持 JPG / PNG / WebP，建议尺寸 ≥ 800px', empty: '暂无作品',
    emptyHint: '上传图片后，作品会展示在这里',
    uploaded: '上传成功', confirmDelete: '确定删除这张作品？', image: '作品图片', untitled: '未命名作品',
    // 820-K：工具条按行结构整理
    manageGroup: '管理工具',
    manageLabel: '批量管理', manageDesc: '进入多选模式，可一次删除多张作品',
    uploadTitle: '图片上传',
    // R45: 多选删除
    manage: '管理', manageDone: '完成',
    selected: '已选 {n} 项',
    batchDeleteTitle: '批量删除', batchDeleteConfirm: '确定删除选中的 {n} 张作品？删除后不可恢复。',
    batchDeleted: '已删除 {n} 张作品', batchPartial: '删除完成：成功 {ok} 张，失败 {failed} 张',
    slideToDelete: '滑动到底部确认删除', batchDeleteBtn: '确认删除选中作品',
    // REQ-017: 封面操作
    coverSet: '设为封面', coverUnset: '取消封面',
    coverSetSuccess: '已设为封面', coverUnsetSuccess: '已取消封面',
    coverTag: '封面',
    // F7: 主图去重
    mainImages: '主图', mainTag: '主图', galleryTitle: '作品列表',
    // v0.31: 多封面排序
    coverMoveUp: '前移', coverMoveDown: '后移', coverReordered: '封面顺序已更新',
    // v0.35 波3 (REQ-024 F6): 作品编辑（档位标注+自由描述）
    editTitle: '编辑作品', editTitleLabel: '标题', editDescLabel: '自由描述',
    editDescPlaceholder: '谁的设定、画了多少小时、用了什么技法……自由填写',
    editTagsLabel: '档位标注', editTagsEmptyHint: '选择该作品所属的尺寸',
    editTagsHint: '可多选；客户可在画廊按档位筛选，点大图标签可带预选跳下单',
    editSaved: '作品已保存',
    // 815 K2-8: 两步保存任一步失败都明确提示（不再笼统吞错）
    editInfoSaveFailed: '作品信息保存失败：{reason}',
    editTagsSaveFailed: '档位标注保存失败：{reason}',
    // 815 K2-3: 批量粘贴上传逐文件隔离汇总
    pastePartial: '粘贴上传完成：成功 {ok} 张，失败 {failed} 张',
    pasteFailedAll: '粘贴上传失败：{failed} 张未上传',
    pasteFailTitle: '以下文件上传失败',
    pasteFailLine: '文件「{name}」：{reason}'
  },
  rules: {
    hint: '编辑客户下单前必须阅读的约稿须知。支持 HTML 标签。',
    placeholder: '输入约稿须知内容，支持 HTML 标签如 <h3>、<ul>、<li>、<strong> 等',
    preview: '预览：', save: '保存须知', saved: '须知已保存'
  },
  // #44: 偏好设置独立页面（从主页设置拆出）
  preferences: {
    title: '偏好设置',
    // 819-G: 顶部导航三 tab + 分组卡片行结构文案（原零信息副标题已删）；822 批：快捷入口页签并入通用，tabQuick/groupQuick 随删
    tabGeneral: '通用',
    tabDisplay: '显示与字号',
    groupNotify: '通知',
    groupDashboard: '仪表盘',
    groupFont: '字号',
    groupAppearance: '外观',
    groupAnimation: '动画',
    // 822 批：快捷按钮并入通用页签（微缩预览 + 勾选格）
    quickInlineLabel: '快捷按钮',
    quickInlineDesc: '勾哪些，首页快捷区就放哪些。',
    quickPreviewHint: '首页快捷区长这样（点卡片可移除）',
    quickPreviewRemove: '点一下取消勾选',
    quickPreviewEmpty: '一个都没勾——首页不显示快捷区',
    notifyLabel: '新消息通知',
    notifyDesc: '有新订单、留言或节点推进时提醒你。',
    defaultPanelLabel: '进入后台时先打开',
    defaultPanelDesc: '下次进入后台时直接打开这一页。',
    // 818-A: 后台字号滑块（14~20px 七档整数吸附，默认 15px）；822 用户拍板：去掉唠叨的操作说明文案（“拖拽调节/即时生效”类）
    fontSize: '后台字号',
    // 819-G: 暗色模式 / 动画速度 / 减少动效
    darkModeLabel: '暗色模式',
    darkModeDesc: '后台配色在宣纸与墨黑之间切换。',
    animSpeedLabel: '动画速度',
    animSpeedDesc: '调整界面过渡动画的快慢。',
    reduceMotionLabel: '减少动效',
    reduceMotionDesc: '将界面过渡动画压到最短。',
    animPreviewLabel: '速度预览',
    animPreviewBtn: '点我看速度'
  },
  // 自定义首页批一（v70）：仪表盘布局偏好抽屉 + 页面宽度控件
  dashboardPrefs: {
    title: '自定义我的首页',
    tip: '拖动条目排序；开关控制显隐；每块可选宽度档位与显示行数。改完立刻保存记住，首页本身不可拖。',
    close: '关闭',
    loadFailed: '布局加载失败',
    retry: '重试',
    toggleAria: '显示{name}',
    widthLabel: '宽度',
    widthHalf: '半行',
    widthFull: '整行',
    densityLabel: '显示',
    density3: '3 行',
    density5: '5 行',
    densityAll: '全部',
    // v152：款式行（仅排期块与问候卡有款式）
    styleLabel: '款式',
    styleScheduleBars: '时间条',
    styleScheduleLedger: '台账',
    styleSchedulePtags: '纸签',
    styleScheduleWaybill: '运单',
    styleGreetPlain: '标准',
    styleGreetSeal: '印框',
    styleGreetRibbon: '书签',
    styleGreetRule: '分隔',
    onboardingNote: '完成后自动消失',
    reset: '恢复默认',
    done: '完成',
    saveFailed: '保存失败，已回退本次改动',
    moduleGreet: '问候卡',
    modulePlaque: '状态挂牌',
    moduleStats: '统计卡',
    moduleSchedule: '排期',
    moduleTodo: '待办清单',
    moduleGuestbook: '留言板',
    moduleActivity: '最近动态',
    moduleAnnouncement: '平台公告',
    moduleOnboarding: '开张任务',
    moduleQuick: '快捷操作',
    moduleIncomeChart: '收入趋势图',
    moduleIncomeMonth: '本月收入概览',
    moduleDdlSoon: '截稿倒计时',
    moduleUnknown: '未知板块',
    catalogTitle: '可添加的板块（板块库）',
    catalogAdd: '＋ 加上首页',
    catalogEmpty: '没有可添加的板块了',
    catalogNote: '收入类板块默认不上首页，加上后才显示',
    entryLabel: '自定义我的首页',
    entryDesc: '首页板块的顺序、显隐、宽度与显示行数。',
    entryBtn: '去自定义',
    // 822 批：抽屉布局微缩预览（顺序/宽度实时跟随，点方块定位条目）
    previewTitle: '首页布局预览',
    incomeChartEmpty: '还没有到账记录',
    incomeMonthReceived: '本月到账',
    incomeYearCumulative: '今年累计',
    incomePending: '待收尾款',
    incomePendingCount: '{n} 单待收',
    ddlSoonEmpty: '近两周没有截稿任务',
    ddlToday: '今天截稿',
    ddlDaysLeft: '还剩 {n} 天',
    ddlOverdue: '已逾期 {n} 天',
    moduleLoadError: '数据加载失败',
    pageWidthTitle: '页面宽度',
    pageAlignLabel: '页面位置',
    pageAlignDesc: '左置、居中或撑满；全站页面统一生效。',
    pageAlignLeft: '左置',
    pageAlignCenter: '居中',
    pageAlignFull: '撑满',
    pageMaxLabel: '最大宽度',
    pageMaxDesc: '仅左置/居中档生效。'
  },
  settings: {
    title: '主页设置', tabProfile: '基本资料', tabShowcase: '主页展示', tabTemplate: '模板与风格',
    tabRules: '须知编辑', tabWorkflow: '流程与比例',
    // BUG-7: 加载失败保护（防止默认值/空内容覆盖真实配置）
    loadFailedTitle: '设置加载失败', loadFailedDesc: '表单当前是默认值，保存会覆盖你的真实设置。请重试加载成功后再编辑保存。',
    loadFailedHint: '设置尚未加载成功，无法保存，请先重试',
    rulesLoadFailed: '须知内容加载失败，保存已禁用以防止覆盖现有须知', retry: '重试加载',
    quickTitle: '快捷按钮', quickLabel: '仪表盘快捷按钮',
    quickActionBadge: '⚡动作',
    quickLocalFallback: '保存失败：快捷按钮已暂存本机，其余设置未保存',
    nameLabel: '画师昵称', bioLabel: '个人简介', bioPlaceholder: '介绍一下自己',
    profileNameDesc: '客户主页与订单列表展示的昵称',
    profileBioDesc: '客户了解你的第一段话',
    codeLabel: '身份码（订单号前缀）', codePlaceholder: '如 ALICE、QY（2-20位大写字母/数字）',
    codeHint: '身份码用于生成订单号前缀（如 ALICE-001），修改后新订单生效，已有订单号不变',
    // 820-L：留言功能画师手动开关（放账号设置「基本资料」，与通知开关同口径）
    guestbookLabel: '留言功能',
    guestbookDesc: '关闭后客户主页隐藏留言板块，也无法提交新留言；历史留言保留，重新开启即恢复。',
    statusLabel: '主页状态', statusOpen: '可约稿', statusFull: '已排满', statusBreak: '休息中', statusHidden: '已隐藏',
    // 812-B B2+B3: 小店展示独立开关（语义 = status 是否 hidden）
    shopVisibleLabel: '小店展示', shopVisibleOn: '展示中', shopVisibleOff: '已隐藏',
    shopVisibleHint: '开启后，客户可在目录看到你的小店并访问主页；关闭后小店对外隐藏。',
    shopVisibleDesc: '控制客户能否在目录看到并访问你的主页。',
    shopHiddenNotice: '小店当前处于隐藏状态，客户无法在目录看到或访问主页。',
    // 方案 A（2026-08-21）：开业就绪门槛提示（未备好作品与价格不上首页目录）
    notReadyNotice: '小店暂未满足上首页的条件：需上传至少 1 张作品，并设置至少 1 个启用画风的价格。补齐后自动展示。',
    linksLabel: '外链（客户主页展示）', addLink: '添加链接',
    moveLinkUp: '上移外链', moveLinkDown: '下移外链', removeLink: '删除外链',
    linksHint: '最多 8 条，粘贴后自动识别平台。留空的行不会保存。',
    linksEmpty: '还没有添加链接', linkOther: '其他', linkUrlPlaceholder: 'https://',
    linkInvalid: '链接格式不正确（仅支持 http/https，或直接粘贴网址）', linkTooLong: '链接过长（域名≤253 / 路径≤1500 / 总长≤1800）',
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
    autoPromote: '自动递补（正式位空出时自动将缓冲区最早订单移入）',
    hideQueuePosition: '对客户隐藏排队位置（只显示"排队中"）',
    hidePromoteNotify: '递补时不通知客户',
    bufferShortForm: '缓冲区订单使用简表模式（看板只显示关键信息）',
    bufferSwitchHint: '以上开关仅在有缓冲名额时生效。',
    contactQqLabel: '联系QQ（客户可见）', contactQqPlaceholder: '留空则不展示联系QQ',
    contactQqHint: '客户不记得订单号时会看到此QQ，用于联系你找回订单；留空则不展示',
    notifyLabel: '客户QQ通知', notifyText: '允许客户接收排队/完成通知',
    notifyPanelTitle: '通知与面板',
    defaultPanelLabel: '仪表盘默认面板', defaultPanelHint: '进入仪表盘时显示的快捷入口',
    announcementLabel: '主页公告', announcementPlaceholder: '如：本周休息，下周一恢复接单',
    announcementHint: '显示在客户主页首屏，最多 500 字。留空则不显示。',
    announcementExpiresLabel: '自动隐藏日期（可选）', announcementExpiresHint: '到期后公告自动消失，不设置则长期显示',
    // REQ-018: 公告过期日快捷预设
    save: '保存设置', saved: '设置已保存',
    noChanges: '没有修改',
    // R48: 头像上传
    avatarLabel: '头像', avatarHint: '点击上传或更换（JPG/PNG/WebP，≤10MB）',
    avatarUpdated: '头像已更新', avatarNotImage: '仅支持图片文件', avatarTooBig: '图片超过 10MB 限制',
    // R49: 强调色
    accentLabel: '强调色', accentHint: '客户主页的按钮/链接/高亮颜色，与访客自选主色独立',
    accentClear: '默认', accentDarkHint: '暗色模式自动提亮，无需额外调整',
    // v0.25 A: 封面管理
    coverTitle: '封面图（主页顶部轮播）',
    coverHint: '点击星标将作品设为主页封面，可设多张（自动轮播）。再点一次取消。',
    coverEmpty: '暂无作品，上传作品后可设置封面',
    coverManageLink: '管理封面',
    // R50: 预览
    previewBtn: '预览主页',
    // 05D-SE1: 切 tab 未保存修改拦截
    unsavedLeaveTitle: '未保存的修改',
    unsavedLeaveTip: '当前页签有未保存的修改，切换将丢失。确定离开？'
  },
  // v0.26 C: 开稿管理独立页
  slots: {
    title: '开稿管理',
    statusSection: '接稿状态',
    statusSectionDesc: '切换后主页档期卡同步更新',
    slotSection: '名额设置',
    quotaSection: '月度额度',
    queueSection: '队列行为',
    totalHint: '正式 {n} + 缓冲 {m} = 合计 {sum} 席'
  },
  templates: {
    hint: '选择客户看到的画师主页样式。布局决定页面结构，配色决定气质底色，所有模板共享同一套作品/价格数据。',
    label: '页面布局',
    layoutDesc: '选择主页的页面结构',
    atelier: '画册工作室',
    atelierDesc: '纸感暖调，宋体标题，笔触下划线，安静的手作气质',
    classic: '经典工作室',
    classicDesc: '代表作横幅开场，桌面双栏，约稿按钮吸顶常驻',
    gallery: '美术馆画廊',
    galleryDesc: '全屏画作开场，展签式名字，画册式翻页画廊（当前页大图居中、相邻页缩小侧露）',
    folio: '单页落地页',
    folioDesc: '左文右图分屏开场，滚动侦测导航，适合品牌风格',
    palette: '页面配色',
    paletteHint: '配色决定页面的气质底色（亮暗由访客偏好自动适配），主色仍跟随访客的五色选择。',
    palettePaper: '纸', palettePaperDesc: '暖白宣纸，墨字，安静',
    paletteInk: '墨', paletteInkDesc: '画廊深炭，层灰，克制',
    paletteDusk: '暮', paletteDuskDesc: '蓝灰暮色，冷静',
    paletteMoss: '苔', paletteMossDesc: '深绿自然，温润',
  },
  embed: {
  },
  workflow: {
    stageList: '流程节点', paymentBar: '收款比例', overview: '流程全览',
    addPlaceholder: '新节点名称，如「细化确认」', final: '尾款', auto: '自动',
    deleteHint: '确定删除此节点？', deletePayHint: '此节点收款比例 {pct}% 将并入尾款，确定删除？',
    savePayment: '保存比例', unsaved: '有未保存的比例变更',
    saved: '比例已保存', detached: '已移除该收款节点，比例已并入尾款',
    // 批4 B10（方案 b）：活跃订单存在时后端附 appliesToNewOrdersOnly，提示仅影响新订单
    paymentNewOrdersOnly: '比例已保存，仅影响新订单（已有订单按下单时快照不变）',
    dragHandle: '拖拽调整比例', editPercent: '修改「{name}」收款比例', minPercent: '比例不能低于 5%', finalTooLow: '尾款比例不足，无法分配',
    reorderLabel: '调整节点顺序', moveUp: '上移节点', moveDown: '下移节点', deleteStage: '删除节点', dragSort: '拖拽排序',
    reset: '恢复默认模板', resetConfirm: '确定恢复默认模板？你当前的所有自定义节点和比例将被覆盖，此操作无法撤销。', resetDone: '已恢复默认模板',
    descPlaceholder: '点击添加说明',
    // plan-node-speech：节点话术（{客户名}等为后端变量契约，中英文界面均保持中文原文）
    // Bug 1: 花括号会被 vue-i18n 当 ICU 占位符解析（中文非合法标识符→崩溃），用 {'{'} 字面量转义
    speechLabel: '话术', speechPlaceholder: "{'{'}客户名{'}'}，你的订单已{'{'}节点名{'}'}。",
    speechSave: '保存话术', speechSaved: '话术已保存', speechVarHint: '点击插入变量',
    // #8: 话术界面改进（变量公共区 + 折叠预览）
    speechVarCommon: '话术变量（点下方编辑框后再点变量插入）', speechVarNoFocus: '先点击某个节点的话术编辑框',
    speechEmpty: '暂无话术',
    // b4-11: 变量按钮显示名键化（插入仍走后端中文契约 token，见 StageListView SPEECH_VARS）
    speechVar: {
      clientName: "{'{'}客户名{'}'}",
      clientQq: "{'{'}客户QQ{'}'}",
      orderNo: "{'{'}订单号{'}'}",
      tierName: "{'{'}档位名{'}'}",
      stageName: "{'{'}节点名{'}'}",
      deadline: "{'{'}截稿日{'}'}",
      totalPrice: "{'{'}总价{'}'}",
      paid: "{'{'}已付{'}'}",
      unpaid: "{'{'}待付{'}'}"
    },
    // v0.27: 多模板随机开关
    randomTemplate: '随机', randomTemplateHint: '多条话术时可开启，发送时随机选一条',
    // 05I: 管理员默认流程（默认模板无话术字段，保存话术时拦截提示）
    templateNoSpeech: '默认流程模板不含话术（各画师流程自行编辑话术），此处不可保存话术',
    maxInstallments: '收款节点已达上限',
    finalCannotDisable: '尾款节点不可关闭收款',
    finalCannotDelete: '尾款节点不可删除',
    // 波3-2: 流程加载失败错误态 + 重试
    loadFailed: '流程节点加载失败，请重试',
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
    navGroupOverview: '概览', navGroupOps: '运营', navGroupConfig: '配置与监控',
    backToAdmin: '返回后台', panelTitle: '管理员面板',
    artistCount: '画师数', totalOrders: '总订单', activeOrders: '活跃订单',
    artistList: '画师列表', manageArtists: '管理画师',
    colName: '昵称', colSubdomain: '主页标识', colQq: 'QQ号', colStatus: '状态', colBio: '简介',
    // 登录留痕批（v72）：上次登录时间+IP，仅管理端展示（列表相对时间 / 抽屉完整信息）
    colLastLogin: '上次登录',
    lastLogin: {
      never: '尚未登录', justNow: '刚刚',
      minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前', daysAgo: '{n} 天前',
      detail: '上次登录', detailNone: '尚未登录', detailIp: 'IP 地址'
    },
    artistManage: '画师管理', addArtist: '+ 添加画师',
    addTitle: '添加画师', qqLabel: 'QQ号', qqPlaceholder: '画师的QQ号（用于登录）',
    nameLabel: '昵称', namePlaceholder: '展示给客户的名字',
    subdomainLabel: '主页标识', subdomainPlaceholder: '如 alice（小写字母/数字）',
    codeLabel: '身份码（可选）', codePlaceholder: '如 ALICE（默认用主页标识大写）',
    bioLabel: '简介（可选）', domainSuffix: '/artist/',
    requiredFields: 'QQ号、昵称和主页标识为必填项', added: '画师已添加',
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
    nextStep: '下一步', confirmTransfer: '确认更换',
    transferSuccess: '管理员已更换为 {name}', adminTag: '管理员',
    transferTotpHint: '输入各自验证器App上当前显示的6位动态码（双方须先完成绑定）',
    // REQ-027: TOTP 绑定/重置
    totpBind: '绑定', totpRebind: '重绑',
    totpBindTitle: '绑定动态口令 - {name}',
    totpStep1: '① 让画师用手机上的验证器 App 扫描下方二维码（首选 Microsoft Authenticator；任何支持标准动态口令的 App 都行。微信小程序里也有同类工具，但不保证安全）',
    totpStep2: '② 画师把App上当前显示的6位码告诉你，输入下方并确认',
    totpCodeLabel: '6位动态码', totpCodePlaceholder: '输入验证器上显示的6位动态码',
    totpBindConfirm: '确认绑定', totpBindSuccess: '已绑定动态口令',
    totpReset: '重置绑定', totpResetConfirm: '确定重置「{name}」的动态口令绑定？旧密钥立即失效，画师须重新绑定才能登录',
    totpResetSuccess: '已重置绑定',
    totpRegenerate: '重新生成二维码', totpRegenerateHint: '重新生成会使旧二维码立即失效，画师需重新扫码',
    orderColNo: '订单号', orderColQq: '客户QQ', orderColStatus: '状态',
    orderColType: '类型', orderColTime: '下单时间',
    greetingManage: '问候语管理', greetingPlaceholder: "输入问候语，用 {'{'}name{'}'} 代替画师名",
    greetingPreview: '预览',
    greetingColText: '问候语', greetingColSlot: '时段', greetingColEnabled: '启用',
    greetingEmpty: '暂无问候语',
    greetingDeleteConfirm: '确定删除这条问候语吗？',
    greetingAddLabel: '添加问候语',
    greetingAddDesc: "输入文案并选择时段，用 {'{'}name{'}'} 代替画师名",
    slotAny: '全天', slotEarly: '清晨', slotMorning: '上午', slotNoon: '午后', slotAfternoon: '下午', slotEvening: '夜晚', slotMidnight: '深夜',
    // 817 问候重构：7 档时段（旧 night/latenight 双档合并为深夜；深夜池概念消除）
    specialDayTitle: '特别日',
    specialDayHint: '命中日期当天优先投放该日文案（全平台或指定画师）；文案未配置或全部停用时自动按时段池/全天池回落。',
    specialDayColName: '名称', specialDayColDate: '日期', specialDayColScope: '范围', specialDayColCount: '文案',
    specialDayScopeGlobal: '全平台', specialDayScopeArtist: '指定画师',
    specialDayAdd: '新建特别日',
    specialDayNameLabel: '名称', specialDayNamePh: '如：生日 / 纪念日',
    specialDayDateLabel: '日期', specialDayDatePh: '选择月日（每年重复）',
    specialDayArtistLabel: '画师', specialDayArtistPh: '选择画师',
    specialDayDeleteConfirm: '确定删除特别日「{name}」？关联的文案将一并删除。',
    specialDayEmpty: '暂无特别日',
    specialDayEditGreetings: '文案',
    specialDayGreetingsTitle: '「{name}」当日文案',
    specialDayCollapse: '收起',
    specialDayGreetingPh: "输入当日专属问候，用 {'{'}name{'}'} 代替画师名",
    specialDayGreetingAddLabel: '添加当日文案',
    specialDayGreetingAddDesc: '该日文案全天投放，不区分时段',
    specialDayNameHint: '每年按该日期重复投放',
    specialDayDateHint: '选择月日，不随年份变化',
    specialDayScopeHint: '全平台或指定画师生效',
    specialDayArtistHint: '该特别日仅对所选画师生效',
    defaultWorkflow: '默认流程模板', defaultWorkflowHint: '修改后仅影响新注册画师，已有画师不受影响。',
    defaultWorkflowResetHint: '恢复为出厂状态；已有画师的流程不受影响',
    resetTemplate: '重置为出厂默认', resetConfirm: '确定恢复出厂默认模板？当前自定义模板将被覆盖。', resetDone: '已恢复出厂默认',
    manage: '管理', artistDetail: '画师详情', pricingHint: '价格由画师在「画风与价格」页维护，此处仅展示概览',
    artworkHint: '作品图片需通过画师后台上传，此处仅支持查看和删除。',
    // P1-B：删除作品二次确认（含作品名）
    artworkDeleteConfirm: '确定删除作品「{name}」？删除后不可恢复。',
    artworkUntitled: '未命名作品',
    greetingTab: '问候语',
    greetingGlobalHint: '通用库条目对所有画师生效，与画师专属库混合抽取。',
    greetingArtistHint: '专属库条目仅对该画师生效，与通用库混合抽取。',
    detailNameHint: '管理端展示的画师昵称',
    detailBioHint: '展示在画师主页的个人简介',
    detailStatusHint: '控制画师主页的接单状态',
    detailRulesHint: '客户下单前看到的约稿须知，支持富文本',
    // v0.45 管理后台重设计：页面副标题/快捷操作（此前误入 admin.tracking，模板引用 admin.* 顶层）
    dashboardSubtitle: '平台运营总览，画师与订单一目了然',
    quickActions: '快捷操作',
    artistManageSubtitle: '管理画师账号、状态与绑定',
    artistSearchPlaceholder: '搜昵称 / 主页标识 / QQ / 简介',
    artistStatusAll: '全部状态',
    artistFilterCount: '筛出 {n} 位画师',
    artistFilterLabel: '筛选画师',
    artistFilterDesc: '按昵称、主页标识、QQ 或简介搜索，可按状态过滤',
    artistActions: '画师操作',
    platformManageSubtitle: '配置客户主页可识别的社交平台',
    trackingSubtitle: '埋点事件统计与画师门面可见开关',
    // 回收站（事故修复：孤儿文件可恢复）
    recycleBin: {
      title: '回收站', empty: '清空回收站',
      colFile: '文件名', colPath: '原始路径', colSize: '大小', colMovedAt: '移入时间',
      emptyTitle: '清空回收站', emptyConfirm: '回收站中的文件将被永久删除，不可恢复。确定清空？',
      emptied: '已清空，永久删除 {n} 个文件', emptyHint: '回收站是空的'
    },
    // 0817：已移除画师（软删兜底：清单可见+可恢复）
    deletedArtists: {
      title: '已移除画师', empty: '没有已移除的画师',
      colDeletedAt: '移除时间', restore: '恢复',
      restored: '已恢复，该画师回到在册列表',
      restoreConfirm: '恢复画师「{name}」？恢复后回到在册列表，本人需重新登录；若该画师还在封禁中，恢复后仍保持封禁。'
    },
    // F4: 留言管理（跨画师）；REQ-022 F5: 三维筛选
    guestbook: {
      title: '留言管理', empty: '暂无留言',
      colArtist: '画师', colNickname: '昵称', colContent: '内容', colStatus: '状态', colTime: '时间',
      statusPending: '待审核', statusApproved: '已通过', statusRejected: '已拒绝',
      filterByReplied: '是否已回复', repliedYes: '已回复', repliedNo: '未回复',
      filterLabel: '筛选留言',
      filterDesc: '按画师、审核状态与回复状态过滤留言列表',
      delete: '强制删除', deleteConfirm: '确定删除这条留言？删除后客户主页将不再显示。', deleted: '留言已删除'
    },
    // HC: 系统自检
    health: {
      title: '系统自检', start: '开始检查', checking: '检查中…',
      download: '下载诊断包', refresh: '刷新后结果不保留',
      startHint: '检查数据库、存储与迁移等 8 项系统状态',
      downloadHint: '下载 JSON 格式的诊断报告，便于排查问题',
      downloaded: '诊断包已下载', downloadFailed: '诊断包下载失败', downloadTimeout: '下载超时，请重试',
      diskNote: '仅供参考',
      statusOk: '正常', statusWarn: '警告', statusFail: '异常',
      emptyHint: '点击「开始检查」运行 8 项系统检查'
    },
    // 0818 拍板方案 A：系统更新检查（只读面板）
    update: {
      title: '系统更新', recheck: '重新检查',
      current: '当前版本', currentHint: '这台服务器正在运行的版本（版本号 · 提交 · 部署时间）',
      latest: 'GitHub 最新版', latestHint: '代码仓库 master 分支的最新提交',
      status: '更新状态', statusHint: '对比当前版本与 GitHub 最新提交',
      statusUpToDate: '已是最新', statusBehind: '有新提交，可以更新', statusUnknown: '无法对比（本机版本未知）',
      statusFetchFailed: '连接不上 GitHub', loadFailed: '版本信息加载失败', commitUnknown: '未知',
      cmd: '更新命令', cmdHint: '登录服务器，在项目目录里运行这条命令即可更新（拉代码并重建容器）',
      copy: '复制命令', copied: '命令已复制', copyFailed: '复制失败，请手动选中复制'
    },
    // REQ-022 F2: 社交平台管理
    platformManage: '社交平台管理',
    // 815 第三批 I 路: 系统增项模板（artist_id IS NULL）
    addonTemplates: '系统增项模板',
    addonTemplatesSubtitle: '管理全画师共用的系统模板（商业用途/加急等）；改价时可选择同步或冻结已导入画师的价格',
    addonTemplatesAdd: '新建系统模板',
    addonTemplatesEdit: '编辑系统模板',
    addonTemplatesEmpty: '暂无系统模板',
    addonTemplatesSaved: '系统模板已保存',
    addonTemplatesDeleted: '系统模板已删除',
    addonTemplatesColName: '名称',
    addonTemplatesColCategory: '类别',
    addonTemplatesColControl: '控件',
    addonTemplatesColPricing: '计价',
    addonTemplatesColPrice: '价格',
    addonTemplatesColSort: '排序',
    addonTemplatesColReferenced: '引用画风',
    addonTemplatesSortLabel: '排序（小的在前）',
    addonTemplatesNameHint: '展示在画师增项库中的模板名称',
    addonTemplatesControlHint: '开关或个数两种控件形态',
    addonTemplatesPriceHint: '默认单价；百分比按基础价计算',
    addonTemplatesUnitHint: '数量单位，如 人 / 张 / 个',
    addonTemplatesSortHint: '数值越小越靠前',
    addonTemplatesDeleteConfirm: '确定删除系统模板「{name}」？',
    addonTemplatesDeleteRefConfirm: '该模板正被 {count} 个画风使用。删除后这些画风会保留为独立增项（名称/价格不丢），但不再跟随模板更新。确定删除「{name}」？',
    addonTemplatesSyncLabel: '同步到已导入画师',
    addonTemplatesSyncHint: '不勾选 = 冻结：已导入且未改过价的画风会把当前模板价格写入自身，之后不再跟随模板；勾选 = 全平台跟随：未改过价的画风自动采用新价。画师自行改过价的行一律不受影响。',
    addonTemplatesFreezeNote: '注意：冻结后该画师的价格不再跟随模板；v1 无法区分冻结写入与画师自定义，如需恢复请让画师在「画风与价格」面板手动改价。',
    platform: {
      colName: '平台名', colIcon: '图标', colDomains: '匹配域名', colOrder: '排序', colEnabled: '启用',
      add: '新增平台', edit: '编辑平台', delete: '删除',
      empty: '暂无平台',
      nameLabel: '平台名称', namePlaceholder: '如：微博',
      iconLabel: '图标（simple-icons 白名单）', iconNone: '无（用单字兜底）',
      fallbackLabel: '单字兜底', fallbackPlaceholder: '如：米（simple-icons 无此平台图标时）',
      domainsLabel: '匹配域名', domainsPlaceholder: '每行一个域名，如 weibo.com',
      domainsHint: '保存后，客户粘贴该域名的链接会自动识别为此平台。',
      orderLabel: '排序（小的在前）',
      nameHint: '展示在画师设置中的平台名称',
      iconHint: '从 simple-icons 白名单选择图标',
      orderHint: '数值越小越靠前',
      enabledLabel: '启用', enabledHint: '停用后画师设置下拉不再出现，已存链接保留展示。',
      save: '保存', cancel: '取消', saved: '平台已保存',
      deleteConfirm: '确定删除「{name}」？引用该平台的链接将归为「其他」，链接本身不删除。',
      deleted: '平台已删除，{n} 条链接归为「其他」',
      iconFallbackHint: '图标与单字兜底至少填一项。',
      domainFormatError: '域名格式不正确（不含协议/路径/端口）'
    },
    // REQ-033: 埋点看板
    tracking: {
      title: '埋点看板', total: '总事件数', visibleLabel: '画师门面统计可见',
      enabledLabel: '画师端统计导航',
      enabledHint: '关闭后画师后台隐藏整个统计导航；开启后由下方三态开关控制画师可见性。',
      daysLabel: '统计天数', funnelTitle: '下单漏斗',
      byNameTitle: '事件分布', byDayTitle: '按日趋势',
      visibleHint: '关闭后画师主页不显示访问统计',
      daysHint: '可选近 7 / 14 / 30 / 90 天',
      colName: '事件名', colCount: '次数', colRatio: '占比', colDay: '日期',
      days7: '近 7 天', days14: '近 14 天', days30: '近 30 天', days90: '近 90 天',
      empty: '暂无事件数据',

    }
  },
  setup: {
    pageTitle: '开箱设置',
    step1Title: '欢迎使用拾绘',
    step1Desc: '首次使用需要先完成开箱设置，设置管理员账号后即可开始使用。',
    step1Lang: '选择语言',
    // 语言切换按钮固定显示各语言自身写法（跨语言常量）
    langZh: '中文', langEn: 'English',
    step1TokenLabel: '安装口令',
    step1TokenPlaceholder: '请输入安装口令',
    step1TokenError: '安装口令错误',
    step1Start: '开始设置',
    step2Title: '创建管理员账号',
    step2Desc: '设置管理员信息，管理员拥有平台最高权限。',
    // 823: 前置提醒——下一步要扫码绑动态码，先装好验证器 App（画师反馈「没提前让下载 2FA 软件」）
    step2Prep: '提示：下一步要扫二维码设置动态口令，请先在手机上装好验证器 App（推荐 Microsoft Authenticator）。',
    appHelpToggle: '还没装验证器 App？看推荐',
    step2QqLabel: '管理员QQ号',
    step2QqPlaceholder: '输入你的QQ号',
    step2NameLabel: '显示名称',
    step2NamePlaceholder: '输入你的显示名称',
    step2StudioLabel: '同时创建我的画师工作室',
    step2StudioNameLabel: '工作室名称',
    step2StudioNamePlaceholder: '输入工作室名称',
    step2StudioNameDefault: '{name}的工作室',
    step2StudioSubdomainLabel: '工作室主页标识',
    step2StudioSubdomainPlaceholder: '如 myart（小写字母/数字）',
    step2Submit: '创建管理员',
    step2QqRequired: '请填写QQ号',
    step2NameRequired: '请填写显示名称',
    step2SubdomainRequired: '请填写工作室主页标识',
    step2SubdomainFormat: '主页标识只能包含小写字母和数字，2-20个字符',
    step3Title: '绑定动态口令',
    step3Desc: '请使用验证器 App 扫描下方二维码，然后输入 6 位动态码完成验证。还没装 App？点下方「还没装验证器 App？」。',
    step3QrAlt: 'TOTP 二维码',
    step3QrRegenerate: '重新生成',
    step3CodeLabel: '6 位动态码',
    step3CodePlaceholder: '输入 6 位动态码',
    step3CodeRequired: '请输入 6 位动态码',
    step3CodeFormat: '动态码为 6 位数字',
    step3CodeError: '动态口令错误，请重试',
    step3Confirm: '验证并完成设置',
    step4Title: '设置完成',
    step4Desc: '开箱设置已完成，现在可以登录使用了。',
    step4Login: '去登录',
    error: '设置过程出错，请重试',
    // 813-fq-tail-shared 战役 S：store 兜底错误文案 i18n 化（替代硬编码中文）
    submitAdminFailed: '创建管理员失败',
    confirmTotpFailed: '验证失败',
    prevStep: '上一步',
  },
  // ═══ REQ-042 合规与内容安全（2026-08-11 拍板：隐私权利实现路径 A 联系管理员处理） ═══
  compliance: {
    common: {
      backHome: '返回首页',
      updated: '更新日期',
      privacy: '隐私政策',
      terms: '服务条款',
      report: '举报',
      and: '和',
      agreePrefix: '我已阅读并同意'
    },
    privacy: {
      pageTitle: '隐私政策',
      updated: '2026-08-23',
      note: '本政策为平台标准版模板文案（人工审校），非法律意见；业务重大变化时平台将更新条款。',
      sections: [
        {
          title: '一、我们收集哪些数据',
          paragraphs: ['拾绘（Inkglean）为提供约稿服务，仅收集完成服务所必需的数据：'],
          items: [
            'QQ 号（画师与客户身份识别与联系）',
            '联系方式（contact_qq，画师展示联系渠道）',
            '订单需求、备注与参考图（完成约稿必需）',
            '作品图与交付完稿（画师展示与交付）',
            '浏览行为（埋点，可在偏好中关闭；日志保留 180 天）',
            'Passkey 公钥（用于免密登录，仅存公钥凭证）',
            '交付文件下载记录（下载时的 IP 与时间，用于一次性下载的纠纷取证）',
            '故障与错误报告（网站出错时自动上报至第三方服务商 Sentry，仅用于排查故障）'
          ]
        },
        {
          title: '二、收集目的与使用',
          paragraphs: [
            '数据仅用于：账号登录与安全、约稿沟通与交付、画师主页展示、平台运营统计。平台不会向第三方出售个人数据。'
          ]
        },
        {
          title: '三、存储位置与保留期限',
          paragraphs: [
            '当前服务部署于海外服务器，境内用户数据可能构成「数据出境」，平台已作知情声明；未来国内部署时数据将保留在境内。',
            '埋点日志保留 180 天后自动删除；业务数据（订单/作品/留言）在账号存续期间保留。'
          ]
        },
        {
          title: '四、你的权利',
          paragraphs: [
            '你可以依法查询、更正、复制、删除你的个人信息，或要求解释数据处理规则。实现路径：联系管理员处理（本平台当前为个人小站，权利请求由管理员人工响应）。'
          ]
        },
        {
          title: '五、联系方式',
          paragraphs: ['如对隐私政策有任何疑问，可通过画师主页联系渠道或页脚「举报」入口反馈。']
        },
        {
          title: '六、法律依据',
          paragraphs: ['本政策参照《中华人民共和国个人信息保护法》《中华人民共和国网络安全法》《中华人民共和国数据安全法》制定。']
        },
        {
          title: '七、第三方服务',
          paragraphs: [
            '故障监控：网站或后台出现错误时，会自动向第三方服务商 Sentry 发送错误报告（含网络地址、浏览器信息与出错页面），仅用于排查故障；该数据由 Sentry 存储，可能位于中国境外。',
            '图片识别：使用「识别图片」功能时，识别在您的浏览器本地完成，图片不会上传到任何服务器；首次使用时浏览器会从公共内容分发网络（CDN）下载识别引擎与语言数据（约几兆字节，缓存后不再重复下载）。'
          ]
        }
      ]
    },
    terms: {
      pageTitle: '服务条款与画师协议',
      updated: '2026-08-23',
      note: '本条款为平台标准版模板文案（人工审校），非法律意见；交易由画师与客户自行协商，平台不介入。',
      sections: [
        {
          title: '一、平台角色',
          paragraphs: ['拾绘（Inkglean）是画师展示作品、接收约稿的工具平台。平台不参与画师与客户之间的交易磋商与收款；交付文件（完稿）由平台提供传递通道，但平台不干预交付行为与结果，不介入双方交易纠纷。']
        },
        {
          title: '二、内容红线',
          paragraphs: ['发布内容（作品/留言/主页/公告）不得包含：'],
          items: [
            '违法信息（赌博、毒品、枪支、诈骗、代开发票等）',
            '色情与未成年相关违规内容',
            '侵犯他人著作权、肖像权、名誉权等合法权益的内容',
            '其他违反中国法律法规的内容'
          ]
        },
        {
          title: '三、画师内容责任',
          paragraphs: ['画师对自己上传的所有内容负责，包括内容合法性、原创性与授权完整。平台按「先发后审 + 举报驱动」模式管理内容。']
        },
        {
          title: '四、违规处理阶梯',
          paragraphs: ['平台对违规内容与账号按阶梯处理：警告 → 内容下架 → 封禁。所有处理均记录留痕。'],
          items: [
            '内容下架：作品删除或留言隐藏，客户端立即不可见',
            '封禁：画师主页下架、登录被拒、已登录会话失效；可解封恢复'
          ]
        },
        {
          title: '五、实名预留',
          paragraphs: ['必要时，平台将按法律法规要求实施实名制（如真实身份核验）；具体方案另行公告。']
        },
        {
          title: '六、未成年人声明',
          paragraphs: ['本平台服务面向成年人。未成年人在监护人同意并指导下使用；涉及未成年人形象的内容须确保合法合规。']
        },
        {
          title: '七、免责声明',
          paragraphs: ['平台仅为工具，交易由画师与客户自行协商；平台仅提供交付文件的传递通道，不担保画师交付质量，不介入交易纠纷，不对因交易产生的损失承担赔偿责任。']
        }
      ]
    },
    report: {
      title: '举报',
      hint: '举报匿名提交，请如实描述；平台将按流程处理并记录。',
      targetType: '举报类型',
      targetTypeRequired: '请选择举报类型',
      targetId: '对象编号（可选）',
      targetIdPlaceholder: '如作品/留言/画师 ID，不知道可留空',
      targetIdInvalid: '对象编号须为大于 0 的整数（不能是负数、小数或科学计数法）',
      description: '描述',
      descriptionPlaceholder: '请描述问题内容（最多 1000 字）',
      descriptionRequired: '请填写举报描述',
      descriptionLength: '描述长度需在 1-1000 字之间',
      contact: '联系方式（可选）',
      contactPlaceholder: '如需反馈处理结果可留下 QQ 等联系方式',
      submit: '提交举报',
      submitted: '举报已提交，感谢反馈',
      submitFailed: '提交失败，请稍后再试',
      rateLimited: '提交过于频繁，请稍后再试',
      types: {
        artist_home: '画师主页',
        artwork: '作品',
        message: '留言',
        other: '其他'
      }
    },
    warning: {
      hit: '内容可能包含敏感词（{words}），已先发布、后审核，管理员可能下架'
    },
    admin: {
      reportManage: '举报处理',
      reportManageSubtitle: '处理客户举报：标记已解决、下架内容或封禁画师',
      tabPending: '待处理',
      tabResolved: '已处理',
      filterLabel: '处理状态',
      filterDesc: '在待处理与已处理举报之间切换',
      colId: 'ID',
      colType: '类型',
      colTargetId: '对象ID',
      colDescription: '描述',
      colContact: '联系方式',
      colCreatedAt: '提交时间',
      colActions: '操作',
      resolve: '处理',
      resolveConfirm: '填写处理说明（可选）',
      resolvedToast: '举报已标记处理',
      resolved: '已处理',
      removeArtwork: '下架作品',
      removeMessage: '下架留言',
      removeConfirm: '填写下架原因（可选）',
      removedToast: '内容已下架',
      ban: '封禁画师',
      banConfirm: '填写封禁原因（可选）',
      bannedToast: '画师已封禁',
      unban: '解封画师',
      unbanConfirm: '填写解封原因（可选）',
      unbannedToast: '画师已解封',
      bannedTag: '已封禁',
      reasonPlaceholder: '原因（可留空）',
      empty: '暂无举报',
      loadFailed: '举报列表加载失败'
    }  },

  // REQ-041: 管理后台二次验证（会话升级）
  stepup: {
    title: '管理员验证',
    desc: '为保障平台安全，请完成管理员身份验证（30 分钟内有效）。',
    codeLabel: '动态验证码',
    codePlaceholder: '输入验证器上的 6 位数字',
    codeFormat: '动态码为 6 位数字',
    confirm: '验证',
    passkeyVerify: '使用 Passkey 验证',
    passkeyVerifying: '正在验证…',
    error: '验证失败，请重试'
  },

  // 823 用户拍板：验证器 App 推荐口径统一事实源（登录页帮助框 / 邀请入驻 / 安装向导三处同源复用，只写可验证事实）
  authApp: {
    desc: '首选 Microsoft Authenticator（微软验证器，手机应用商店可下载）；也可在应用商店搜索「验证器」，任何支持标准动态口令（TOTP）的 App 都能用。',
    alts: '备选：2FAS / Google Authenticator / Aegis。',
    miniProgram: '实在不想装 App，也可以在微信小程序里搜索同类动态口令工具，但我们无法保证其安全性，建议还是安装 App。'
  },

  // REQ-039: 邀请码注册（登录页入驻 + 管理端邀请码管理）
  invite: {
    entry: '没有账号？用邀请码入驻',
    title: '邀请码入驻',
    subtitle: '填写管理员发放的邀请码，创建你的画师账号',
    back: '返回登录',
    codeLabel: '邀请码',
    codePlaceholder: '8 位邀请码',
    qqLabel: 'QQ 号',
    qqPlaceholder: '输入 QQ 号',
    nameLabel: '显示名称',
    namePlaceholder: '输入显示名称',
    subdomainLabel: '主页标识',
    subdomainPlaceholder: '如 myart',
    subdomainHint: '小写字母/数字，2-20 个字符',
    submit: '开始入驻',
    submitting: '正在入驻…',
    // 823: 入驻第一步前置提醒 + 扫码页安装引导（画师反馈「没提前让下载 2FA 软件」）
    prepNotice: '开始入驻前先准备一件事：下一步要设置「动态口令」，请先在手机上装好验证器 App（推荐 Microsoft Authenticator）。',
    step2Title: '绑定动态口令',
    step2Desc: '用验证器 App 扫描下方二维码，然后输入 6 位动态码完成绑定。还没装 App？点下方「还没装验证器 App？」。',
    appHelpToggle: '还没装验证器 App？看推荐',
    qrAlt: 'TOTP 二维码',
    totpCodeLabel: '6 位动态码',
    totpCodePlaceholder: '输入验证器上显示的 6 位数字',
    totpConfirm: '验证并进入后台',
    confirming: '正在验证…',
    success: '绑定成功，即将进入后台',
    codeRequired: '请输入邀请码',
    codeFormat: '邀请码为 8 位字母或数字',
    qqRequired: '请填写 QQ 号',
    qqInvalid: 'QQ 号为 5-15 位数字',
    nameRequired: '请填写显示名称',
    subdomainRequired: '请填写主页标识',
    subdomainFormat: '主页标识只能包含小写字母和数字，2-20 个字符',
    totpRequired: '请输入 6 位动态码',
    totpFormat: '动态码为 6 位数字',
    totpError: '动态口令错误，请重试',
    // v126: 2FAS 新手引导（码 30 秒轮换机制人话说明 + 错误分流文案，只写可验证事实）
    totpGuide: '动态码每 30 秒换一次，报验证器上最新显示的那组；进度条快走完时，等它刷新出新码再报。',
    totpStale: '这组码可能刚刚刷新了——等验证器转出新码，报最新那组再试。',
    totpWrong: '码对不上——请核对验证器上当前显示的 6 位数字。还可以试 {n} 次。',
    totpLockedMin: '试错次数用完，先锁定约 {minutes} 分钟——入驻信息已保存，稍后回来输新码即可，不用重新注册。',
    // 管理端
    manageTitle: '邀请码管理',
    manageHint: '邀请码默认 3 天有效（可调 1-30 天）；每码默认用 1 次，可调 1-100 次。把码发给画师即可入驻。',
    generateTitle: '生成邀请码',
    countLabel: '生成数量',
    countHint: '1-50 个',
    validDaysLabel: '有效期（天）',
    validDaysHint: '1-30 天',
    maxUsesLabel: '每码可用次数',
    maxUsesHint: '1-100 次，默认 1（一次性）',
    generateBtn: '生成',
    generated: '已生成 {count} 个邀请码',
    colCode: '邀请码',
    colStatus: '状态',
    colExpires: '过期时间',
    colUsedBy: '使用人',
    colUsage: '使用情况',
    colActions: '操作',
    statusAll: '全部',
    statusUnused: '未使用',
    statusUsed: '已使用',
    statusExpired: '已过期',
    statusRevoked: '已吊销',
    searchPlaceholder: '搜索邀请码',
    usedCount: '已用 {used}/{max}',
    usesTitle: '使用记录',
    usesColName: '昵称',
    usesColQq: 'QQ',
    usesColTime: '使用时间',
    usesEmpty: '暂无使用记录',
    copy: '复制',
    copied: '已复制',
    revoke: '吊销',
    revokeConfirm: '确定吊销邀请码 {code}？吊销后不可恢复。',
    revoked: '邀请码已吊销',
    empty: '暂无邀请码，先在上方生成一批'
  },

  // ═══ REQ-043 I2: 开张任务卡（后端标记隐藏，前端不靠 localStorage） ═══
  onboarding: {
    title: '开张任务卡',
    subtitle: '开张前先带你逛一遍后台，之后每天用得顺手',
    tourBtn: '跟我逛一遍后台',
    dismiss: '不再提示',
    // 方案 A（2026-08-21）：首页目录开业门槛引导（口径与后端就绪判定一致）
    taskArtwork: '上传至少 1 张作品',
    taskTier: '设置价格（至少 1 个启用画风带尺寸）',
    gateNote: '两项都完成后，你的小店会自动出现在平台首页'
  },

  // ═══ 818-E: 后台分步高亮导览（tour） ═══
  tour: {
    title: '逛逛后台',
    step: '第 {current} / {total} 步',
    skip: '跳过',
    prev: '上一步',
    next: '下一步',
    done: '逛完啦',
    welcome: '每日问候、今日新单和收入都贴在这里。闲着没事可以点一下，偶尔还能在这里找到彩蛋问候。',
    todo: '账本待办把「下一步该做什么」排成一行行按钮，没有目标时可以看这里决定下个任务。',
    queue: '排期看板是你的订单时间线：拖动决定谁先谁后，什么状态、是谁一目了然。',
    manual: '私聊已经聊好？其他平台接的单？把消息粘进这里，QQ、需求、金额都会尽可能识别好。',
    orders: '看板找不到订单？在这里能直接搜所有订单。',
    pricing: '轻松兼容多种画风，更可自由开发分类玩法。增项更能对块内小项单独设置。',
    addons: '加人、加背景、加急、商用等加购项会自动丢增项库，新画风不用再次从头设置。',
    workflow: '流程、什么时候收多少款，每个阶段怎么交流都在这里设置。',
    artworks: '展示作品请在这里上传，能设置备注，也能直接绑定你的画风与档位。',
    toolbox: '记账、导出、水印、算价器，甚至今天吃什么。想要的功能没有？快去给开发者提issue~',
    preferences: '偏好设置是管你看的地方：小到字号、动画速度，大到主页面板开关、快捷按钮。就先从这里开始设置吧！',
    settings: '主页设置管的是客户看到的门面：资料、展示内容与风格都在这调。'
  },

  // ═══ REQ-043 I4: 平台公告（零打扰版：不弹窗不 banner，仅入口小圆点） ═══
  announcement: {
    entry: '公告',
    dialogTitle: '平台公告',
    empty: '暂无公告',
    updatedAt: '更新于 {time}',
    admin: {
      manage: '公告编辑',
      hint: '发布单条最新公告；标题与内容都留空并发布 = 清空公告。画师端只显示入口小圆点，不主动打扰。',
      titleLabel: '标题',
      titlePlaceholder: '公告标题（≤100 字）',
      titleDesc: '公告弹窗内展示的标题',
      contentLabel: '内容',
      contentPlaceholder: '公告内容（≤10000 字）',
      contentDesc: '公告弹窗内展示的正文，留空则不展示',
      publish: '发布',
      published: '公告已发布'
    }
  },
  // 812 工具波 B: 价目分享卡（REQ-014 F3 约稿条 Web 先行简版：模板填空，不做自由拖拽）
  priceCard: {
    title: '价目分享卡',
    subtitle: '填好标题、档位与联系方式，生成竖版价目图或纯文字版，直接发给客户',
    groupEdit: '编辑内容',
    titleLabel: '卡片标题',
    titleDesc: '显示在卡片顶部的大标题',
    titlePlaceholder: '如：头像 · 立绘价目',
    tiersLabel: '档位（3~12 行）',
    tiersDesc: '至少填 3 行完整档位（名称 + 价格）；可导入价格设置里的真实档位',
    tierNamePlaceholder: '档位名称，如：半身像',
    tierPricePlaceholder: '价格（元）',
    tierNotePlaceholder: '一句话说明（选填）',
    addTier: '加一行',
    removeTier: '删除',
    tierMax: '最多 12 行',
    // oimimo 吸纳批三：导入真实档位 / 作品库例图 / 双布局
    importBtn: '导入我的价格',
    importLoading: '导入中…',
    importOk: '已导入 {n} 档',
    importTruncated: '档位较多，已导入前 {n} 档',
    importEmpty: '没找到可导入的价格，请先在价格设置里配置档位',
    importFailed: '导入失败，请重试',
    importConfirmTitle: '导入将覆盖现有档位',
    importConfirm: '当前已填写的档位会被价格设置里的真实档位覆盖，确定导入吗？',
    pickArtworks: '从作品库选',
    pickTitle: '选例图（最多 4 张）',
    pickEmpty: '作品库里还没有作品，先去作品管理发布吧',
    pickFailed: '作品加载失败，请重试',
    pickLimit: '最多选 4 张例图',
    layoutLabel: '海报布局',
    layoutDesc: '菜单长条：一张图看全；画风卡片：一画风一卡，层级更清楚',
    layoutA: '菜单长条',
    layoutB: '画风卡片',
    groupDefault: '未分组',
    rangeFrom: ' 起',
    contactLabel: '联系方式',
    contactDesc: '显示在卡片底部的联系方式',
    contactPlaceholder: '如：QQ 123456 · 私信请备注约稿',
    exampleLabel: '例图（选填）',
    exampleHint: '从作品库勾选或本地选图，最多 4 张，自动缩成小图放进海报',
    chooseExample: '选择图片',
    removeExample: '移除',
    previewLabel: '卡片预览',
    exportPng: '导出 PNG',
    exporting: '生成中…',
    copyText: '复制纯文字版',
    copied: '已复制纯文字版',
    copyFailed: '复制失败，请手动复制',
    titleRequired: '请先填写卡片标题',
    tiersMinRequired: '至少填 3 行完整档位（名称 + 价格）',
    exportFailed: '生成失败，请稍后重试',
    fileTypeError: '请选择图片文件',
    contactLine: '联系：{contact}',
    signText: '拾绘',
    sealText: '拾绘'
  },
  // oimimo 吸纳批五：小票打印机（晒单小票，导 PNG 发社交平台）
  receipt: {
    title: '小票打印机',
    subtitle: '编一张复古小票：制品/赠品/折扣/定金，导出 PNG 发社交平台晒单',
    groupEdit: '编辑内容',
    titleLabel: '小票标题',
    titleDesc: '显示在小票顶部，一般写你的店名或画师名',
    titlePlaceholder: '如：星野的小铺',
    defaultTitle: '约稿小票',
    itemsLabel: '制品明细',
    itemsDesc: '名称 + 数量 + 单价；勾「赠」则划线计 0',
    itemsRequired: '至少填一行完整制品（名称 + 单价）',
    itemNamePlaceholder: '制品名称，如：头像',
    qtyLabel: '数量',
    pricePlaceholder: '单价（元）',
    giftLabel: '赠',
    giftMark: '赠送',
    addItem: '加一行',
    removeItem: '删除',
    discountLabel: '折扣',
    discountDesc: '无折扣 / 打折（如 90 = 九折）/ 直减金额',
    discountNone: '无',
    discountPercent: '打折',
    discountAmount: '直减',
    discountPercentPlaceholder: '如 90 = 九折',
    discountAmountPlaceholder: '直减金额（元）',
    discountLine: '折扣',
    depositLabel: '定金（选填）',
    depositDesc: '填了定金会额外算出尾款',
    depositPlaceholder: '定金（元）',
    depositLine: '定金',
    totalLine: '应收',
    balanceLine: '尾款',
    noteLabel: '底部文案（选填）',
    noteDesc: '如：感谢约稿 · 排期请私信',
    notePlaceholder: '感谢约稿 · 排期请私信',
    styleLabel: '小票样式',
    styleDesc: '复古等宽 / 清爽列表 / 手写文楷',
    styleRetro: '复古',
    styleList: '清爽',
    styleHand: '手写',
    previewLabel: '小票预览',
    exportPng: '导出 PNG',
    exporting: '生成中…',
    exportFailed: '生成失败，请稍后重试',
    copyText: '复制纯文字版',
    copied: '已复制纯文字版',
    copyFailed: '复制失败，请手动复制',
    sealText: '拾绘'
  },
  // 812 工具波 B: 交付检查清单（交稿前自查）
  deliveryChecklist: {
    title: '交付检查清单',
    subtitle: '交稿前逐项自查，全勾即可安心交付',
    addLabel: '添加自查项',
    addDesc: '给清单追加一条自定义自查项',
    progress: '已勾选 {done}/{total}',
    allDone: '全部完成，可以安心交付',
    defaults: {
      finishWatermark: '终稿已去水印样图确认',
      sourceExport: '源文件按约定格式导出',
      signatureConfirmed: '署名约定已确认',
      finalPayment: '尾款已收',
      deliveryScript: '交付话术已准备'
    },
    addPlaceholder: '新增一条自查项…',
    add: '添加',
    remove: '删除'
  },
  // 812 工具波 B: 定金台账（轻量台账，与订单系统零联动）
  deposit: {
    title: '定金台账',
    subtitle: '轻量记录每单定金：未收/已收一眼看清，仅保存在本机浏览器',
    groupAdd: '记一笔',
    pendingTotal: '待收定金总额',
    receivedTotal: '已收定金总额',
    nameLabel: '单名',
    nameDesc: '给这笔定金起个易辨认的名字',
    namePlaceholder: '如：小林 · 立绘定金',
    amountLabel: '定金金额（元）',
    amountDesc: '定金金额，自动换算为分',
    amountPlaceholder: '如 128.50',
    statusLabel: '状态',
    statusDesc: '未收 / 已收，切换后顶部合计即时更新',
    statusPending: '未收',
    statusReceived: '已收',
    dateLabel: '日期',
    dateDesc: '记录日期，默认今天',
    addBtn: '记一笔',
    addSuccess: '已记入定金台账',
    listTitle: '台账明细',
    empty: '还没有定金记录，记下第一笔吧',
    delete: '删除',
    deleteConfirm: '确定删除这条定金记录吗？删除后不可恢复。',
    deleteSuccess: '已删除',
    nameRequired: '请填写单名',
    amountRequired: '请输入定金金额',
    amountPositive: '定金金额须大于 0',
    dateRequired: '请选择日期'
  },
  // b4-10: 消息解析线索显示（zh/en 各自日期格式）；820 补全：月日前/完整年月日
  messageParser: {
    deadlineDay: '{day}号前',
    deadlineDate: '{month}月{day}日',
    deadlineDateBefore: '{month}月{day}日前',
    deadlineFullDate: '{year}年{month}月{day}日'
  }
}
